"""
Serializers that convert discord.py-self objects into the exact JSON shapes
expected by the Electron renderer (matching the TypeScript *ToVM() methods).
"""

from __future__ import annotations

import re
from typing import Any, Optional, TYPE_CHECKING

import discord

if TYPE_CHECKING:
    pass

UNICODE_TO_SHORTCODE: dict[str, str] = {
    "\U0001f600": ":grin:",
    "\U0001f601": ":grin:",
    "\U0001f603": ":smile:",
    "\U0001f604": ":smile:",
    "\U0001f606": ":smile:",
    "\U0001f609": ":wink:",
    "\U0001f61c": ":wink:",
    "\U0001f61b": ":stuck_out_tongue:",
    "\U0001f62e": ":open_mouth:",
    "\U0001f632": ":astonished:",
    "\u2639": ":frowning:",
    "\U0001f641": ":frowning:",
    "\U0001f62d": ":sob:",
    "\U0001f621": ":rage:",
    "\U0001f620": ":angry:",
    "\U0001f615": ":confused:",
    "\U0001f633": ":flushed:",
    "\U0001f60e": ":sunglasses:",
    "\U0001f913": ":nerd:",
    "\U0001f914": ":thinking:",
    "\U0001f644": ":rolling_eyes:",
    "\U0001f922": ":nauseated_face:",
    "\U0001f631": ":astonished:",
    "\U0001f928": ":face_with_raised_eyebrow:",
    "\U0001f61e": ":unamused:",
    "\U0001f607": ":innocent:",
    "\U0001f608": ":smiling_imp:",
    "\U0001f973": ":partying_face:",
    "\U0001f91e": ":crossed_fingers:",
    "\U0001f44d": ":thumbsup:",
    "\U0001f44e": ":thumbsdown:",
    "\u270b": ":raised_hand:",
    "\U0001f91d": ":raised_hand:",
    "\u2764": ":heart:",
    "\U0001f494": ":broken_heart:",
    "\U0001f49e": ":heart:",
    "\U0001f495": ":heart:",
    "\U0001f497": ":heart:",
    "\U0001f496": ":heart:",
    "\U0001f339": ":rose:",
    "\u2b50": ":star:",
    "\u2600": ":sunny:",
    "\U0001f31b": ":crescent_moon:",
    "\U0001f308": ":rainbow:",
    "\U0001f327": ":cloud_rain:",
    "\u26c8": ":thunder_cloud_rain:",
    "\u2602": ":umbrella:",
    "\U0001f302": ":umbrella:",
    "\U0001f408": ":cat:",
    "\U0001f415": ":dog:",
    "\U0001f407": ":rabbit:",
    "\U0001f987": ":bat:",
    "\U0001f410": ":goat:",
    "\U0001f411": ":sheep:",
    "\U0001f40c": ":snail:",
    "\U0001f422": ":turtle:",
    "\U0001f355": ":pizza:",
    "\U0001f382": ":cake:",
    "\u2615": ":coffee:",
    "\U0001f37a": ":beer:",
    "\U0001f377": ":wine_glass:",
    "\U0001f963": ":bowl_with_spoon:",
    "\U0001f381": ":gift:",
    "\U0001f3c8": ":football:",
    "\u26bd": ":soccer:",
    "\U0001f3b5": ":musical_note:",
    "\U0001f4f7": ":camera:",
    "\U0001f39e": ":film_frames:",
    "\U0001f4bb": ":computer:",
    "\u260e": ":telephone:",
    "\U0001f4f1": ":mobile_phone:",
    "\u2709": ":envelope:",
    "\U0001f4a1": ":bulb:",
    "\U0001f697": ":red_car:",
    "\u2708": ":airplane:",
    "\U0001f552": ":clock3:",
    "\U0001f4b5": ":dollar:",
    "\U0001f6ac": ":smoking:",
    "\U0001f46e": ":man_standing:",
    "\U0001f46f": ":woman_standing:",
    "\U0001f938": ":person_doing_cartwheel:",
    "\u26f1": ":beach_umbrella:",
    "\U0001f37d": ":plate_with_cutlery:",
    "\U0001f3ae": ":video_game:",
    "\u26d3": ":chains:",
    "\U0001f448": ":point_left:",
    "\U0001f449": ":point_right:",
    "\U0001f4ac": ":speech_balloon:",
    "\U0001f44b": ":wave:",
}

