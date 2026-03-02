"""
Discord event handlers that emit NDJSON events to stdout.
These mirror the events registered in the original events.ts.
"""

from __future__ import annotations

import sys
from typing import Any, Optional

import discord

from .protocol import send_event
from .serializers import (
    message_to_vm,
    presence_to_vm,
    resolve_user_presence,
    user_to_vm,
    _channel_type_str,
    _avatar_url,
)


def register_events(client: discord.Client, get_self_id: Any) -> None:
    """Register all discord.py-self event listeners that emit NDJSON events."""

    @client.event
    async def on_message(msg: discord.Message) -> None:
        self_id = get_self_id()
        vm = message_to_vm(client, msg, self_id)

        msg_type_str = str(msg.type).split(".")[-1].lower() if msg.type else "default"
        if msg_type_str in ("pins_add", "channel_pinned_message") and hasattr(msg.channel, "pins"):
            try:
                pins = await msg.channel.pins()
                if pins:
                    vm["pinnedMessageId"] = str(pins[0].id)
            except Exception:
                pass

        is_dm = isinstance(msg.channel, (discord.DMChannel, discord.GroupChannel))
        vm["isDirectMessage"] = is_dm

        if is_dm:
            vm["notifyEntryId"] = str(msg.channel.id)
        else:
            guild = getattr(msg.channel, "guild", None)
            if guild:
                text_channels = sorted(
                    [c for c in guild.channels if isinstance(c, discord.TextChannel)],
                    key=lambda c: c.position,
                )
                if text_channels:
                    vm["notifyEntryId"] = str(text_channels[0].id)
                else:
                    vm["notifyEntryId"] = str(msg.channel.id)
            else:
                vm["notifyEntryId"] = str(msg.channel.id)

        await send_event("messageCreate", vm)

    @client.event
    async def on_message_delete(msg: discord.Message) -> None:
        await send_event("messageDelete", {
            "id": str(msg.id),
            "channelId": str(msg.channel.id),
        })

    @client.event
    async def on_raw_message_delete(payload: Any) -> None:
        # Fires for every delete (including when message was not in cache, e.g. pin notification).
        message_id = getattr(payload, "message_id", None) or getattr(payload, "id", None)
        channel_id = getattr(payload, "channel_id", None)
        if message_id is not None and channel_id is not None:
            await send_event("messageDelete", {
                "id": str(message_id),
                "channelId": str(channel_id),
            })

    @client.event
    async def on_message_edit(before: discord.Message, after: discord.Message) -> None:
        self_id = get_self_id()
        vm = message_to_vm(client, after, self_id)
        await send_event("messageUpdate", vm)

    @client.event
    async def on_presence_update(before: Any, after: Any) -> None:
        if after is None:
            return
        user_id = str(after.id)
        presence = presence_to_vm(after)

        # Use the global User (after.user) so we never use server-specific nickname/avatar
        user_obj = getattr(after, "user", after)
        if user_obj is after and hasattr(after, "user"):
            user_obj = after.user
        global_name = getattr(user_obj, "global_name", None) or ""
        username = getattr(user_obj, "name", "") or ""
        name = global_name or username or "Unknown"
        avatar = _avatar_url(user_obj, 64)

        try:
            is_friend = after.id in {r.id for r in client.friends}
        except Exception:
            is_friend = False

        await send_event("presenceUpdate", {
            "userId": user_id,
            "presence": presence,
            "oldStatus": str(before.status) if before else "offline",
            "newStatus": str(after.status),
            "name": name,
            "username": username,
            "avatar": avatar,
            "globalName": global_name or name,
            "globalAvatar": avatar,
            "isFriend": is_friend,
        })

    @client.event
    async def on_typing(channel: Any, user: Any, when: Any) -> None:
        await send_event("typingStart", {
            "channelId": str(channel.id),
            "userId": str(user.id) if user else None,
            "userName": getattr(user, "display_name", None) or getattr(user, "name", None) if user else None,
        })

    @client.event
    async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState) -> None:
        await send_event("voiceStateUpdate", {
            "userId": str(member.id),
            "channelId": str(after.channel.id) if after.channel else None,
            "oldChannelId": str(before.channel.id) if before.channel else None,
            "selfMute": after.self_mute,
            "selfDeaf": after.self_deaf,
            "guildId": str(member.guild.id) if member.guild else None,
        })

    @client.event
    async def on_guild_channel_create(channel: discord.abc.GuildChannel) -> None:
        await send_event("channelCreate", {
            "id": str(channel.id),
            "type": _channel_type_str(channel),
        })

    @client.event
    async def on_guild_channel_delete(channel: discord.abc.GuildChannel) -> None:
        await send_event("channelDelete", {
            "id": str(channel.id),
            "type": _channel_type_str(channel),
        })

    @client.event
    async def on_relationship_add(relationship: Any) -> None:
        await send_event("relationshipChange", None)

    @client.event
    async def on_relationship_update(before: Any, after: Any) -> None:
        await send_event("relationshipChange", None)

    @client.event
    async def on_relationship_remove(relationship: Any) -> None:
        await send_event("relationshipChange", None)

    def _build_call_payload(call: Any, self_id: Any) -> dict:
        channel = call.channel
        ringing = [str(u.id) for u in (call.ringing or [])]

        is_self_ringing = str(self_id) in ringing if self_id else False

        caller_id = None
        initiator = getattr(call, "initiator", None)
        if initiator:
            caller_id = str(initiator.id)
        elif isinstance(channel, discord.DMChannel) and channel.recipient:
            caller_id = str(channel.recipient.id)

        # Connected users EXCLUDING self — used to detect when the peer picks up
        vs = getattr(call, "voice_states", {})
        self_id_str = str(self_id) if self_id else None
        peer_connected = [str(uid) for uid in vs.keys() if str(uid) != self_id_str] if isinstance(vs, dict) else []

        return {
            "channelId": str(channel.id),
            "ringing": ringing,
            "isSelfRinging": is_self_ringing,
            "callerId": caller_id,
            "peerConnected": len(peer_connected) > 0,
        }

    @client.event
    async def on_call_create(call: Any) -> None:
        self_id = get_self_id()
        payload = _build_call_payload(call, self_id)
        print(f"[bridge] call_create: ch={payload['channelId']} caller={payload['callerId']} peerConnected={payload['peerConnected']}", file=sys.stderr)
        await send_event("callCreate", payload)

    @client.event
    async def on_call_update(before: Any, after: Any) -> None:
        self_id = get_self_id()
        payload = _build_call_payload(after, self_id)
        print(f"[bridge] call_update: ch={payload['channelId']} caller={payload['callerId']} peerConnected={payload['peerConnected']}", file=sys.stderr)
        await send_event("callUpdate", payload)

    @client.event
    async def on_call_delete(call: Any) -> None:
        ch_id = str(call.channel.id)
        print(f"[bridge] call_delete: ch={ch_id}", file=sys.stderr)
        await send_event("callDelete", {"channelId": ch_id})

    # Raw gateway interception to log CALL events for debugging
    @client.event
    async def on_socket_raw_receive(msg: Any) -> None:
        import json
        try:
            if isinstance(msg, str):
                data = json.loads(msg)
                t = data.get("t", "")
                if t in ("CALL_CREATE", "CALL_UPDATE", "CALL_DELETE"):
                    d = data.get("d", {})
                    print(f"[bridge] RAW {t}: ringing={d.get('ringing')} voice_states={[vs.get('user_id') for vs in d.get('voice_states', [])]}", file=sys.stderr)
        except Exception:
            pass
