"""
Voice connection and DM call handling.
Audio data is exchanged as base64-encoded PCM over the NDJSON channel.
Speaking detection and audio receiving use a custom VoiceClient subclass
that hooks into the voice WebSocket and UDP socket.
Noise gate is applied to outgoing mic audio (gate uses unboosted level).
"""

from __future__ import annotations

import asyncio
import base64
import collections
import json
import math
import os
import struct
import sys
import threading
import traceback
from typing import Any, Dict, Optional, Tuple

import discord
import nacl.bindings
from discord.gateway import DiscordVoiceWebSocket
from discord.voice_state import VoiceConnectionState

from .protocol import send_event, stdout_lock

_opus_loaded = False


def _ensure_opus() -> None:
    global _opus_loaded
    if _opus_loaded or discord.opus.is_loaded():
        _opus_loaded = True
        return
    try:
        import pyogg
        opus_path = os.path.join(os.path.dirname(pyogg.__file__), "opus.dll" if sys.platform == "win32" else "libopus.so")
        if os.path.isfile(opus_path):
            discord.opus.load_opus(opus_path)
            _opus_loaded = True
            print("[voice] Opus loaded from PyOgg bundle", file=sys.stderr)
            return
    except Exception:
        pass
    for name in ("opus", "libopus", "libopus-0"):
        try:
            discord.opus.load_opus(name)
            _opus_loaded = True
            print(f"[voice] Opus loaded: {name}", file=sys.stderr)
            return
        except Exception:
            pass
    print("[voice] WARNING: Opus not found — incoming audio will not be decoded", file=sys.stderr)


# Reusable 24-byte nonce buffer — the SocketReader is single-threaded so
# no thread-local is required.
_NONCE_BUF = bytearray(24)


def _write_audio_event_sync(user_id: str, pcm_b64: str) -> None:
    """Write a voiceAudioData event to stdout from any thread.

    Uses the shared stdout_lock from protocol so audio events never
    interleave with async write_message() calls.
    """
    line = json.dumps(
        {"type": "event", "name": "voiceAudioData",
         "data": {"userId": user_id, "pcm": pcm_b64}},
        separators=(",", ":"),
    )
    raw = (line + "\n").encode("utf-8")
    with stdout_lock:
        sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()


