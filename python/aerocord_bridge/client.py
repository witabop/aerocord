"""
Discord client wrapper using discord.py-self.
Mirrors the API surface of the original TypeScript DiscordClientWrapper.
"""

from __future__ import annotations

import asyncio
import sys
import traceback
from typing import Any, Optional

import discord

from .serializers import (
    user_to_vm,
    member_to_vm,
    presence_to_vm,
    message_to_vm,
    channel_to_vm,
    resolve_user_presence,
    _status_to_vm,
    _avatar_url,
    _channel_type_str,
)
from .protocol import send_event


class DiscordBridgeClient:
    def __init__(self) -> None:
        self._client: Optional[discord.Client] = None
        self._ready = False
        self._desired_status: str = "online"
        self._custom_status_text: Optional[str] = None
        self._events_registered = False

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
        if self._client:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None

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
            text_channels = sorted(
                [c for c in guild.channels if isinstance(c, (discord.TextChannel,))],
                key=lambda c: c.position,
            )
            if not text_channels:
                continue

            first = text_channels[0]
            icon = str(guild.icon.with_size(32).url) if guild.icon else None

            categories[0]["items"].append({
                "id": str(first.id),
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

    async def get_messages(self, channelId: str) -> list[dict]:
        if not self._client:
            return []
        try:
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if not hasattr(channel, "history"):
                return []
            messages = []
            async for msg in channel.history(limit=50):
                messages.append(msg)
            messages.reverse()
            self_id = self._client.user.id if self._client.user else None
            return [message_to_vm(self._client, m, self_id) for m in messages]
        except Exception as e:
            print(f"[bridge] get_messages error: {e}", file=sys.stderr)
            return []

    async def send_message(self, channelId: str, content: str, attachmentPaths: Optional[list[str]] = None) -> dict:
        if not self._client:
            return {"success": False, "error": "Not connected"}
        try:
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if not hasattr(channel, "send"):
                return {"success": False, "error": "Cannot send in this channel"}

            send_content = content.strip() or ("\u200b" if attachmentPaths else "")
            if not send_content and not attachmentPaths:
                return {"success": False, "error": "Empty message"}

            files = []
            if attachmentPaths:
                for fp in attachmentPaths:
                    files.append(discord.File(fp))

            await channel.send(content=send_content, files=files if files else discord.utils.MISSING)
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
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
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
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if not hasattr(channel, "fetch_message"):
                return False
            msg = await channel.fetch_message(int(messageId))
            await msg.delete()
            return True
        except Exception as e:
            print(f"[bridge] delete_message error: {e}", file=sys.stderr)
            return False

    async def trigger_typing(self, channelId: str) -> None:
        if not self._client:
            return
        try:
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if hasattr(channel, "typing"):
                await channel.typing()
        except Exception:
            pass

    async def get_channel(self, channelId: str) -> Optional[dict]:
        if not self._client:
            return None
        try:
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if not channel:
                return None

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
        except Exception as e:
            print(f"[bridge] get_channel error: {e}", file=sys.stderr)
            return None

    def get_guild_channels(self, guildId: str) -> list[dict]:
        if not self._client:
            return []
        guild = self._client.get_guild(int(guildId))
        if not guild:
            return []
        filtered = [
            c for c in guild.channels
            if isinstance(c, (discord.TextChannel, discord.VoiceChannel, discord.StageChannel, discord.CategoryChannel))
        ]
        filtered.sort(key=lambda c: c.position)
        return [channel_to_vm(self._client, c) for c in filtered]

    def get_voice_states(self, guildId: str) -> list[dict]:
        if not self._client:
            return []
        guild = self._client.get_guild(int(guildId))
        if not guild:
            return []

        channel_map: dict[str, list[dict]] = {}

        for vc in guild.voice_channels:
            # voice_states is a dict of {member_id: VoiceState}
            for member_id, state in vc.voice_states.items():
                member = guild.get_member(member_id)
                if not member:
                    continue

                cid = str(vc.id)
                if cid not in channel_map:
                    channel_map[cid] = []

                is_client = self._client.user and member.id == self._client.user.id
                user_status: str = "Online" if is_client else "Offline"
                if not is_client:
                    p = resolve_user_presence(self._client, member.id)
                    user_status = p.get("status", "Offline")

                channel_map[cid].append({
                    "userId": str(member.id),
                    "userName": member.display_name or member.name,
                    "userAvatar": _avatar_url(member, 32),
                    "userStatus": user_status,
                    "selfMute": state.self_mute or False,
                    "selfDeaf": state.self_deaf or False,
                    "speaking": False,
                })

        # Also check stage channels
        for sc in guild.stage_channels:
            for member_id, state in sc.voice_states.items():
                member = guild.get_member(member_id)
                if not member:
                    continue

                cid = str(sc.id)
                if cid not in channel_map:
                    channel_map[cid] = []

                is_client = self._client.user and member.id == self._client.user.id
                user_status: str = "Online" if is_client else "Offline"
                if not is_client:
                    p = resolve_user_presence(self._client, member.id)
                    user_status = p.get("status", "Offline")

                channel_map[cid].append({
                    "userId": str(member.id),
                    "userName": member.display_name or member.name,
                    "userAvatar": _avatar_url(member, 32),
                    "userStatus": user_status,
                    "selfMute": state.self_mute or False,
                    "selfDeaf": state.self_deaf or False,
                    "speaking": False,
                })

        return [{"channelId": cid, "members": members} for cid, members in channel_map.items()]

    async def get_channel_members(self, channelId: str) -> list[dict]:
        if not self._client:
            return []
        try:
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
            if not channel:
                return []

            if isinstance(channel, discord.GroupChannel):
                return [user_to_vm(self._client, r) for r in (channel.recipients or [])]

            if isinstance(channel, discord.DMChannel):
                return [user_to_vm(self._client, channel.recipient)] if channel.recipient else []

            if isinstance(channel, discord.TextChannel):
                try:
                    await channel.guild.chunk()
                except Exception:
                    pass

                members = []
                for member in channel.guild.members:
                    perms = channel.permissions_for(member)
                    if perms.view_channel:
                        members.append(member)

                members.sort(key=lambda m: (
                    0 if m.status != discord.Status.offline else 1,
                    (m.display_name or m.name).lower(),
                ))
                return [member_to_vm(self._client, m) for m in members]

            return []
        except Exception as e:
            print(f"[bridge] get_channel_members error: {e}", file=sys.stderr)
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
            channel = self._client.get_channel(int(channelId))
            if channel is None:
                channel = await self._client.fetch_channel(int(channelId))
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

    async def get_user_profile(self, userId: str) -> Optional[dict]:
        if not self._client:
            return None
        try:
            user = await self._client.fetch_user(int(userId))
            profile = None
            try:
                profile = await user.profile()
            except Exception:
                pass

            bio = getattr(profile, "bio", "") or "" if profile else ""
            accent = getattr(user, "accent_color", None) or getattr(user, "accent_colour", None)
            accent_color = None
            if accent:
                accent_color = f"#{accent:06x}" if isinstance(accent, int) else str(accent)

            banner_url = None
            if user.banner:
                banner_url = str(user.banner.with_size(512).url)

            return {
                "id": str(user.id),
                "name": user.display_name or user.name,
                "username": user.name,
                "avatar": _avatar_url(user, 128),
                "bio": bio,
                "accentColor": accent_color,
                "bannerUrl": banner_url,
                "presence": resolve_user_presence(self._client, user.id),
                "createdAt": user.created_at.isoformat() if user.created_at else "",
            }
        except Exception as e:
            print(f"[bridge] get_user_profile error: {e}", file=sys.stderr)
            return None


bridge_client = DiscordBridgeClient()
