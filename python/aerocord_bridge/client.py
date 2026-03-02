"""
Discord client wrapper using discord.py-self.
Mirrors the API surface of the original TypeScript DiscordClientWrapper.
"""

from __future__ import annotations

import asyncio
import json
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import discord

from .serializers import (
    user_to_vm,
    member_to_vm,
    message_to_vm,
    channel_to_vm,
    resolve_user_presence,
    _avatar_url,
)


_CACHE_DIR = Path.home() / ".aerocord"
_MEMBER_CACHE_FILE = _CACHE_DIR / "member_cache.json"
_CACHE_MAX_AGE_HOURS = 72
_CACHE_MAX_GUILDS = 50


class DiscordBridgeClient:
    def __init__(self) -> None:
        self._client: Optional[discord.Client] = None
        self._ready = False
        self._desired_status: str = "online"
        self._custom_status_text: Optional[str] = None
        self._events_registered = False
        self._unchunkable_guilds: set[int] = set()
        self._seeded_guilds: set[int] = set()
        self._member_query_progress: dict[int, int] = {}
        self._member_id_cache: dict[int, dict] = self._load_member_cache()
        self._prefetched_authors: set[int] = set()
        self._profile_cache: dict[int, tuple[dict, float]] = {}

    @staticmethod
    def _load_member_cache() -> dict[int, dict]:
        try:
            if not _MEMBER_CACHE_FILE.exists():
                return {}
            raw = json.loads(_MEMBER_CACHE_FILE.read_text(encoding="utf-8"))
            now = datetime.now(timezone.utc)
            result: dict[int, dict] = {}
            for gid_str, entry in raw.items():
                updated = datetime.fromisoformat(entry["updated_at"])
                if (now - updated).total_seconds() < _CACHE_MAX_AGE_HOURS * 3600:
                    result[int(gid_str)] = entry
            return result
        except Exception:
            return {}

    def _save_member_cache(self) -> None:
        try:
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            out: dict[str, dict] = {}
            items = sorted(self._member_id_cache.items(), key=lambda kv: kv[1].get("updated_at", ""), reverse=True)
            for gid, entry in items[:_CACHE_MAX_GUILDS]:
                out[str(gid)] = entry
            _MEMBER_CACHE_FILE.write_text(json.dumps(out), encoding="utf-8")
        except Exception:
            pass

    def _cache_guild_members(self, guild: Any) -> None:
        member_ids = [m.id for m in guild.members]
        if not member_ids:
            return
        self._member_id_cache[guild.id] = {
            "member_ids": member_ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._save_member_cache()

    @property
    def client(self) -> Optional[discord.Client]:
        return self._client

    @property
    def ready(self) -> bool:
        return self._ready

    async def login(self, token: str, status: str = "online") -> str:
        try:
            if self._client is not None:
                try:
                    await self._client.close()
                except Exception:
                    pass
                self._client = None

            status_mapping = {
                "Online": "online",
                "Idle": "idle",
                "DoNotDisturb": "dnd",
                "Invisible": "invisible",
            }
            self._desired_status = status_mapping.get(status, "online")
            self._custom_status_text = None

            self._client = discord.Client(
                status=discord.Status.try_value(self._desired_status),
                chunk_guilds_at_startup=False,
            )
            self._ready = False
            self._events_registered = False

            ready_event = asyncio.Event()
            login_result: dict[str, str] = {"status": "unknown"}

            @self._client.event
            async def on_ready() -> None:
                self._ready = True
                login_result["status"] = "success"
                print(f"[bridge] Discord client ready as {self._client.user}", file=sys.stderr)
                ready_event.set()

                await asyncio.sleep(2)
                try:
                    await self._sync_presence()
                except Exception as e:
                    print(f"[bridge] Initial presence sync failed: {e}", file=sys.stderr)

            async def _start_client() -> None:
                try:
                    await self._client.start(token)
                except discord.LoginFailure:
                    login_result["status"] = "unauthorized"
                    ready_event.set()
                except discord.HTTPException as e:
                    if e.status == 400:
                        login_result["status"] = "badRequest"
                    elif e.status >= 500:
                        login_result["status"] = "serverError"
                    else:
                        login_result["status"] = "unknown"
                    ready_event.set()
                except Exception as e:
                    print(f"[bridge] Login exception: {e}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                    msg = str(e).lower()
                    if "unauthorized" in msg or "token" in msg or "401" in msg:
                        login_result["status"] = "unauthorized"
                    elif "bad request" in msg or "400" in msg:
                        login_result["status"] = "badRequest"
                    elif "500" in msg or "server" in msg:
                        login_result["status"] = "serverError"
                    else:
                        login_result["status"] = "unknown"
                    ready_event.set()

            asyncio.create_task(_start_client())

            try:
                await asyncio.wait_for(ready_event.wait(), timeout=30)
            except asyncio.TimeoutError:
                print("[bridge] Login timed out after 30s", file=sys.stderr)
                return "unknown"

            return login_result["status"]
        except Exception as e:
            print(f"[bridge] Login exception: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return "unknown"

    async def logout(self) -> None:
        self._ready = False
        self._unchunkable_guilds.clear()
        self._seeded_guilds.clear()
        self._member_query_progress.clear()
        self._prefetched_authors.clear()
        self._profile_cache.clear()
        if self._client:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None

    async def _resolve_channel(self, channelId: str) -> Any:
        ch = self._client.get_channel(int(channelId))
        if ch is None:
            ch = await self._client.fetch_channel(int(channelId))
        return ch

    def get_current_user(self) -> Optional[dict]:
        if not self._client or not self._client.user:
            return None
        u = self._client.user
        return {
            "id": str(u.id),
            "name": u.display_name or u.name,
            "username": u.name,
            "avatar": _avatar_url(u, 128),
            "presence": resolve_user_presence(self._client, u.id),
        }

    def get_status_for_overlay(self) -> str:
        user = self.get_current_user()
        if not user:
            return "Online"
        status = user.get("presence", {}).get("status", "Online")
        if status in ("Online", "Idle", "DoNotDisturb", "Offline", "Invisible"):
            return "Offline" if status == "Invisible" else status
        return "Online"

    async def set_status(self, status: str) -> None:
        if not self._client or not self._client.user:
            return
        mapping = {
            "Online": "online",
            "Idle": "idle",
            "DoNotDisturb": "dnd",
            "Invisible": "invisible",
        }
        self._desired_status = mapping.get(status, "online")
        await self._sync_presence()

    async def set_custom_status(self, text: Optional[str]) -> None:
        if not self._client or not self._client.user:
            return
        self._custom_status_text = text.strip() if text else None
        await self._sync_presence()

    async def _sync_presence(self) -> None:
        if not self._client or not self._client.user:
            return

        status = self._desired_status
        payload: dict[str, Any] = {"status": status}

        if self._custom_status_text:
            payload["custom_status"] = {
                "text": self._custom_status_text,
                "emoji_name": None,
                "expires_at": None,
            }
        else:
            payload["custom_status"] = None

        try:
            await self._client.http.request(
                discord.http.Route("PATCH", "/users/@me/settings"),
                json=payload,
            )
        except Exception as e:
            print(f"[bridge] Failed to update presence: {e}", file=sys.stderr)

    def get_private_channels(self) -> list[dict]:
        if not self._client:
            return []

        items: list[dict] = []
        for ch in self._client.private_channels:
            if isinstance(ch, discord.DMChannel):
                recipient = ch.recipient
                if not recipient:
                    continue
                name = getattr(recipient, "display_name", None) or recipient.name
                image = _avatar_url(recipient, 32)
                presence = resolve_user_presence(self._client, recipient.id)
                items.append({
                    "id": str(ch.id),
                    "recipientId": str(recipient.id),
                    "name": name,
                    "presence": presence,
                    "lastMsgId": str(ch.last_message_id) if ch.last_message_id else str(ch.id),
                    "isGroupChat": False,
                    "recipientCount": 2,
                    "image": image,
                })
            elif isinstance(ch, discord.GroupChannel):
                recipients = ch.recipients or []
                name = ch.name or ", ".join(
                    getattr(r, "display_name", None) or r.name for r in recipients
                ) or "Group Chat"

                image = None
                if ch.icon:
                    image = str(ch.icon.url)

                any_online = any(
                    resolve_user_presence(self._client, r.id).get("status") != "Offline"
                    for r in recipients
                )
                presence = {"status": "Online" if any_online else "Offline", "presence": "", "type": ""}

                items.append({
                    "id": str(ch.id),
                    "name": name,
                    "presence": presence,
                    "lastMsgId": str(ch.last_message_id) if ch.last_message_id else str(ch.id),
                    "isGroupChat": True,
                    "recipientCount": len(recipients) + 1,
                    "image": image,
                })

        items.sort(key=lambda x: int(x.get("lastMsgId", "0") or "0"), reverse=True)
        return items

    def get_guilds(self) -> list[dict]:
        if not self._client:
            return []

        categories = [{"name": "Servers", "collapsed": False, "items": []}]
        guilds = sorted(self._client.guilds, key=lambda g: (g.joined_at or g.created_at).timestamp() if (g.joined_at or g.created_at) else 0)

        for guild in guilds:
            me = guild.me
            text_channels = sorted(
                [c for c in guild.channels if isinstance(c, (discord.TextChannel,))],
                key=lambda c: c.position,
            )
            if not text_channels:
                continue

            first = None
            for ch in text_channels:
                if me:
                    try:
                        perms = ch.permissions_for(me)
                        if perms.view_channel and perms.read_messages:
                            first = ch
                            break
                    except Exception:
                        pass
                else:
                    first = ch
                    break
            if first is None:
                first = text_channels[0]

            icon = str(guild.icon.with_size(32).url) if guild.icon else None

            categories[0]["items"].append({
                "id": str(first.id),
                "guildId": str(guild.id),
                "name": guild.name,
                "presence": {"status": "Online", "presence": "", "type": ""},
                "lastMsgId": str(first.last_message_id) if first.last_message_id else str(first.id),
                "isGroupChat": False,
                "recipientCount": guild.member_count or 0,
                "image": icon,
            })

        return categories

    def get_notify_entry_id_for_channel(self, channel_id: str) -> str:
        if not self._client:
            return channel_id
        ch = self._client.get_channel(int(channel_id))
        if not ch:
            return channel_id
        if isinstance(ch, (discord.DMChannel, discord.GroupChannel)):
            return channel_id
        if hasattr(ch, "guild") and ch.guild:
            text_channels = sorted(
                [c for c in ch.guild.channels if isinstance(c, discord.TextChannel)],
                key=lambda c: c.position,
            )
            if text_channels:
                return str(text_channels[0].id)
        return channel_id

    async def _try_chunk(self, guild: Any) -> bool:
        """Try gateway chunk; returns True on success, marks unchunkable on failure."""
        if guild.chunked:
            return True
        if guild.id in self._unchunkable_guilds:
            return False
        try:
            await asyncio.wait_for(guild.chunk(), timeout=15)
            return True
        except Exception:
            self._unchunkable_guilds.add(guild.id)
            print(f"[bridge] Guild '{guild.name}' marked unchunkable", file=sys.stderr)
            return False

    _SEED_MAX_CHANNELS = 10
    _SEED_TOTAL_MESSAGES = 600
    _SEED_CHANNEL_DELAY = 0.8
    _BATCH_DELAY = 1.0
    _ALPHA_QUERY_DELAY = 1.2

    _PREFER_KEYWORDS = {"general", "chat", "talk", "discussion", "lounge", "off-topic", "offtopic", "hangout", "memes"}
    _SKIP_KEYWORDS = {"announcements", "announcement", "rules", "roles", "info", "welcome", "readme", "news", "updates", "changelog", "faq", "guidelines"}

    @classmethod
    def _rank_channel_for_seed(cls, ch: Any) -> tuple[int, int]:
        name = (ch.name or "").lower().replace("-", " ").replace("_", " ")
        tokens = set(name.split())
        if tokens & cls._SKIP_KEYWORDS:
            return (2, ch.position)
        if tokens & cls._PREFER_KEYWORDS:
            return (0, ch.position)
        return (1, ch.position)

    async def _seed_recent_authors(self, guild: Any, channel: Any) -> None:
        """For unchunkable guilds, seed member cache from disk cache or by scanning channels."""
        gid = guild.id
        if gid in self._seeded_guilds:
            return
        self._seeded_guilds.add(gid)

        cached_entry = self._member_id_cache.get(gid)
        if cached_entry:
            cached_ids = cached_entry.get("member_ids", [])
            uncached = [uid for uid in cached_ids if guild.get_member(uid) is None]
            if uncached:
                await self._batch_fetch_member_ids(guild, uncached)
            cached_count = len(guild.members)
            print(f"[bridge] Restored {cached_count} members for '{guild.name}' from disk cache ({len(cached_ids)} saved IDs)", file=sys.stderr)
            return

        try:
            me = guild.me or guild.get_member(self._client.user.id) if self._client and self._client.user else None
            text_channels = [c for c in guild.channels if isinstance(c, discord.TextChannel)]
            if me:
                text_channels = [c for c in text_channels if c.permissions_for(me).view_channel]

            text_channels.sort(key=self._rank_channel_for_seed)
            text_channels = text_channels[:self._SEED_MAX_CHANNELS]
            if not text_channels:
                return

            author_ids: set[int] = set()
            after = datetime.now(timezone.utc) - timedelta(weeks=3)
            msgs_per_channel = max(30, self._SEED_TOTAL_MESSAGES // len(text_channels))

            for i, ch in enumerate(text_channels):
                try:
                    async for msg in ch.history(limit=msgs_per_channel, after=after):
                        if msg.author:
                            author_ids.add(msg.author.id)
                except discord.Forbidden:
                    continue
                except Exception:
                    continue
                if i < len(text_channels) - 1:
                    await asyncio.sleep(self._SEED_CHANNEL_DELAY)

            uncached = [uid for uid in author_ids if guild.get_member(uid) is None]
            if uncached:
                await self._batch_fetch_member_ids(guild, uncached)

            self._cache_guild_members(guild)

            cached_count = len(guild.members)
            print(
                f"[bridge] Seeded {cached_count} members for '{guild.name}' "
                f"({len(author_ids)} unique authors from {len(text_channels)} channels)",
                file=sys.stderr,
            )
        except Exception as e:
            print(f"[bridge] Recent author seed failed for '{guild.name}': {e}", file=sys.stderr)

    async def _batch_fetch_member_ids(self, guild: Any, user_ids: list[int]) -> None:
        """Batch-fetch members by ID via query_members, with individual REST fallback."""
        for i in range(0, len(user_ids), 100):
            if i > 0:
                await asyncio.sleep(self._BATCH_DELAY)
            batch = user_ids[i:i + 100]
            try:
                await asyncio.wait_for(
                    guild.query_members(user_ids=batch, presences=True, cache=True),
                    timeout=10,
                )
            except Exception:
                for uid in batch[:10]:
                    try:
                        await guild.fetch_member(uid)
                        await asyncio.sleep(0.5)
                    except Exception:
                        pass

    async def _fetch_more_members(self, guild: Any, count: int = 100) -> bool:
        """Fetch additional members via alphabetical queries. Returns True if any found."""
        gid = guild.id
        idx = self._member_query_progress.get(gid, 0)
        chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        fetched_total = 0

        while fetched_total < count and idx < len(chars):
            if fetched_total > 0:
                await asyncio.sleep(self._ALPHA_QUERY_DELAY)
            letter = chars[idx]
            idx += 1
            try:
                results = await asyncio.wait_for(
                    guild.query_members(query=letter, limit=100, presences=True, cache=True),
                    timeout=8,
                )
                fetched_total += len(results)
            except Exception:
                pass

        self._member_query_progress[gid] = idx
        if fetched_total > 0:
            self._cache_guild_members(guild)
            print(f"[bridge] Fetched {fetched_total} more members for '{guild.name}' (alpha idx={idx})", file=sys.stderr)
        return fetched_total > 0

    async def _prefetch_message_authors(self, guild: Any, messages: list) -> None:
        """Fetch member data for uncached message authors so role colors resolve."""
        if not guild:
            return
        uncached_ids: list[int] = []
        seen: set[int] = set()
        for msg in messages:
            if msg.author and not isinstance(msg.author, discord.Member):
                uid = msg.author.id
                if uid not in seen and uid not in self._prefetched_authors and guild.get_member(uid) is None:
                    uncached_ids.append(uid)
                    seen.add(uid)
        if not uncached_ids:
            return
        self._prefetched_authors.update(uncached_ids)
        await self._batch_fetch_member_ids(guild, uncached_ids[:50])

    async def _fetch_and_serialize_messages(self, channelId: str, **history_kwargs: Any) -> list[dict]:
        """Shared logic for fetching channel messages and serializing them."""
        channel = await self._resolve_channel(channelId)
        if not hasattr(channel, "history"):
            return []

        guild = getattr(channel, "guild", None)
        if guild and not history_kwargs.get("before"):
            await self._try_chunk(guild)

        messages = []
        async for msg in channel.history(**history_kwargs):
            messages.append(msg)
        messages.reverse()

        if guild:
            await self._prefetch_message_authors(guild, messages)

        self_id = self._client.user.id if self._client.user else None
        return [message_to_vm(self._client, m, self_id) for m in messages]

    async def get_messages(self, channelId: str) -> list[dict]:
        if not self._client:
            return []
        try:
            return await self._fetch_and_serialize_messages(channelId, limit=50)
        except discord.Forbidden:
            print(f"[bridge] get_messages: no access to channel {channelId}", file=sys.stderr)
            return []
        except Exception as e:
            print(f"[bridge] get_messages error: {e}", file=sys.stderr)
            return []

    async def get_messages_before(self, channelId: str, beforeId: str, limit: int = 50) -> list[dict]:
        if not self._client:
            return []
        try:
            before_obj = discord.Object(id=int(beforeId))
            return await self._fetch_and_serialize_messages(channelId, limit=limit, before=before_obj)
        except discord.Forbidden:
            print(f"[bridge] get_messages_before: no access to channel {channelId}", file=sys.stderr)
            return []
        except Exception as e:
            print(f"[bridge] get_messages_before error: {e}", file=sys.stderr)
            return []

    async def send_message(
        self,
        channelId: str,
        content: str,
        attachmentPaths: Optional[list[str]] = None,
        reply_to_message_id: Optional[str] = None,
    ) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "send"):
                return {"success": False, "error": "Cannot send in this channel"}

            send_content = content.strip() or ("\u200b" if attachmentPaths else "")
            if not send_content and not attachmentPaths:
                return {"success": False, "error": "Empty message"}

            files = []
            if attachmentPaths:
                for fp in attachmentPaths:
                    files.append(discord.File(fp))

            reference = None
            if reply_to_message_id:
                ref_kw: dict = {
                    "message_id": int(reply_to_message_id),
                    "channel_id": int(channelId),
                }
                if getattr(channel, "guild", None):
                    ref_kw["guild_id"] = channel.guild.id
                reference = discord.MessageReference(**ref_kw)

            await channel.send(
                content=send_content,
                files=files if files else discord.utils.MISSING,
                reference=reference,
            )
            return {"success": True}
        except Exception as e:
            msg = str(e)
            print(f"[bridge] send_message error: {msg}", file=sys.stderr)
            if "captcha" in msg.lower():
                return {"success": False, "error": "Discord is asking for verification. Try having them message you first, or send from the Discord app."}
            return {"success": False, "error": msg or "Failed to send message"}

    async def edit_message(self, channelId: str, messageId: str, content: str) -> bool:
        if not self._client:
            return False
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "fetch_message"):
                return False
            msg = await channel.fetch_message(int(messageId))
            await msg.edit(content=content)
            return True
        except Exception as e:
            print(f"[bridge] edit_message error: {e}", file=sys.stderr)
            return False

    async def delete_message(self, channelId: str, messageId: str) -> bool:
        if not self._client:
            return False
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "fetch_message"):
                return False
            msg = await channel.fetch_message(int(messageId))
            await msg.delete()
            return True
        except Exception as e:
            print(f"[bridge] delete_message error: {e}", file=sys.stderr)
            return False

    async def get_pinned_messages(self, channelId: str) -> list[dict]:
        if not self._client:
            return []
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "pins"):
                return []
            pins: list[discord.Message] = await channel.pins()
            guild = getattr(channel, "guild", None)
            if guild:
                await self._prefetch_message_authors(guild, pins)
            self_id = self._client.user.id if self._client.user else None
            return [message_to_vm(self._client, m, self_id) for m in pins]
        except discord.Forbidden:
            print(f"[bridge] get_pinned_messages: no access to channel {channelId}", file=sys.stderr)
            return []
        except Exception as e:
            print(f"[bridge] get_pinned_messages error: {e}", file=sys.stderr)
            return []

    async def pin_message(self, channelId: str, messageId: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "fetch_message"):
                return {"success": False, "error": "Cannot pin in this channel"}
            msg = await channel.fetch_message(int(messageId))
            await msg.pin()
            return {"success": True}
        except discord.Forbidden:
            return {"success": False, "error": "You don't have permission to pin messages here"}
        except Exception as e:
            msg = str(e)
            print(f"[bridge] pin_message error: {msg}", file=sys.stderr)
            return {"success": False, "error": msg or "Failed to pin message"}

    async def unpin_message(self, channelId: str, messageId: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            channel = await self._resolve_channel(channelId)
            if not hasattr(channel, "fetch_message"):
                return {"success": False, "error": "Cannot unpin in this channel"}
            msg = await channel.fetch_message(int(messageId))
            await msg.unpin()
            return {"success": True}
        except discord.Forbidden:
            return {"success": False, "error": "You don't have permission to unpin messages here"}
        except Exception as e:
            msg = str(e)
            print(f"[bridge] unpin_message error: {msg}", file=sys.stderr)
            return {"success": False, "error": msg or "Failed to unpin message"}

    async def trigger_typing(self, channelId: str) -> None:
        if not self._client:
            return
        try:
            channel = await self._resolve_channel(channelId)
            if hasattr(channel, "typing"):
                await channel.typing()
        except Exception:
            pass

    async def get_channel(self, channelId: str) -> Optional[dict]:
        if not self._client:
            return None
        try:
            channel = await self._resolve_channel(channelId)
            if not channel:
                return None

            if hasattr(channel, "guild") and channel.guild:
                me = channel.guild.me
                if me and hasattr(channel, "permissions_for"):
                    try:
                        perms = channel.permissions_for(me)
                        if not perms.view_channel:
                            return None
                    except Exception:
                        pass
                # Trigger guild chunk/load when first opening this guild (e.g. from a notification).
                # Ensures 1000+ member guilds load the same whether opened from home or from a mention.
                if isinstance(channel, discord.TextChannel):
                    await self._try_chunk(channel.guild)

            vm = channel_to_vm(self._client, channel)

            if isinstance(channel, discord.DMChannel) and channel.recipient:
                try:
                    fetched = await self._client.fetch_user(channel.recipient.id)
                    accent = getattr(fetched, "accent_color", None) or getattr(fetched, "accent_colour", None)
                    if accent:
                        vm["recipientAccentColor"] = str(accent)
                except Exception:
                    pass

            return vm
        except discord.Forbidden:
            print(f"[bridge] get_channel: no access to channel {channelId}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"[bridge] get_channel error: {e}", file=sys.stderr)
            return None

    def get_guild_channels(self, guildId: str) -> list[dict]:
        if not self._client:
            return []
        guild = self._client.get_guild(int(guildId))
        if not guild:
            return []
        me = guild.me
        allowed_types = (discord.TextChannel, discord.VoiceChannel, discord.StageChannel, discord.CategoryChannel)
        visible: list = []
        for c in guild.channels:
            if not isinstance(c, allowed_types):
                continue
            if me and not isinstance(c, discord.CategoryChannel):
                try:
                    if not c.permissions_for(me).view_channel:
                        continue
                except Exception:
                    pass
            visible.append(c)

        non_category_ids = {c.id for c in visible if not isinstance(c, discord.CategoryChannel)}
        final = [
            c for c in visible
            if not isinstance(c, discord.CategoryChannel)
            or any(getattr(ch, "category_id", None) == c.id for ch in visible if ch.id in non_category_ids)
        ]

        final.sort(key=lambda c: c.position)
        return [channel_to_vm(self._client, c) for c in final]

    def get_voice_states(self, guildId: str) -> list[dict]:
        if not self._client:
            return []
        guild = self._client.get_guild(int(guildId))
        if not guild:
            return []

        self_id = self._client.user.id if self._client.user else None
        channel_map: dict[str, list[dict]] = {}

        for vc in (*guild.voice_channels, *guild.stage_channels):
            for member_id, state in vc.voice_states.items():
                member = guild.get_member(member_id)
                if not member:
                    continue

                is_self = member.id == self_id
                if is_self:
                    user_status = "Online"
                else:
                    user_status = resolve_user_presence(self._client, member.id).get("status", "Offline")

                channel_map.setdefault(str(vc.id), []).append({
                    "userId": str(member.id),
                    "userName": member.display_name or member.name,
                    "userAvatar": _avatar_url(member, 32),
                    "userStatus": user_status,
                    "selfMute": state.self_mute or False,
                    "selfDeaf": state.self_deaf or False,
                    "speaking": False,
                })

        return [{"channelId": cid, "members": members} for cid, members in channel_map.items()]

    _STATUS_SORT_ORDER = {
        discord.Status.online: 0,
        discord.Status.dnd: 1,
        discord.Status.idle: 2,
        discord.Status.offline: 3,
        discord.Status.invisible: 3,
    }

    async def get_channel_members(self, channelId: str, limit: int = 0, offset: int = 0) -> list[dict]:
        if not self._client:
            return []
        try:
            channel = await self._resolve_channel(channelId)
            if not channel:
                return []

            if isinstance(channel, discord.GroupChannel):
                members_list = [user_to_vm(self._client, r) for r in (channel.recipients or [])]
                if limit > 0:
                    return members_list[offset:offset + limit]
                return members_list

            if isinstance(channel, discord.DMChannel):
                return [user_to_vm(self._client, channel.recipient)] if channel.recipient else []

            if isinstance(channel, discord.TextChannel):
                guild = channel.guild
                await self._try_chunk(guild)

                if guild.id in self._unchunkable_guilds:
                    await self._seed_recent_authors(guild, channel)

                def _visible_sorted() -> list:
                    visible = []
                    for m in guild.members:
                        try:
                            if channel.permissions_for(m).view_channel:
                                visible.append(m)
                        except Exception:
                            visible.append(m)
                    visible.sort(key=lambda m: (
                        self._STATUS_SORT_ORDER.get(m.status, 3),
                        (m.display_name or m.name).lower(),
                    ))
                    return visible

                members = _visible_sorted()

                need = offset + (limit if limit > 0 else 0)
                if limit > 0 and need > len(members) and guild.id in self._unchunkable_guilds:
                    if await self._fetch_more_members(guild, count=100):
                        members = _visible_sorted()

                page = members[offset:offset + limit] if limit > 0 else members
                return [member_to_vm(self._client, m) for m in page]

            return []
        except Exception as e:
            print(f"[bridge] get_channel_members error: {e}", file=sys.stderr)
            return []

    async def search_members(self, channelId: str, query: str, limit: int = 8) -> list[dict]:
        """Search guild members by name/username using gateway query_members."""
        if not self._client or not query:
            return []
        try:
            channel = await self._resolve_channel(channelId)
            if not channel or not isinstance(channel, discord.TextChannel):
                return []
            guild = channel.guild
            results = await asyncio.wait_for(
                guild.query_members(query=query, limit=limit, presences=False, cache=True),
                timeout=5,
            )
            return [member_to_vm(self._client, m) for m in results]
        except Exception as e:
            print(f"[bridge] search_members error: {e}", file=sys.stderr)
            return []

    async def send_friend_request(self, username: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            await self._client.send_friend_request(username)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e) or "Failed to send friend request"}

    async def accept_friend_request(self, userId: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            await self._client.http.request(
                discord.http.Route("PUT", "/users/@me/relationships/{user_id}", user_id=userId),
                json={},
            )
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e) or "Failed to accept"}

    async def ignore_friend_request(self, userId: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            await self._client.http.request(
                discord.http.Route("DELETE", "/users/@me/relationships/{user_id}", user_id=userId),
            )
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e) or "Failed to ignore"}

    async def remove_friend(self, userId: str) -> dict:
        """Remove a friend (unfriend). Uses the same DELETE relationship endpoint."""
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            await self._client.http.request(
                discord.http.Route("DELETE", "/users/@me/relationships/{user_id}", user_id=userId),
            )
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e) or "Failed to remove friend"}

    def get_friends(self) -> list[str]:
        """Return list of user ids that are friends (relationship type friend)."""
        if not self._client:
            return []
        try:
            friend_ids: list[str] = []
            for rel in self._client.relationships:
                if rel.type != discord.RelationshipType.friend:
                    continue
                user = rel.user
                if user:
                    friend_ids.append(str(user.id))
            return friend_ids
        except Exception as e:
            print(f"[bridge] get_friends error: {e}", file=sys.stderr)
            return []

    async def get_or_create_dm_channel(self, userId: str) -> str:
        if not self._client:
            raise Exception("Not connected")
        user = self._client.get_user(int(userId))
        if user is None:
            user = await self._client.fetch_user(int(userId))
        dm = await user.create_dm()
        return str(dm.id)

    async def close_conversation(self, channelId: str) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            channel = await self._resolve_channel(channelId)
            if not channel:
                return {"success": False, "error": "Channel not found"}
            if not isinstance(channel, (discord.DMChannel, discord.GroupChannel)):
                return {"success": False, "error": "Can only close DM or group DM conversations"}
            await channel.close()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e) or "Failed to close conversation"}

    async def ack_message(self, channelId: str, messageId: str) -> None:
        if not self._client:
            return
        try:
            await self._client.http.request(
                discord.http.Route(
                    "POST",
                    "/channels/{channel_id}/messages/{message_id}/ack",
                    channel_id=channelId,
                    message_id=messageId,
                ),
                json={"token": None},
            )
        except Exception as e:
            print(f"[bridge] ack_message error: {e}", file=sys.stderr)

    async def get_pending_friend_requests(self) -> list[dict]:
        if not self._client:
            return []
        try:
            items: list[dict] = []
            for rel in self._client.relationships:
                if rel.type not in (discord.RelationshipType.incoming_request, discord.RelationshipType.outgoing_request):
                    continue
                user = rel.user
                if not user:
                    continue
                items.append({
                    "id": str(user.id),
                    "recipientId": str(user.id),
                    "name": getattr(user, "display_name", None) or user.name,
                    "presence": resolve_user_presence(self._client, user.id),
                    "isGroupChat": False,
                    "recipientCount": 1,
                    "image": _avatar_url(user, 32),
                })
            return items
        except Exception as e:
            print(f"[bridge] get_pending_friend_requests error: {e}", file=sys.stderr)
            return []

    _PROFILE_CACHE_TTL = 300

    async def get_user_profile(self, userId: str) -> Optional[dict]:
        if not self._client:
            return None
        uid = int(userId)

        now = asyncio.get_event_loop().time()
        cached = self._profile_cache.get(uid)
        if cached:
            entry, ts = cached
            if now - ts < self._PROFILE_CACHE_TTL:
                entry["presence"] = resolve_user_presence(self._client, uid)
                return entry

        try:
            # fetch_user hits the HTTP API and returns accent_color, banner, etc.
            # Cached members/users from the gateway do NOT include these fields.
            fetched = await self._client.fetch_user(uid)

            # Use guild member for display_name (server nickname) when available
            member = None
            for g in self._client.guilds:
                member = g.get_member(uid)
                if member:
                    break
            display_name = (member.display_name if member else None) or fetched.display_name or fetched.name

            profile = None
            try:
                profile = await fetched.profile()
            except Exception:
                pass

            bio = getattr(profile, "bio", "") or "" if profile else ""

            accent = getattr(fetched, "accent_color", None) or getattr(fetched, "accent_colour", None)
            accent_color = f"#{accent:06x}" if isinstance(accent, int) else str(accent) if accent else None

            banner_url = None
            if fetched.banner:
                banner_url = str(fetched.banner.with_size(512).url)

            result = {
                "id": str(fetched.id),
                "name": display_name,
                "username": fetched.name,
                "avatar": _avatar_url(fetched, 128),
                "bio": bio,
                "accentColor": accent_color,
                "bannerUrl": banner_url,
                "presence": resolve_user_presence(self._client, uid),
                "createdAt": fetched.created_at.isoformat() if fetched.created_at else "",
            }
            self._profile_cache[uid] = (result, now)
            return result
        except Exception as e:
            print(f"[bridge] get_user_profile error: {e}", file=sys.stderr)
            return None


bridge_client = DiscordBridgeClient()