class _AudioReceiver:
    """Receives encrypted RTP packets from the voice UDP socket,
    decrypts them, decodes opus → PCM, and emits voiceAudioData events.

    Designed for both 1:1 DM calls and multi-user guild voice channels.
    """

    def __init__(self, bridge: VoiceBridge) -> None:
        self._bridge = bridge
        self._ssrc_to_user: Dict[int, str] = {}
        self._decoders: Dict[int, discord.opus.Decoder] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._known_peers: set[str] = set()
        self._self_ssrc: Optional[int] = None
        self._is_dm = False

        # Cached crypto state — avoids re-creating every packet
        self._cached_key: Optional[bytes] = None
        self._cached_mode: Optional[str] = None

        # Counters
        self._pkt_count = 0
        self._rtp_count = 0
        self._decode_ok = 0
        self._decrypt_fail = 0
        self._aead_fail = 0

    def set_self_ssrc(self, ssrc: int) -> None:
        self._self_ssrc = ssrc

    def set_dm_mode(self, is_dm: bool) -> None:
        self._is_dm = is_dm

    def add_known_peer(self, user_id: str) -> None:
        self._known_peers.add(user_id)

    def remove_known_peer(self, user_id: str) -> None:
        self._known_peers.discard(user_id)

    def set_ssrc(self, ssrc: int, user_id: str) -> None:
        self._ssrc_to_user[ssrc] = user_id

    def _resolve_user(self, ssrc: int) -> Optional[str]:
        """Resolve SSRC → user ID.

        Auto-mapping of unknown SSRCs is only done in DM calls where
        exactly one peer is known.  In guild voice channels we always
        wait for the SPEAKING event so different users don't get
        mis-attributed.
        """
        uid = self._ssrc_to_user.get(ssrc)
        if uid:
            return uid

        if self._self_ssrc is not None and ssrc == self._self_ssrc:
            return None

        if self._is_dm and len(self._known_peers) == 1:
            peer_id = next(iter(self._known_peers))
            self._ssrc_to_user[ssrc] = peer_id
            print(f"[voice-rx] Auto-mapped ssrc={ssrc} -> user={peer_id}", file=sys.stderr)
            return peer_id

        return None

    def _get_decoder(self, ssrc: int) -> discord.opus.Decoder:
        dec = self._decoders.get(ssrc)
        if dec is None:
            dec = discord.opus.Decoder()
            self._decoders[ssrc] = dec
        return dec

    # ------------------------------------------------------------------ #
    #  Hot path — called once per UDP packet on the SocketReader thread   #
    # ------------------------------------------------------------------ #

    def on_udp_packet(self, data: bytes) -> None:
        self._pkt_count += 1

        if len(data) < 13:
            return

        # Fast RTP validity check (version=2, PT=120)
        b0 = data[0]
        if (b0 >> 6) != 2 or (data[1] & 0x7F) != 0x78:
            return

        self._rtp_count += 1
        ssrc = struct.unpack_from(">I", data, 8)[0]
        user_id = self._resolve_user(ssrc)
        if not user_id:
            return

        bridge = self._bridge
        if bridge._self_deafened or user_id in bridge._user_muted:
            return

        vc = bridge._voice_client
        if not vc:
            return
        sk = vc.secret_key
        if sk is discord.utils.MISSING:
            return

        # Cache the key bytes so we don't call bytes() 50×/s per user
        key = self._cached_key
        if key is None or sk is not getattr(self, "_cached_sk_ref", None):
            key = bytes(sk)
            self._cached_key = key
            self._cached_sk_ref = sk
            self._cached_mode = vc.mode

        try:
            opus_data = self._decrypt_fast(data, b0, key, self._cached_mode or vc.mode)
        except Exception:
            self._decrypt_fail += 1
            if self._decrypt_fail <= 5:
                import traceback as _tb
                _tb.print_exc(file=sys.stderr)
            return

        if opus_data is None:
            self._decrypt_fail += 1
            if self._decrypt_fail <= 3:
                print(f"[voice-rx] Decryption failed ssrc={ssrc} (#{self._decrypt_fail})", file=sys.stderr)
            return

        # Optional DAVE (E2EE) layer
        conn_state = getattr(vc, "_connection", None)
        if conn_state:
            ds = getattr(conn_state, "dave_session", None)
            if ds and getattr(conn_state, "can_encrypt", False):
                try:
                    opus_data = ds.decrypt_opus(opus_data)
                except Exception:
                    return

        if not discord.opus.is_loaded():
            return

        pcm = self._get_decoder(ssrc).decode(opus_data)

        vol = bridge._user_volumes.get(user_id)
        if vol is not None and vol != 1.0:
            pcm = _apply_volume_fast(pcm, vol)

        # Write directly to stdout — avoids asyncio task scheduling
        # overhead which is the primary cause of choppy audio.
        pcm_b64 = base64.b64encode(pcm).decode("ascii")
        _write_audio_event_sync(user_id, pcm_b64)

        self._decode_ok += 1
        if self._decode_ok <= 3 or self._decode_ok % 500 == 0:
            print(f"[voice-rx] PCM #{self._decode_ok}: ssrc={ssrc} user={user_id}", file=sys.stderr)

    # ------------------------------------------------------------------ #

    def _decrypt_fast(self, data: bytes, b0: int, key: bytes, mode: str) -> Optional[bytes]:
        """Optimised decryption with minimal allocations."""
        cc = b0 & 0x0F
        has_ext = bool(b0 & 0x10)
        ext_hdr_len = (16 if has_ext else 12) + cc * 4

        if len(data) <= ext_hdr_len + 4:
            return None

        nonce = _NONCE_BUF
        nonce[:4] = data[-4:]
        # bytes 4-23 are already zero from initialisation

        ct = data[ext_hdr_len:-4]
        aad = data[:ext_hdr_len]

        if mode == "aead_xchacha20_poly1305_rtpsize":
            plaintext = nacl.bindings.crypto_aead_xchacha20poly1305_ietf_decrypt(
                ct, aad, bytes(nonce), key
            )
            if has_ext:
                skip = struct.unpack_from(">H", data, 12 + cc * 4 + 2)[0] * 4
                if skip and skip < len(plaintext):
                    plaintext = plaintext[skip:]
            return plaintext

        elif mode == "xsalsa20_poly1305":
            nonce[:12] = data[:12]
            return nacl.bindings.crypto_secretbox_xsalsa20poly1305_open(
                data[12:], bytes(nonce), key
            )

        elif mode == "xsalsa20_poly1305_lite":
            payload = data[12:]
            nonce[:4] = payload[-4:]
            return nacl.bindings.crypto_secretbox_xsalsa20poly1305_open(
                payload[:-4], bytes(nonce), key
            )

        elif mode == "xsalsa20_poly1305_suffix":
            payload = data[12:]
            return nacl.bindings.crypto_secretbox_xsalsa20poly1305_open(
                payload[:-24], payload[-24:], key
            )

        return None

    def cleanup(self) -> None:
        self._ssrc_to_user.clear()
        self._decoders.clear()
        self._known_peers.clear()
        self._self_ssrc = None
        self._cached_key = None
        self._cached_mode = None