_SORTED_EMOJI = sorted(UNICODE_TO_SHORTCODE.items(), key=lambda x: len(x[0]), reverse=True)


def normalize_emoji(content: str) -> str:
    if not content:
        return content
    for unicode_char, shortcode in _SORTED_EMOJI:
        content = content.replace(unicode_char, shortcode)
    return content


def _status_to_vm(status: str | discord.Status) -> str:
    s = str(status)
    return {
        "online": "Online",
        "idle": "Idle",
        "dnd": "DoNotDisturb",
        "invisible": "Invisible",
        "offline": "Offline",
    }.get(s, "Offline")


def _avatar_url(obj: Any, size: int = 64) -> str:
    try:
        url = obj.display_avatar.with_size(size).url
        return str(url) if url else ""
    except Exception:
        try:
            return str(obj.avatar.url) if obj.avatar else ""
        except Exception:
            return ""


def _activities_to_vm(status: str, activities: Any) -> dict:
    """Shared helper: convert a status string and an iterable of activities to a presence VM."""
    priority = {"custom": 6, "playing": 5, "streaming": 4, "listening": 3, "watching": 2, "competing": 1}
    acts = list(activities) if activities else []
    sorted_acts = sorted(acts, key=lambda a: priority.get(str(a.type).split(".")[-1].lower(), 0), reverse=True)

    presence_str = ""
    custom_status: Optional[str] = None
    act_type = ""

    if sorted_acts:
        activity = sorted_acts[0]
        act_type = str(activity.type).split(".")[-1] if activity.type is not None else ""
        atype = act_type.lower()
        if atype == "custom":
            presence_str = getattr(activity, "state", None) or getattr(activity, "name", "") or ""
            cs = (getattr(activity, "state", None) or getattr(activity, "name", "") or "").strip()
            custom_status = cs if cs else None
        elif atype == "listening":
            state_val = getattr(activity, "state", "") or ""
            details = getattr(activity, "details", "") or ""
            presence_str = f"{state_val} - {details}"
        else:
            presence_str = getattr(activity, "name", "") or ""

    result: dict[str, Any] = {"status": status, "presence": presence_str.strip(), "type": act_type}
    if custom_status is not None:
        result["customStatus"] = custom_status
    return result


def presence_to_vm(obj: Optional[Any]) -> dict:
    """Build a presence VM from a Member, Relationship, or other object with status/activities."""
    if obj is None:
        return {"status": "Offline", "presence": "", "type": ""}
    status = _status_to_vm(getattr(obj, "status", "offline"))
    activities = getattr(obj, "activities", None) or []
    return _activities_to_vm(status, activities)


def _presence_obj_to_vm(p: Any) -> dict:
    """Convert discord.py-self's internal Presence object (from state cache) to a VM dict."""
    cs = getattr(p, "client_status", None)
    raw_status = cs.status if cs else "offline"
    status = _status_to_vm(raw_status)
    activities = getattr(p, "activities", ()) or ()
    return _activities_to_vm(status, activities)


def resolve_user_presence(client: discord.Client, user_id: int) -> dict:
    """Resolve presence for a user from all available discord.py-self sources.

    Priority:
      1. Internal presence store (friend/relationship presences from READY + PRESENCE_UPDATE)
      2. Guild member objects (online members cached from GUILD_CREATE + PRESENCE_UPDATE)
      3. Offline fallback
    """
    try:
        state = client._connection
        p = state.get_presence(user_id)
        if p is not None:
            return _presence_obj_to_vm(p)
    except Exception:
        pass

    for guild in client.guilds:
        member = guild.get_member(user_id)
        if member is not None:
            try:
                return presence_to_vm(member)
            except Exception:
                continue

    return {"status": "Offline", "presence": "", "type": ""}


def user_to_vm(client: discord.Client, user: Any) -> dict:
    if user is None or not hasattr(user, "id"):
        return {
            "id": "0",
            "name": "Unknown User",
            "username": "unknown",
            "avatar": "",
            "presence": {"status": "Offline", "presence": "", "type": ""},
        }

    name = (
        getattr(user, "display_name", None)
        or getattr(user, "global_name", None)
        or getattr(user, "name", None)
        or "Unknown"
    )

    if hasattr(user, "status"):
        presence = presence_to_vm(user)
    else:
        presence = resolve_user_presence(client, user.id)

    return {
        "id": str(user.id),
        "name": name,
        "username": getattr(user, "name", "unknown"),
        "avatar": _avatar_url(user, 64),
        "presence": presence,
    }


