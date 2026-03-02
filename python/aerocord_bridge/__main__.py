"""
Entry point for the aerocord Python bridge sidecar.
Starts the asyncio event loop, NDJSON protocol handler, and routes requests.
When run frozen (PyInstaller), use absolute imports; otherwise relative.
"""

import asyncio
import sys

if getattr(sys, "frozen", False):
    # PyInstaller: ensure package root is on path so "aerocord_bridge" resolves
    _meipass = getattr(sys, "_MEIPASS", None)
    if _meipass and _meipass not in sys.path:
        sys.path.insert(0, _meipass)
    from aerocord_bridge.protocol import JsonRpcRouter, stdin_reader, send_event, set_audio_chunk_handler
    from aerocord_bridge.client import bridge_client
    from aerocord_bridge.events import register_events
    from aerocord_bridge.voice import voice_bridge
else:
    from .protocol import JsonRpcRouter, stdin_reader, send_event, set_audio_chunk_handler
    from .client import bridge_client
    from .events import register_events
    from .voice import voice_bridge


def _get_self_id():
    if bridge_client.client and bridge_client.client.user:
        return bridge_client.client.user.id
    return None


def build_router() -> JsonRpcRouter:
    router = JsonRpcRouter()

    # --- Auth ---
    async def handle_login(token: str, status: str = "online") -> str:
        result = await bridge_client.login(token, status)
        if result == "success" and bridge_client.client:
            if not bridge_client._events_registered:
                register_events(bridge_client.client, _get_self_id)
                bridge_client._events_registered = True
            await send_event("ready", bridge_client.get_current_user())
        return result

    async def handle_logout() -> None:
        await voice_bridge.leave()
        await bridge_client.logout()

    router.register("login", handle_login)
    router.register("logout", handle_logout)

    # --- User ---
    async def handle_get_current_user() -> dict | None:
        return bridge_client.get_current_user()

    async def handle_set_status(status: str) -> None:
        await bridge_client.set_status(status)

    async def handle_set_custom_status(text: str | None = None) -> None:
        await bridge_client.set_custom_status(text)

    async def handle_get_user_profile(userId: str) -> dict | None:
        return await bridge_client.get_user_profile(userId)

    async def handle_get_status_for_overlay() -> str:
        return bridge_client.get_status_for_overlay()

    router.register("getCurrentUser", handle_get_current_user)
    router.register("setStatus", handle_set_status)
    router.register("setCustomStatus", handle_set_custom_status)
    router.register("getUserProfile", handle_get_user_profile)
    router.register("getStatusForOverlay", handle_get_status_for_overlay)

    # --- Contacts ---
    async def handle_get_private_channels() -> list:
        return bridge_client.get_private_channels()

    async def handle_get_guilds() -> list:
        return bridge_client.get_guilds()

    async def handle_send_friend_request(username: str) -> dict:
        return await bridge_client.send_friend_request(username)

    async def handle_get_pending_requests() -> list:
        return await bridge_client.get_pending_friend_requests()

    async def handle_accept_friend_request(userId: str) -> dict:
        return await bridge_client.accept_friend_request(userId)

    async def handle_ignore_friend_request(userId: str) -> dict:
        return await bridge_client.ignore_friend_request(userId)

    async def handle_get_friends() -> list:
        return bridge_client.get_friends()

    async def handle_remove_friend(userId: str) -> dict:
        return await bridge_client.remove_friend(userId)

    async def handle_get_notify_entry_id(channelId: str) -> str:
        return bridge_client.get_notify_entry_id_for_channel(channelId)

    async def handle_resolve_user_presence(userId: str) -> dict:
        if getattr(sys, "frozen", False):
            from aerocord_bridge.serializers import resolve_user_presence
        else:
            from .serializers import resolve_user_presence
        if not bridge_client.client:
            return {"status": "Offline", "presence": "", "type": ""}
        return resolve_user_presence(bridge_client.client, int(userId))

    router.register("getPrivateChannels", handle_get_private_channels)
    router.register("getGuilds", handle_get_guilds)
    router.register("sendFriendRequest", handle_send_friend_request)
    router.register("getPendingRequests", handle_get_pending_requests)
    router.register("acceptFriendRequest", handle_accept_friend_request)
    router.register("ignoreFriendRequest", handle_ignore_friend_request)
    router.register("getFriends", handle_get_friends)
    router.register("removeFriend", handle_remove_friend)
    router.register("getNotifyEntryId", handle_get_notify_entry_id)
    router.register("resolveUserPresence", handle_resolve_user_presence)

    # --- Messages ---
    async def handle_get_messages(channelId: str) -> list:
        return await bridge_client.get_messages(channelId)

    async def handle_get_messages_before(channelId: str, beforeId: str, limit: int = 50) -> list:
        return await bridge_client.get_messages_before(channelId, beforeId, limit)

    async def handle_send_message(channelId: str, content: str, attachmentPaths: list[str] | None = None, replyToMessageId: str | None = None) -> dict:
        return await bridge_client.send_message(channelId, content, attachmentPaths, reply_to_message_id=replyToMessageId)

    async def handle_edit_message(channelId: str, messageId: str, content: str) -> bool:
        return await bridge_client.edit_message(channelId, messageId, content)

    async def handle_delete_message(channelId: str, messageId: str) -> bool:
        return await bridge_client.delete_message(channelId, messageId)

    async def handle_get_pinned_messages(channelId: str) -> list:
        return await bridge_client.get_pinned_messages(channelId)

    async def handle_pin_message(channelId: str, messageId: str) -> dict:
        return await bridge_client.pin_message(channelId, messageId)

    async def handle_unpin_message(channelId: str, messageId: str) -> dict:
        return await bridge_client.unpin_message(channelId, messageId)

    async def handle_trigger_typing(channelId: str) -> None:
        await bridge_client.trigger_typing(channelId)

    async def handle_ack_message(channelId: str, messageId: str) -> None:
        await bridge_client.ack_message(channelId, messageId)

    router.register("getMessages", handle_get_messages)
    router.register("getMessagesBefore", handle_get_messages_before)
    router.register("sendMessage", handle_send_message)
    router.register("editMessage", handle_edit_message)
    router.register("deleteMessage", handle_delete_message)
    router.register("getPinnedMessages", handle_get_pinned_messages)
    router.register("pinMessage", handle_pin_message)
    router.register("unpinMessage", handle_unpin_message)
    router.register("triggerTyping", handle_trigger_typing)
    router.register("ackMessage", handle_ack_message)

    # --- Channels ---
    async def handle_get_channel(channelId: str) -> dict | None:
        return await bridge_client.get_channel(channelId)

    async def handle_get_guild_channels(guildId: str) -> list:
        return bridge_client.get_guild_channels(guildId)

    async def handle_get_channel_members(channelId: str, limit: int = 0, offset: int = 0) -> list:
        return await bridge_client.get_channel_members(channelId, limit, offset)

    async def handle_get_or_create_dm(userId: str) -> str:
        return await bridge_client.get_or_create_dm_channel(userId)

    async def handle_close_conversation(channelId: str) -> dict:
        return await bridge_client.close_conversation(channelId)

    async def handle_search_members(channelId: str, query: str, limit: int = 8) -> list:
        return await bridge_client.search_members(channelId, query, limit)

    router.register("getChannel", handle_get_channel)
    router.register("getGuildChannels", handle_get_guild_channels)
    router.register("getChannelMembers", handle_get_channel_members)
    router.register("searchMembers", handle_search_members)
    router.register("getOrCreateDM", handle_get_or_create_dm)
    router.register("closeConversation", handle_close_conversation)

    # --- Voice ---
    async def handle_voice_join(channelId: str) -> bool:
        if not bridge_client.client:
            return False
        return await voice_bridge.join(bridge_client.client, channelId)

    async def handle_voice_leave() -> None:
        await voice_bridge.leave()

    async def handle_voice_set_self_mute(muted: bool) -> None:
        voice_bridge.set_self_mute(muted)

    async def handle_voice_set_self_deafen(deafened: bool) -> None:
        voice_bridge.set_self_deafen(deafened)

    async def handle_voice_set_input_volume(volume: float) -> None:
        voice_bridge.set_input_volume(volume)

    async def handle_voice_set_noise_gate_db(db: float) -> None:
        voice_bridge.set_noise_gate_db(db)

    async def handle_voice_get_input_volume() -> float:
        return voice_bridge.get_input_volume()

    async def handle_voice_set_user_volume(userId: str, volume: float) -> None:
        voice_bridge.set_user_volume(userId, volume)

    async def handle_voice_get_user_volume(userId: str) -> float:
        return voice_bridge.get_user_volume(userId)

    async def handle_voice_set_user_muted(userId: str, muted: bool) -> None:
        voice_bridge.set_user_muted(userId, muted)

    async def handle_voice_get_user_muted(userId: str) -> bool:
        return voice_bridge.get_user_muted(userId)

    async def handle_voice_get_states(guildId: str) -> list:
        return bridge_client.get_voice_states(guildId)

    async def handle_voice_audio_chunk(pcm: str) -> None:
        voice_bridge.receive_audio_chunk(pcm)

    router.register("voiceJoin", handle_voice_join)
    router.register("voiceLeave", handle_voice_leave)
    router.register("voiceSetSelfMute", handle_voice_set_self_mute)
    router.register("voiceSetSelfDeafen", handle_voice_set_self_deafen)
    router.register("voiceSetInputVolume", handle_voice_set_input_volume)
    router.register("voiceSetNoiseGateDb", handle_voice_set_noise_gate_db)
    router.register("voiceGetInputVolume", handle_voice_get_input_volume)
    router.register("voiceSetUserVolume", handle_voice_set_user_volume)
    router.register("voiceGetUserVolume", handle_voice_get_user_volume)
    router.register("voiceSetUserMuted", handle_voice_set_user_muted)
    router.register("voiceGetUserMuted", handle_voice_get_user_muted)
    router.register("voiceGetStates", handle_voice_get_states)
    router.register("voiceAudioChunk", handle_voice_audio_chunk)
    set_audio_chunk_handler(voice_bridge.receive_audio_chunk)

    # --- DM Calls ---
    async def handle_call_start(channelId: str) -> bool:
        if not bridge_client.client:
            return False
        return await voice_bridge.start_call(bridge_client.client, channelId)

    async def handle_call_accept(channelId: str) -> bool:
        if not bridge_client.client:
            return False
        return await voice_bridge.accept_call(bridge_client.client, channelId)

    async def handle_call_decline(channelId: str) -> None:
        if not bridge_client.client:
            return
        await voice_bridge.decline_call(bridge_client.client, channelId)

    async def handle_call_hangup() -> None:
        await voice_bridge.leave()

    async def handle_call_get_state() -> dict:
        return {
            "callState": voice_bridge.call_state,
            "callChannelId": voice_bridge.call_channel_id,
        }

    router.register("callStart", handle_call_start)
    router.register("callAccept", handle_call_accept)
    router.register("callDecline", handle_call_decline)
    router.register("callHangup", handle_call_hangup)
    router.register("callGetState", handle_call_get_state)

    # --- Ping (for health checks) ---
    async def handle_ping() -> str:
        return "pong"

    router.register("ping", handle_ping)

    return router


async def main() -> None:
    print("[bridge] Aerocord Python bridge starting...", file=sys.stderr)
    router = build_router()
    await send_event("bridgeReady", None)
    await stdin_reader(router)
    print("[bridge] stdin closed, shutting down...", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