class _BridgeVoiceClient(discord.VoiceClient):
    """Custom VoiceClient that intercepts SPEAKING events and receives audio."""

    _bridge: Optional[VoiceBridge] = None
    _receiver: Optional[_AudioReceiver] = None

    def create_connection_state(self) -> VoiceConnectionState:
        return VoiceConnectionState(self, hook=self._ws_hook)

    async def _ws_hook(self, ws: DiscordVoiceWebSocket, msg: Dict[str, Any]) -> None:
        op = msg.get("op")
        data = msg.get("d", {})

        if op == DiscordVoiceWebSocket.SPEAKING:
            user_id = data.get("user_id")
            ssrc = data.get("ssrc")
            speaking = data.get("speaking", 0)
            print(f"[voice-ws] SPEAKING: user={user_id} ssrc={ssrc} speaking={speaking}", file=sys.stderr)

            if ssrc and user_id and self._receiver:
                self._receiver.set_ssrc(int(ssrc), str(user_id))

            if user_id and self._bridge:
                is_speaking = bool(speaking & 1)
                asyncio.get_event_loop().create_task(
                    self._bridge._handle_speaking(str(user_id), is_speaking)
                )

        elif op == DiscordVoiceWebSocket.CLIENTS_CONNECT:
            # data = {'user_ids': ['123', '456']}
            user_ids = data.get("user_ids", [])
            print(f"[voice-ws] CLIENTS_CONNECT: users={user_ids}", file=sys.stderr)
            if self._bridge and self._receiver:
                for uid in user_ids:
                    self._receiver.add_known_peer(str(uid))
                    asyncio.get_event_loop().create_task(
                        send_event("peerJoinedVoice", {
                            "userId": str(uid),
                            "channelId": self._bridge._current_channel_id,
                        })
                    )

        elif op == DiscordVoiceWebSocket.CLIENT_DISCONNECT:
            # data = {'user_id': '123'}
            user_id = data.get("user_id")
            print(f"[voice-ws] CLIENT_DISCONNECT: user={user_id}", file=sys.stderr)
            if user_id and self._bridge:
                if self._receiver:
                    self._receiver.remove_known_peer(str(user_id))
                asyncio.get_event_loop().create_task(
                    send_event("peerLeftVoice", {
                        "userId": str(user_id),
                        "channelId": self._bridge._current_channel_id,
                    })
                )