def member_to_vm(client: discord.Client, member: discord.Member) -> dict:
    if member is None:
        return user_to_vm(client, None)

    role_icon: Optional[str] = None
    try:
        icon_role = next(
            (r for r in sorted(member.roles, key=lambda r: r.position, reverse=True) if r.icon is not None),
            None,
        )
        if icon_role and icon_role.icon:
            role_icon = str(icon_role.icon.url) if hasattr(icon_role.icon, "url") else str(icon_role.display_icon)
    except Exception:
        pass

    color = str(member.color) if member.color and str(member.color) != "#000000" else "#525252"

    try:
        presence = presence_to_vm(member)
    except Exception:
        presence = resolve_user_presence(client, member.id)

    vm: dict[str, Any] = {
        "id": str(member.id),
        "name": member.nick or member.display_name or member.name,
        "username": member.name,
        "avatar": _avatar_url(member, 64),
        "presence": presence,
        "color": color,
    }
    if role_icon:
        vm["roleIcon"] = role_icon
    return vm


def attachment_to_vm(attachment: discord.Attachment) -> dict:
    vm: dict[str, Any] = {
        "id": str(attachment.id),
        "url": attachment.url,
        "proxyUrl": attachment.proxy_url,
        "filename": attachment.filename or "unknown",
        "size": attachment.size,
    }
    if attachment.width is not None:
        vm["width"] = attachment.width
    if attachment.height is not None:
        vm["height"] = attachment.height
    if attachment.content_type is not None:
        vm["contentType"] = attachment.content_type
    return vm


def embed_to_vm(embed: discord.Embed) -> dict:
    vm: dict[str, Any] = {
        "fields": [
            {"name": f.name, "value": f.value, "inline": bool(f.inline)}
            for f in (embed.fields or [])
        ],
    }
    if embed.title:
        vm["title"] = embed.title
    if embed.description:
        vm["description"] = embed.description
    if embed.url:
        vm["url"] = embed.url
    if embed.color:
        vm["color"] = str(embed.color)
    if embed.author:
        author: dict[str, Any] = {"name": embed.author.name or ""}
        if embed.author.url:
            author["url"] = str(embed.author.url)
        if embed.author.icon_url:
            author["iconUrl"] = str(embed.author.icon_url)
        vm["author"] = author
    if embed.thumbnail:
        thumb: dict[str, Any] = {"url": str(embed.thumbnail.url)}
        if embed.thumbnail.width:
            thumb["width"] = embed.thumbnail.width
        if embed.thumbnail.height:
            thumb["height"] = embed.thumbnail.height
        vm["thumbnail"] = thumb
    if embed.image:
        img: dict[str, Any] = {"url": str(embed.image.url)}
        if embed.image.width:
            img["width"] = embed.image.width
        if embed.image.height:
            img["height"] = embed.image.height
        vm["image"] = img
    if embed.video:
        vid: dict[str, Any] = {"url": str(embed.video.url)}
        if getattr(embed.video, "width", None) is not None:
            vid["width"] = embed.video.width
        if getattr(embed.video, "height", None) is not None:
            vid["height"] = embed.video.height
        vm["video"] = vid
    if embed.footer:
        foot: dict[str, Any] = {"text": embed.footer.text or ""}
        if embed.footer.icon_url:
            foot["iconUrl"] = str(embed.footer.icon_url)
        vm["footer"] = foot
    return vm


def _resolve_mentions_in_content(content: str, message: discord.Message, client: discord.Client) -> str:
    def replace_user_mention(match: re.Match) -> str:
        uid = int(match.group(1))
        user = message.guild.get_member(uid) if message.guild else client.get_user(uid)
        if user is None:
            user = client.get_user(uid)
        if user:
            return f"@{getattr(user, 'display_name', None) or getattr(user, 'name', 'unknown')}"
        return "@unknown"

    def replace_role_mention(match: re.Match) -> str:
        rid = int(match.group(1))
        if message.guild:
            role = message.guild.get_role(rid)
            if role:
                return f"@{role.name}"
        return "@unknown-role"

    def replace_channel_mention(match: re.Match) -> str:
        cid = int(match.group(1))
        ch = client.get_channel(cid)
        if ch:
            return f"#{getattr(ch, 'name', 'unknown')}"
        return "#unknown"

    content = re.sub(r"<@!?(\d+)>", replace_user_mention, content)
    content = re.sub(r"<@&(\d+)>", replace_role_mention, content)
    content = re.sub(r"<#(\d+)>", replace_channel_mention, content)
    return content


