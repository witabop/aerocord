"""
NDJSON protocol layer for communication with the Electron main process.

Messages flow over stdin (incoming requests) and stdout (outgoing responses/events).
stderr is reserved for logging only.
"""

import asyncio
import concurrent.futures
import json
import sys
import threading
import traceback
from typing import Any, Callable, Coroutine

# Threading lock for stdout — shared by write_message (via its dedicated
# executor thread) and _write_audio_event_sync (SocketReader thread) so
# NDJSON lines never interleave on the pipe.
stdout_lock = threading.Lock()

# Dedicated single-thread executor for write_message so it never competes
# with the default pool that stdin_reader uses for _blocking_readline.
_stdout_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="stdout-wr"
)


def _write_raw(raw: bytes) -> None:
    with stdout_lock:
        sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()


async def write_message(msg: dict) -> None:
    """Write a single NDJSON line to stdout.

    Runs on a dedicated single-thread executor so the event loop is never
    blocked on ``stdout_lock``, and the default thread pool (used by
    ``stdin_reader`` for readline) is never starved.
    """
    line = json.dumps(msg, separators=(",", ":"), default=str) + "\n"
    raw = line.encode("utf-8")
    await asyncio.get_event_loop().run_in_executor(_stdout_executor, _write_raw, raw)


async def send_response(request_id: str, result: Any = None) -> None:
    await write_message({"type": "response", "id": request_id, "result": result})


async def send_error(request_id: str, error: str) -> None:
    await write_message({"type": "response", "id": request_id, "error": error})


async def send_event(name: str, data: Any = None) -> None:
    await write_message({"type": "event", "name": name, "data": data})


MethodHandler = Callable[..., Coroutine[Any, Any, Any]]


class JsonRpcRouter:
    """Routes incoming NDJSON requests to registered async handler functions."""

    def __init__(self) -> None:
        self._handlers: dict[str, MethodHandler] = {}

    def register(self, method: str, handler: MethodHandler) -> None:
        self._handlers[method] = handler

    async def handle(self, msg: dict) -> None:
        request_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params", {})

        handler = self._handlers.get(method)
        if handler is None:
            if request_id:
                await send_error(request_id, f"Unknown method: {method}")
            return

        try:
            if isinstance(params, dict):
                result = await handler(**params)
            elif isinstance(params, list):
                result = await handler(*params)
            else:
                result = await handler(params)

            if request_id:
                await send_response(request_id, result)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            if request_id:
                await send_error(request_id, str(exc))

    async def _fire_and_forget(self, msg: dict) -> None:
        """Handle a message without sending a response."""
        method = msg.get("method", "")
        params = msg.get("params", {})
        handler = self._handlers.get(method)
        if handler is None:
            return
        try:
            if isinstance(params, dict):
                await handler(**params)
            elif isinstance(params, list):
                await handler(*params)
            else:
                await handler(params)
        except Exception:
            traceback.print_exc(file=sys.stderr)


_audio_chunk_handler: Any = None


def set_audio_chunk_handler(handler: Any) -> None:
    """Register a synchronous handler for voiceAudioChunk messages.

    The handler is called directly in the stdin reader thread so audio
    never waits for the event loop to schedule it.
    """
    global _audio_chunk_handler
    _audio_chunk_handler = handler


def _blocking_readline() -> str | None:
    """Read lines from stdin. Audio chunks are handled inline in the reader
    thread to avoid event-loop scheduling delay; only non-audio lines are
    returned to the caller."""
    while True:
        try:
            line = sys.stdin.buffer.readline()
            if not line:
                return None
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
        except (EOFError, OSError):
            return None

        if _audio_chunk_handler and '"voiceAudioChunk"' in text:
            try:
                msg = json.loads(text)
                if msg.get("method") == "voiceAudioChunk":
                    pcm = msg.get("params", {}).get("pcm")
                    if pcm:
                        _audio_chunk_handler(pcm)
                    continue
            except Exception:
                pass

        return text


async def stdin_reader(router: JsonRpcRouter) -> None:
    """Read NDJSON lines from stdin via a thread and dispatch to the router.
    Audio chunks are handled entirely in the reader thread and never reach here."""
    loop = asyncio.get_event_loop()

    while True:
        line_str = await loop.run_in_executor(None, _blocking_readline)
        if line_str is None:
            break
        if not line_str:
            continue
        try:
            msg = json.loads(line_str)
        except json.JSONDecodeError:
            print(f"[bridge] Invalid JSON: {line_str}", file=sys.stderr)
            continue

        msg_type = msg.get("type", "request")
        if msg_type == "fire" or not msg.get("id"):
            asyncio.create_task(router._fire_and_forget(msg))
        else:
            asyncio.create_task(router.handle(msg))