class VoiceBridge:
    """Manages Discord voice connections and DM calls via discord.py-self."""

    def __init__(self) -> None:
        self._voice_client: Optional[discord.VoiceClient] = None
        self._current_channel_id: Optional[str] = None
        self._current_guild_id: Optional[str] = None
        self._self_user_id: Optional[str] = None
        self._self_muted = False
        self._self_deafened = False
        self._input_volume = 1.0
        self._user_volumes: dict[str, float] = {}
        self._user_muted: set[str] = set()
        self._speaking_users: set[str] = set()
        self._call_state: str = "idle"
        self._call_channel_id: Optional[str] = None
        self._audio_source: Optional[_PCMStreamSource] = None
        self._audio_receiver: Optional[_AudioReceiver] = None
        self._noise_gate_db: float = -40.0
        self._gate_release_remaining_sec: float = 0.0

    @property
    def current_channel_id(self) -> Optional[str]:
        return self._current_channel_id

    @property
    def current_guild_id(self) -> Optional[str]:
        return self._current_guild_id

    @property
    def call_state(self) -> str:
        return self._call_state

    @property
    def call_channel_id(self) -> Optional[str]:
        return self._call_channel_id

    async def _handle_speaking(self, user_id: str, is_speaking: bool) -> None:
        was_speaking = user_id in self._speaking_users
        if is_speaking and not was_speaking:
            self._speaking_users.add(user_id)
            await send_event("voiceSpeaking", {"userId": user_id, "speaking": True})
        elif not is_speaking and was_speaking:
            self._speaking_users.discard(user_id)
            await send_event("voiceSpeaking", {"userId": user_id, "speaking": False})

    async def join(self, client: discord.Client, channel_id: str, ring: bool = False) -> bool:
        """Join a voice channel. For DMs, set ring=True to ring the recipient."""
        if self._current_channel_id:
            await self.leave()

        try:
            _ensure_opus()
            self._self_user_id = str(client.user.id) if client.user else None

            channel = client.get_channel(int(channel_id))
            if channel is None:
                print(f"[voice] Channel not found: {channel_id}", file=sys.stderr)
                return False

            if not isinstance(channel, (discord.VoiceChannel, discord.StageChannel, discord.DMChannel, discord.GroupChannel)):
                print(f"[voice] Not a voice-capable channel: {type(channel)}", file=sys.stderr)
                return False

            guild_id = str(channel.guild.id) if hasattr(channel, "guild") and channel.guild else None
            channel_name = getattr(channel, "name", None)
            if not channel_name and isinstance(channel, discord.DMChannel) and channel.recipient:
                channel_name = channel.recipient.name
            channel_name = channel_name or "DM Call"

            self._audio_receiver = _AudioReceiver(self)
            self._audio_receiver._loop = asyncio.get_event_loop()

            _BridgeVoiceClient._bridge = self
            _BridgeVoiceClient._receiver = self._audio_receiver

            is_dm = isinstance(channel, (discord.DMChannel, discord.GroupChannel))
            self._audio_receiver.set_dm_mode(is_dm)
            if is_dm:
                vc = await channel.connect(cls=_BridgeVoiceClient, ring=ring)
            else:
                vc = await channel.connect(cls=_BridgeVoiceClient)

            if not vc:
                return False

            self._voice_client = vc
            self._current_channel_id = channel_id
            self._current_guild_id = guild_id

            self._setup_audio(vc)

            # Register socket listener for incoming audio
            try:
                conn = vc._connection if hasattr(vc, "_connection") else None
                if conn:
                    conn.add_socket_listener(self._audio_receiver.on_udp_packet)
                    # Set our own SSRC so we can filter it out
                    if hasattr(vc, "ssrc") and vc.ssrc is not discord.utils.MISSING:
                        self._audio_receiver.set_self_ssrc(vc.ssrc)
                        print(f"[voice] Audio receiver registered, self_ssrc={vc.ssrc}", file=sys.stderr)
                    else:
                        print("[voice] Audio receiver registered (self_ssrc unknown)", file=sys.stderr)
            except Exception as e:
                print(f"[voice] Failed to register audio receiver: {e}", file=sys.stderr)

            await send_event("voiceJoined", {
                "channelId": channel_id,
                "guildId": guild_id,
                "channelName": channel_name,
            })

            return True
        except Exception as e:
            print(f"[voice] Failed to join: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return False

    async def start_call(self, client: discord.Client, channel_id: str) -> bool:
        """Start a DM call: connect to voice with ring=True."""
        try:
            channel = client.get_channel(int(channel_id))
            if not channel or not isinstance(channel, (discord.DMChannel, discord.GroupChannel)):
                return False

            self._call_state = "outgoing"
            self._call_channel_id = channel_id
            await send_event("callOutgoing", {"channelId": channel_id})

            joined = await self.join(client, channel_id, ring=True)
            if not joined:
                self._call_state = "idle"
                self._call_channel_id = None
                await send_event("callEnded", {"channelId": channel_id})
                return False

            return True
        except Exception as e:
            print(f"[voice] Failed to start call: {e}", file=sys.stderr)
            self._call_state = "idle"
            self._call_channel_id = None
            await send_event("callEnded", {"channelId": channel_id})
            return False

    async def accept_call(self, client: discord.Client, channel_id: str) -> bool:
        """Accept an incoming call: connect without ringing."""
        try:
            joined = await self.join(client, channel_id, ring=False)
            if not joined:
                return False
            self._call_state = "active"
            self._call_channel_id = channel_id
            await send_event("callActive", {"channelId": channel_id})
            return True
        except Exception as e:
            print(f"[voice] Failed to accept call: {e}", file=sys.stderr)
            return False

    async def decline_call(self, client: discord.Client, channel_id: str) -> None:
        """Decline an incoming call."""
        try:
            channel = client.get_channel(int(channel_id))
            if channel and isinstance(channel, (discord.DMChannel, discord.GroupChannel)):
                await channel.decline()
        except Exception as e:
            print(f"[voice] Decline failed (non-fatal): {e}", file=sys.stderr)
        self._call_state = "idle"
        self._call_channel_id = None
        await send_event("callEnded", {"channelId": channel_id})

    def set_call_state(self, state: str, channel_id: Optional[str]) -> None:
        self._call_state = state
        self._call_channel_id = channel_id

    async def leave(self) -> None:
        self._cleanup_audio()

        if self._voice_client:
            # Unregister socket listener before disconnecting
            if self._audio_receiver:
                try:
                    conn = self._voice_client._connection if hasattr(self._voice_client, "_connection") else None
                    if conn:
                        conn.remove_socket_listener(self._audio_receiver.on_udp_packet)
                except Exception:
                    pass
                self._audio_receiver.cleanup()
                self._audio_receiver = None

            try:
                await self._voice_client.disconnect(force=True)
            except Exception:
                pass

        was_in_channel = self._current_channel_id is not None
        was_in_call = self._call_state != "idle"
        call_ch_id = self._call_channel_id

        self._voice_client = None
        self._current_channel_id = None
        self._current_guild_id = None
        self._self_muted = False
        self._self_deafened = False
        self._speaking_users.clear()

        if was_in_call:
            self._call_state = "idle"
            self._call_channel_id = None
            await send_event("callEnded", {"channelId": call_ch_id})

        if was_in_channel:
            await send_event("voiceLeft", None)

    def set_self_mute(self, muted: bool) -> None:
        self._self_muted = muted

    def set_self_deafen(self, deafened: bool) -> None:
        self._self_deafened = deafened

    def set_input_volume(self, volume: float) -> None:
        self._input_volume = max(0.0, min(2.0, volume))

    def get_input_volume(self) -> float:
        return self._input_volume

    def set_user_volume(self, user_id: str, volume: float) -> None:
        self._user_volumes[user_id] = max(0.0, min(2.0, volume))

    def get_user_volume(self, user_id: str) -> float:
        return self._user_volumes.get(user_id, 1.0)

    def set_user_muted(self, user_id: str, muted: bool) -> None:
        if muted:
            self._user_muted.add(user_id)
        else:
            self._user_muted.discard(user_id)

    def get_user_muted(self, user_id: str) -> bool:
        return user_id in self._user_muted

    def set_noise_gate_db(self, db: float) -> None:
        self._noise_gate_db = max(-60.0, min(0.0, float(db)))

    def receive_audio_chunk(self, pcm_b64: str) -> None:
        """Called from the stdin reader thread. Gate + volume + feed directly."""
        if self._self_muted or not self._audio_source:
            return
        try:
            pcm = base64.b64decode(pcm_b64)
            pcm, self._gate_release_remaining_sec = _apply_noise_gate_with_release(
                pcm, self._noise_gate_db, self._gate_release_remaining_sec
            )
            if self._input_volume != 1.0:
                pcm = _apply_volume_fast(pcm, self._input_volume)
            self._audio_source.feed(pcm)
        except Exception:
            pass

    def _setup_audio(self, vc: discord.VoiceClient) -> None:
        self._audio_source = _PCMStreamSource()
        try:
            vc.play(self._audio_source)
        except Exception as e:
            print(f"[voice] Failed to start audio playback: {e}", file=sys.stderr)

    def _cleanup_audio(self) -> None:
        self._gate_release_remaining_sec = 0.0
        if self._voice_client:
            try:
                self._voice_client.stop()
            except Exception:
                pass
        self._audio_source = None


class _PCMStreamSource(discord.AudioSource):
    """AudioSource fed by the stdin reader thread and read by the discord player thread.

    Uses a deque of exactly-3840-byte frames so read() is O(1) (no memmove).
    A small partial-byte buffer handles non-frame-aligned incoming chunks.
    maxlen on the deque auto-discards oldest frames on overflow.
    """

    FRAME_SIZE = 3840  # 20ms of 48kHz 16-bit stereo
    _MAX_FRAMES = 50   # ~1s headroom
    _SILENCE = b"\x00" * FRAME_SIZE

    def __init__(self) -> None:
        self._frames: collections.deque = collections.deque(maxlen=self._MAX_FRAMES)
        self._partial = bytearray()
        self._lock = threading.Lock()

    def feed(self, data: bytes) -> None:
        with self._lock:
            self._partial.extend(data)
            fs = self.FRAME_SIZE
            while len(self._partial) >= fs:
                self._frames.append(bytes(self._partial[:fs]))
                del self._partial[:fs]

    def read(self) -> bytes:
        with self._lock:
            if self._frames:
                return self._frames.popleft()
        return self._SILENCE

    def is_opus(self) -> bool:
        return False

    def cleanup(self) -> None:
        with self._lock:
            self._frames.clear()
            self._partial.clear()


def _apply_volume_fast(buf: bytes, volume: float) -> bytes:
    """Scale 16-bit LE PCM samples by *volume*. Uses struct for C-speed unpack/pack."""
    n = len(buf) >> 1
    if n == 0:
        return buf
    fmt = f"<{n}h"
    raw = struct.unpack(fmt, buf)
    v = int(volume * 256)
    return struct.pack(fmt, *(max(-32768, min(32767, (s * v) >> 8)) for s in raw))


# --- Noise gate: 16-bit stereo PCM -> RMS in dB; gate below threshold with release ---
_GATE_RELEASE_SEC = 0.35  # Keep gate open briefly after level drops so sentence endings aren't clipped
_GATE_SILENCE_BUF = b"\x00" * 32768  # Pre-allocated; covers chunks up to 4096-sample stereo

def _pcm_stereo_rms_dbfs(pcm: bytes) -> float:
    """Compute RMS of 16-bit LE stereo PCM, return dB FS. Uses struct.unpack + sum() for speed."""
    n = len(pcm) >> 1
    if n == 0:
        return -100.0
    raw = struct.unpack(f"<{n}h", pcm)
    sum_sq = sum(s * s for s in raw)
    if sum_sq == 0:
        return -100.0
    rms_sq = sum_sq / (n * 1073741824.0)  # 32768^2
    return 10.0 * math.log10(rms_sq) if rms_sq > 1e-20 else -100.0


def _chunk_duration_sec(pcm: bytes) -> float:
    """Duration in seconds of 48kHz 16-bit stereo PCM."""
    return len(pcm) / (48000.0 * 4.0)


def _apply_noise_gate_with_release(
    pcm: bytes, threshold_db: float, release_remaining_sec: float
) -> Tuple[bytes, float]:
    """Apply noise gate with release: keep passing audio for release_remaining_sec after level drops.
    Returns (output_pcm, next_release_remaining_sec)."""
    if threshold_db <= -59.0:
        return pcm, 0.0
    duration_sec = _chunk_duration_sec(pcm)
    db = _pcm_stereo_rms_dbfs(pcm)
    if db >= threshold_db:
        return pcm, _GATE_RELEASE_SEC
    if release_remaining_sec > 0:
        release_remaining_sec = max(0.0, release_remaining_sec - duration_sec)
        return pcm, release_remaining_sec
    if len(pcm) <= len(_GATE_SILENCE_BUF):
        return _GATE_SILENCE_BUF[:len(pcm)], 0.0
    return b"\x00" * len(pcm), 0.0


voice_bridge = VoiceBridge()