def message_to_vm(client: discord.Client, msg: discord.Message, self_id: Optional[int] = None) -> dict:
    if msg.author is None:
        return _message_fallback(client, msg)

    if msg.guild and isinstance(msg.author, discord.Member):
        author = member_to_vm(client, msg.author)
    elif msg.guild and not isinstance(msg.author, discord.Member):
        member = msg.guild.get_member(msg.author.id)
        if member is not None:
            author = member_to_vm(client, member)
        else:
            author = user_to_vm(client, msg.author)
    else:
        author = user_to_vm(client, msg.author)

    content = msg.content or ""
    content = normalize_emoji(content)
    special = False

    if msg.content == "[nudge]":
        is_self = self_id is not None and msg.author.id == self_id
        who = "You have" if is_self else f"{author['name']} has"
        content = f"{who} just sent a nudge."
        special = True

    special_messages = {
        "guild_member_join": f"{author['name']} has entered the conversation.",
        "recipient_add": f"{author['name']} has been added to the group.",
        "recipient_remove": f"{author['name']} has been removed from the group.",
        "call": f"{author['name']} has started a call.",
        "pins_add": f"{author['name']} pinned a message to this channel.",
        "channel_name_change": f"{author['name']} has changed the group name to {msg.content}.",
    }

    msg_type_str = str(msg.type).split(".")[-1].lower() if msg.type else "default"

    special_msg = special_messages.get(msg_type_str)
    if special_msg:
        content = special_msg
        special = True

    attachments = [attachment_to_vm(a) for a in msg.attachments]
    embeds = [embed_to_vm(e) for e in msg.embeds]

    reply_message = None
    if msg.reference and msg.reference.message_id:
        ref = msg.reference.resolved
        if isinstance(ref, discord.Message):
            reply_message = message_to_vm(client, ref, self_id)

    mentions = [
        {"id": str(u.id), "name": getattr(u, "display_name", None) or u.name}
        for u in msg.mentions
    ]

    mentions_self = False
    if self_id:
        mentions_self = any(u.id == self_id for u in msg.mentions) or msg.mention_everyone
        if not mentions_self and msg.guild:
            me = msg.guild.get_member(self_id)
            if me and me.roles:
                mentioned_role_ids = {r.id for r in msg.role_mentions}
                mentions_self = any(r.id in mentioned_role_ids for r in me.roles)

    content = _resolve_mentions_in_content(content, msg, client)

    mention_roles = [
        {"id": str(r.id), "name": r.name or "unknown"}
        for r in msg.role_mentions
    ]

    type_mapping = {
        "default": "DEFAULT",
        "recipient_add": "RECIPIENT_ADD",
        "recipient_remove": "RECIPIENT_REMOVE",
        "call": "CALL",
        "channel_name_change": "CHANNEL_NAME_CHANGE",
        "channel_icon_change": "CHANNEL_ICON_CHANGE",
        "pins_add": "CHANNEL_PINNED_MESSAGE",
        "guild_member_join": "GUILD_MEMBER_JOIN",
        "reply": "REPLY",
    }
    vm_type = type_mapping.get(msg_type_str, msg_type_str.upper())

    vm: dict[str, Any] = {
        "id": str(msg.id),
        "channelId": str(msg.channel.id),
        "author": author,
        "content": content,
        "rawContent": msg.content or "",
        "timestamp": msg.created_at.isoformat() if msg.created_at else "",
        "special": special,
        "isReply": msg_type_str == "reply",
        "isTTS": msg.tts,
        "attachments": attachments,
        "embeds": embeds,
        "type": vm_type,
        "mentions": mentions,
        "mentionRoles": mention_roles,
        "mentionsSelf": mentions_self,
    }
    if reply_message:
        vm["replyMessage"] = reply_message
    return vm


def _message_fallback(client: discord.Client, msg: discord.Message) -> dict:
    content = normalize_emoji(msg.content or "")
    attachments = [attachment_to_vm(a) for a in msg.attachments] if msg.attachments else []
    embeds = [embed_to_vm(e) for e in msg.embeds] if msg.embeds else []
    msg_type_str = str(msg.type).split(".")[-1].lower() if msg.type else "default"

    return {
        "id": str(msg.id) if msg.id else "",
        "channelId": str(msg.channel.id) if msg.channel else "",
        "author": user_to_vm(client, None),
        "content": content,
        "rawContent": msg.content or "",
        "timestamp": msg.created_at.isoformat() if msg.created_at else "",
        "special": False,
        "isReply": msg_type_str == "reply",
        "isTTS": getattr(msg, "tts", False),
        "attachments": attachments,
        "embeds": embeds,
        "type": msg_type_str.upper(),
        "mentions": [],
        "mentionRoles": [],
        "mentionsSelf": False,
    }


def channel_to_vm(client: discord.Client, channel: Any) -> dict:
    base: dict[str, Any] = {
        "id": str(channel.id),
        "name": "",
        "topic": "",
        "type": _channel_type_str(channel),
        "channelType": "text",
        "canTalk": True,
        "canManageMessages": False,
        "canAttachFiles": True,
    }

    if isinstance(channel, discord.DMChannel):
        recipient = channel.recipient
        base["name"] = (getattr(recipient, "display_name", None) or getattr(recipient, "name", "DM")) if recipient else "DM"
        base["recipients"] = [user_to_vm(client, recipient)] if recipient else []
        if recipient:
            try:
                accent = getattr(recipient, "accent_color", None) or getattr(recipient, "accent_colour", None)
                base["recipientAccentColor"] = str(accent) if accent else None
            except Exception:
                base["recipientAccentColor"] = None
    elif isinstance(channel, discord.GroupChannel):
        recipients = channel.recipients or []
        base["name"] = channel.name or ", ".join(
            getattr(r, "display_name", None) or r.name for r in recipients
        ) or "Group"
        base["isGroupChat"] = True
        base["recipients"] = [user_to_vm(client, r) for r in recipients]
    elif isinstance(channel, discord.TextChannel):
        base["name"] = channel.name
        base["topic"] = channel.topic or ""
        base["guildId"] = str(channel.guild.id)
        base["guildName"] = channel.guild.name
        base["position"] = channel.position
        base["parentId"] = str(channel.category_id) if channel.category_id else None
        me = channel.guild.me
        if me:
            perms = channel.permissions_for(me)
            base["canTalk"] = perms.send_messages
            base["canManageMessages"] = perms.manage_messages
            base["canAttachFiles"] = perms.attach_files
    elif isinstance(channel, discord.VoiceChannel) or isinstance(channel, discord.StageChannel):
        base["name"] = channel.name
        base["channelType"] = "voice"
        base["guildId"] = str(channel.guild.id)
        base["guildName"] = channel.guild.name
        base["position"] = channel.position
        base["parentId"] = str(channel.category_id) if channel.category_id else None
        base["canTalk"] = False
    elif isinstance(channel, discord.CategoryChannel):
        base["name"] = channel.name
        base["channelType"] = "category"
        base["guildId"] = str(channel.guild.id)
        base["guildName"] = channel.guild.name
        base["position"] = channel.position
        base["canTalk"] = False

    return base


def _channel_type_str(channel: Any) -> str:
    """Map discord.py ChannelType to the string format used by the renderer."""
    ct = getattr(channel, "type", None)
    if ct is None:
        return "UNKNOWN"
    mapping = {
        discord.ChannelType.text: "GUILD_TEXT",
        discord.ChannelType.private: "DM",
        discord.ChannelType.voice: "GUILD_VOICE",
        discord.ChannelType.group: "GROUP_DM",
        discord.ChannelType.category: "GUILD_CATEGORY",
        discord.ChannelType.news: "GUILD_NEWS",
        discord.ChannelType.stage_voice: "GUILD_STAGE_VOICE",
        discord.ChannelType.forum: "GUILD_FORUM",
    }
    return mapping.get(ct, str(ct).split(".")[-1].upper())
