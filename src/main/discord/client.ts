import { Client, Message, Channel, DMChannel, Guild, GuildChannel, TextChannel, GuildMember, Presence } from 'discord.js-selfbot-v13';
import { safeStorage } from 'electron';
import { settingsManager } from '../services/settings';
import { normalizeEmojiInContent } from './emojiNormalize';
import type { UserVM, PresenceVM, MessageVM, AttachmentVM, EmbedVM, ChannelVM, HomeListItemVM, HomeListCategoryVM, GuildVM, VoiceChannelStateVM, VoiceStateVM } from '../../renderer/shared/types';

class DiscordClientWrapper {
  private static _instance: DiscordClientWrapper;
  private _client: Client | null = null;
  private _ready = false;

  static get instance(): DiscordClientWrapper {
    if (!DiscordClientWrapper._instance) {
      DiscordClientWrapper._instance = new DiscordClientWrapper();
    }
    return DiscordClientWrapper._instance;
  }

  get client(): Client | null {
    return this._client;
  }

  get ready(): boolean {
    return this._ready;
  }

  async login(token: string, save: boolean, status: string): Promise<string> {
    try {
      if (this._client) {
        this._client.destroy();
        this._client = null;
      }

      this._client = new Client({ checkUpdate: false } as any);
      this._ready = false;

      return new Promise((resolve) => {
        let resolved = false;
        const finish = (result: string) => {
          if (resolved) return;
          resolved = true;
          resolve(result);
        };

        const timeout = setTimeout(() => {
          console.error('[Aerocord] Login timed out after 30s');
          finish('unknown');
        }, 30000);

        this._client!.once('ready', () => {
          clearTimeout(timeout);
          this._ready = true;
          console.log('[Aerocord] Discord client ready');

          if (save) {
            try {
              const encrypted = safeStorage.encryptString(token);
              settingsManager.update({ token: encrypted.toString('base64'), hasUserLoggedInBefore: true });
            } catch {
              settingsManager.update({ token: '', hasUserLoggedInBefore: true });
            }
          }

          finish('success');
        });

        this._client!.on('error', (err: Error) => {
          clearTimeout(timeout);
          console.error('[Aerocord] Client error:', err.message);
          finish('unknown');
        });

        this._client!.login(token).catch((err: Error) => {
          clearTimeout(timeout);
          console.error('[Aerocord] Login error:', err.message);
          const msg = err.message?.toLowerCase() || '';
          if (msg.includes('unauthorized') || msg.includes('token') || msg.includes('401')) {
            finish('unauthorized');
          } else if (msg.includes('bad request') || msg.includes('400')) {
            finish('badRequest');
          } else if (msg.includes('500') || msg.includes('server')) {
            finish('serverError');
          } else {
            finish('unknown');
          }
        });
      });
    } catch (e) {
      console.error('[Aerocord] Login exception:', e);
      return 'unknown';
    }
  }

  async logout(): Promise<void> {
    this._ready = false;
    if (this._client) {
      this._client.destroy();
      this._client = null;
    }
    settingsManager.update({ token: '' });
  }

  getSavedToken(): string | null {
    const b64 = settingsManager.settings.token;
    if (!b64) return null;
    try {
      const buf = Buffer.from(b64, 'base64');
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }

  getCurrentUser(): UserVM | null {
    if (!this._client?.user) return null;
    const u = this._client.user;
    return {
      id: u.id,
      name: u.displayName ?? u.username,
      username: u.username,
      avatar: u.displayAvatarURL({ dynamic: true, size: 128 }),
      presence: this.presenceToVM(u.presence),
    };
  }

  async setStatus(status: string): Promise<void> {
    if (!this._client?.user) return;
    const mapping: Record<string, string> = {
      'Online': 'online',
      'Idle': 'idle',
      'DoNotDisturb': 'dnd',
      'Invisible': 'invisible',
    };
    const discordStatus = mapping[status] || 'online';
    await this._client.user.setStatus(discordStatus as any);
  }

  async setCustomStatus(text: string | null): Promise<void> {
    if (!this._client?.user) return;
    if (text != null && text.trim() !== '') {
      this._client.user.setActivity({ name: ' ', type: 'CUSTOM' as any, state: text.trim() });
    } else {
      this._client.user.setActivity(null as any);
    }
  }

  getPrivateChannels(): HomeListItemVM[] {
    if (!this._client) return [];

    const channels = Array.from(this._client.channels.cache.values())
      .filter((c): c is DMChannel => c.type === 'DM' || (c as any).type === 'GROUP_DM');

    const items: HomeListItemVM[] = [];
    for (const ch of channels) {
      const dm = ch as DMChannel;
      const recipient = dm.recipient;
      const isGroup = (ch as any).type === 'GROUP_DM';

      let name = '';
      if (isGroup) {
        name = (ch as any).name || (ch as any).recipients?.map((r: any) => r.displayName ?? r.username).join(', ') || 'Group Chat';
      } else if (recipient) {
        name = recipient.displayName ?? recipient.username;
      } else {
        continue;
      }

      let image: string | undefined;
      if (recipient) {
        image = recipient.displayAvatarURL?.({ dynamic: true, size: 32 }) || undefined;
      } else if (isGroup && (ch as any).iconURL) {
        image = (ch as any).iconURL({ dynamic: true, size: 32 });
      }

      let presence: PresenceVM;
      if (recipient) {
        presence = this.resolveUserPresence(recipient.id);
      } else if (isGroup) {
        const groupRecipients: any[] = Array.from((ch as any).recipients?.values?.() ?? []);
        const anyOnline = groupRecipients.some(r => {
          const p = this.resolveUserPresence(r.id);
          return p.status !== 'Offline';
        });
        presence = { status: anyOnline ? 'Online' : 'Offline', presence: '', type: '' };
      } else {
        presence = { status: 'Offline', presence: '', type: '' };
      }

      items.push({
        id: ch.id,
        recipientId: recipient?.id,
        name,
        presence,
        lastMsgId: dm.lastMessageId ?? ch.id,
        isGroupChat: isGroup,
        recipientCount: isGroup ? ((ch as any).recipients?.size ?? 0) + 1 : 2,
        image,
      });
    }

    items.sort((a, b) => {
      const aId = BigInt(a.lastMsgId || '0');
      const bId = BigInt(b.lastMsgId || '0');
      return bId > aId ? 1 : bId < aId ? -1 : 0;
    });

    return items;
  }

  resolveUserPresence(userId: string): PresenceVM {
    if (!this._client) return { status: 'Offline', presence: '', type: '' };

    const user = this._client.users.cache.get(userId);
    if ((user as any)?.presence) {
      return this.presenceToVM((user as any).presence);
    }

    const globalPresence = (this._client as any).presences?.cache?.get(userId);
    if (globalPresence) {
      return this.presenceToVM(globalPresence);
    }

    for (const guild of this._client.guilds.cache.values()) {
      const member = guild.members.cache.get(userId);
      if (member?.presence) {
        return this.presenceToVM(member.presence);
      }

      const guildPresence = (guild.presences as any)?.cache?.get(userId);
      if (guildPresence) {
        return this.presenceToVM(guildPresence);
      }
    }

    return { status: 'Offline', presence: '', type: '' };
  }

  getGuilds(): HomeListCategoryVM[] {
    if (!this._client) return [];

    const categories: HomeListCategoryVM[] = [
      { name: 'Servers', collapsed: false, items: [] },
    ];

    const guilds = Array.from(this._client.guilds.cache.values())
      .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0));

    for (const guild of guilds) {
      const textChannels = Array.from(guild.channels.cache.values())
        .filter((c): c is TextChannel => c.type === 'GUILD_TEXT')
        .sort((a, b) => a.position - b.position);

      const firstChannel = textChannels[0];
      if (!firstChannel) continue;

      categories[0].items.push({
        id: firstChannel.id,
        name: guild.name,
        presence: { status: 'Online', presence: '', type: '' },
        lastMsgId: firstChannel.lastMessageId ?? firstChannel.id,
        isGroupChat: false,
        recipientCount: guild.memberCount,
        image: guild.iconURL({ dynamic: true, size: 32 }) ?? undefined,
      });
    }

    return categories;
  }

  async getMessages(channelId: string): Promise<MessageVM[]> {
    if (!this._client) return [];
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel || !('messages' in channel)) return [];
      const textChannel = channel as TextChannel;
      const messages = await textChannel.messages.fetch({ limit: 50 });
      return Array.from(messages.values())
        .reverse()
        .map(m => this.messageToVM(m));
    } catch {
      return [];
    }
  }

  async sendMessage(channelId: string, content: string, attachmentPaths?: string[]): Promise<boolean> {
    if (!this._client) return false;
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel || !('send' in channel)) return false;
      const textChannel = channel as TextChannel;

      // Discord requires non-empty content; use zero-width space when sending only attachments
      const sendContent = content.trim() || (attachmentPaths?.length ? '\u200B' : '');
      if (!sendContent && !attachmentPaths?.length) return false;

      const opts: any = { content: sendContent };
      if (attachmentPaths?.length) {
        opts.files = attachmentPaths;
      }
      await textChannel.send(opts);
      return true;
    } catch (e) {
      console.error('Failed to send message:', e);
      return false;
    }
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<boolean> {
    if (!this._client) return false;
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel || !('messages' in channel)) return false;
      const textChannel = channel as TextChannel;
      const msg = await textChannel.messages.fetch(messageId);
      await msg.edit(content);
      return true;
    } catch {
      return false;
    }
  }

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    if (!this._client) return false;
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel || !('messages' in channel)) return false;
      const textChannel = channel as TextChannel;
      const msg = await textChannel.messages.fetch(messageId);
      await msg.delete();
      return true;
    } catch {
      return false;
    }
  }

  async triggerTyping(channelId: string): Promise<void> {
    if (!this._client) return;
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (channel && 'sendTyping' in channel) {
        await (channel as TextChannel).sendTyping();
      }
    } catch { /* ignore */ }
  }

  async getChannel(channelId: string): Promise<ChannelVM | null> {
    if (!this._client) return null;
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel) return null;
      return await this.channelToVM(channel as any);
    } catch {
      return null;
    }
  }

  async getGuildChannels(guildId: string): Promise<ChannelVM[]> {
    if (!this._client) return [];
    const guild = this._client.guilds.cache.get(guildId);
    if (!guild) return [];
    const filtered = Array.from(guild.channels.cache.values())
      .filter((c: any) =>
        c.type === 'GUILD_TEXT' || c.type === 'GUILD_VOICE' ||
        c.type === 'GUILD_STAGE_VOICE' || c.type === 'GUILD_CATEGORY')
      .sort((a: any, b: any) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
    return Promise.all(filtered.map((c: any) => this.channelToVM(c)));
  }

  getVoiceStates(guildId: string): VoiceChannelStateVM[] {
    if (!this._client) return [];
    const guild = this._client.guilds.cache.get(guildId);
    if (!guild) return [];

    const channelMap = new Map<string, VoiceStateVM[]>();

    for (const [, vs] of guild.voiceStates.cache) {
      if (!vs.channelId) continue;
      const member = vs.member || guild.members.cache.get(vs.id);
      if (!member) continue;

      if (!channelMap.has(vs.channelId)) {
        channelMap.set(vs.channelId, []);
      }
      const isClientUser = member.id === this._client!.user?.id;
      const presence = isClientUser
        ? (this._client!.user as any)?.presence
        : (member.presence ?? guild.presences?.cache?.get(member.id));
      let userStatus: 'Online' | 'Idle' | 'DoNotDisturb' | 'Offline' = isClientUser ? 'Online' : 'Offline';
      if (presence) {
        const s = (presence as any).status;
        if (s === 'online') userStatus = 'Online';
        else if (s === 'idle') userStatus = 'Idle';
        else if (s === 'dnd') userStatus = 'DoNotDisturb';
      }
      channelMap.get(vs.channelId)!.push({
        userId: member.id,
        userName: member.displayName ?? member.user?.username ?? 'Unknown',
        userAvatar: member.user?.displayAvatarURL?.({ size: 32 }) ?? '',
        userStatus,
        selfMute: vs.selfMute ?? false,
        selfDeaf: vs.selfDeaf ?? false,
        speaking: false,
      });
    }

    const result: VoiceChannelStateVM[] = [];
    for (const [channelId, members] of channelMap) {
      result.push({ channelId, members });
    }
    return result;
  }

  async getChannelMembers(channelId: string): Promise<UserVM[]> {
    if (!this._client) return [];
    try {
      const channel = await this._client.channels.fetch(channelId);
      if (!channel) return [];

      if (channel.type === 'GROUP_DM') {
        const group = channel as any;
        return (group.recipients?.map((r: any) => this.userToVM(r)) || []);
      }

      if (channel.type === 'DM') {
        const dm = channel as DMChannel;
        return dm.recipient ? [this.userToVM(dm.recipient)] : [];
      }

      if (channel.type === 'GUILD_TEXT') {
        const tc = channel as TextChannel;
        const members = Array.from(tc.guild.members.cache.values())
          .filter(m => tc.permissionsFor(m)?.has('VIEW_CHANNEL'))
          .sort((a, b) => {
            const aOnline = a.presence?.status !== 'offline' ? 0 : 1;
            const bOnline = b.presence?.status !== 'offline' ? 0 : 1;
            if (aOnline !== bOnline) return aOnline - bOnline;
            return (a.displayName ?? a.user.username).localeCompare(b.displayName ?? b.user.username);
          })
          .slice(0, 50);
        return members.map(m => this.memberToVM(m));
      }

      return [];
    } catch {
      return [];
    }
  }

  // ---- Serialization helpers ----

  presenceToVM(presence: Presence | null | undefined): PresenceVM {
    if (!presence) return { status: 'Offline', presence: '', type: '' };

    const statusMap: Record<string, PresenceVM['status']> = {
      'online': 'Online',
      'idle': 'Idle',
      'dnd': 'DoNotDisturb',
      'invisible': 'Invisible',
      'offline': 'Offline',
    };

    const activity = presence.activities
      ?.sort((a, b) => {
        const priority: Record<string, number> = { CUSTOM: 6, PLAYING: 5, STREAMING: 4, LISTENING: 3, WATCHING: 2, COMPETING: 1 };
        return (priority[b.type] || 0) - (priority[a.type] || 0);
      })?.[0];

    let presenceStr = '';
    let customStatus: string | null = null;

    if (activity) {
      switch (activity.type) {
        case 'CUSTOM' as any:
          presenceStr = activity.state ?? activity.name ?? '';
          customStatus = ((activity.state ?? activity.name) || '').trim() || null;
          break;
        case 'PLAYING' as any:
          presenceStr = activity.name;
          break;
        case 'STREAMING' as any:
          presenceStr = activity.name;
          break;
        case 'LISTENING' as any:
          presenceStr = `${activity.state || ''} - ${activity.details || ''}`;
          break;
        case 'WATCHING' as any:
          presenceStr = activity.name;
          break;
        default:
          presenceStr = activity.name || '';
      }
    }

    return {
      status: statusMap[presence.status] || 'Offline',
      presence: presenceStr.trim(),
      type: activity?.type?.toString() || '',
      customStatus,
    };
  }

  messageToVM(msg: Message): MessageVM {
    if (!msg?.author) {
      return this.messageToVMFallback(msg);
    }
    const author = msg.member
      ? this.memberToVM(msg.member)
      : this.userToVM(msg.author);

    let content = msg.content ?? '';
    content = normalizeEmojiInContent(content);
    let special = false;

    if (msg.content === '[nudge]') {
      content = `${msg.author.id === this._client?.user?.id ? 'You have' : `${author.name} has`} just sent a nudge.`;
      special = true;
    }

    const specialMessages: Record<string, string | undefined> = {
      'GUILD_MEMBER_JOIN': `${author.name} has entered the conversation.`,
      'RECIPIENT_ADD': `${author.name} has been added to the group.`,
      'RECIPIENT_REMOVE': `${author.name} has been removed from the group.`,
      'CALL': `${author.name} has started a call.`,
      'CHANNEL_PINNED_MESSAGE': `${author.name} pinned a message to this channel.`,
      'CHANNEL_NAME_CHANGE': `${author.name} has changed the group name to ${msg.content}.`,
    };

    const specialMsg = specialMessages[msg.type];
    if (specialMsg) {
      content = specialMsg;
      special = true;
    }

    const attachments: AttachmentVM[] = Array.from(msg.attachments.values()).map(a => ({
      id: a.id,
      url: a.url,
      proxyUrl: a.proxyURL,
      filename: a.name || 'unknown',
      size: a.size,
      width: a.width ?? undefined,
      height: a.height ?? undefined,
      contentType: a.contentType ?? undefined,
    }));

    const embeds: EmbedVM[] = msg.embeds.map(e => ({
      title: e.title ?? undefined,
      description: e.description ?? undefined,
      url: e.url ?? undefined,
      color: e.hexColor ?? undefined,
      author: e.author ? { name: e.author.name, url: e.author.url ?? undefined, iconUrl: e.author.iconURL ?? undefined } : undefined,
      thumbnail: e.thumbnail ? { url: e.thumbnail.url, width: e.thumbnail.width ?? undefined, height: e.thumbnail.height ?? undefined } : undefined,
      image: e.image ? { url: e.image.url, width: e.image.width ?? undefined, height: e.image.height ?? undefined } : undefined,
      footer: e.footer ? { text: e.footer.text, iconUrl: e.footer.iconURL ?? undefined } : undefined,
      fields: (e.fields || []).map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })),
    }));

    let replyMessage: MessageVM | undefined;
    if (msg.type === 'REPLY' && msg.reference?.messageId) {
      const refMsg = msg.channel.messages.cache.get(msg.reference.messageId);
      if (refMsg) {
        replyMessage = this.messageToVM(refMsg);
      }
    }

    const mentions = Array.from(msg.mentions.users.values()).map(u => ({
      id: u.id,
      name: (u as any).displayName ?? u.username,
    }));
    const mentionsSelf = msg.mentions.users.has(this._client?.user?.id ?? '') || msg.mentions.everyone;

    content = content.replace(/<@!?(\d+)>/g, (_match, id) => {
      const user = msg.mentions.users.get(id);
      return user ? `@${(user as any).displayName ?? user.username}` : `@unknown`;
    });
    content = content.replace(/<#(\d+)>/g, (_match, id) => {
      const ch = this._client?.channels.cache.get(id);
      return ch ? `#${(ch as any).name}` : `#unknown`;
    });

    return {
      id: msg.id,
      channelId: msg.channelId,
      author,
      content,
      rawContent: msg.content,
      timestamp: msg.createdAt.toISOString(),
      special,
      isReply: msg.type === 'REPLY',
      isTTS: msg.tts,
      replyMessage,
      attachments,
      embeds,
      type: msg.type?.toString() || 'DEFAULT',
      mentions,
      mentionsSelf,
    };
  }

  private messageToVMFallback(msg: Message): MessageVM {
    const unknownAuthor = this.userToVM(null);
    const attachments: AttachmentVM[] = Array.from((msg.attachments?.values?.() ?? [])).map((a: any) => ({
      id: a.id,
      url: a.url,
      proxyUrl: a.proxyURL,
      filename: a.name || 'unknown',
      size: a.size,
      width: a.width ?? undefined,
      height: a.height ?? undefined,
      contentType: a.contentType ?? undefined,
    }));
    const embeds: EmbedVM[] = (msg.embeds ?? []).map((e: any) => ({
      title: e.title ?? undefined,
      description: e.description ?? undefined,
      url: e.url ?? undefined,
      color: e.hexColor ?? undefined,
      author: e.author ? { name: e.author.name, url: e.author.url ?? undefined, iconUrl: e.author.iconURL ?? undefined } : undefined,
      thumbnail: e.thumbnail ? { url: e.thumbnail.url, width: e.thumbnail.width ?? undefined, height: e.thumbnail.height ?? undefined } : undefined,
      image: e.image ? { url: e.image.url, width: e.image.width ?? undefined, height: e.image.height ?? undefined } : undefined,
      footer: e.footer ? { text: e.footer.text, iconUrl: e.footer.iconURL ?? undefined } : undefined,
      fields: (e.fields || []).map((f: any) => ({ name: f.name, value: f.value, inline: f.inline ?? false })),
    }));
    const fallbackContent = msg.content ?? '';
    return {
      id: msg.id ?? '',
      channelId: msg.channelId ?? '',
      author: unknownAuthor,
      content: normalizeEmojiInContent(fallbackContent),
      rawContent: fallbackContent,
      timestamp: msg.createdAt ? (typeof msg.createdAt.toISOString === 'function' ? msg.createdAt.toISOString() : String(msg.createdAt)) : '',
      special: false,
      isReply: msg.type === 'REPLY',
      isTTS: msg.tts ?? false,
      replyMessage: undefined,
      attachments,
      embeds,
      type: msg.type?.toString?.() ?? 'DEFAULT',
      mentions: [],
      mentionsSelf: false,
    };
  }

  async sendFriendRequest(username: string): Promise<{ success: boolean; error?: string }> {
    if (!this._client) return { success: false, error: 'Not connected' };
    try {
      const parts = username.split('#');
      const uname = parts[0].trim();
      const discrim = parts.length > 1 ? parts[1].trim() : undefined;
      await (this._client as any).relationships.sendFriendRequest(uname, discrim || null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to send friend request' };
    }
  }

  getPendingFriendRequests(): HomeListItemVM[] {
    if (!this._client) return [];
    try {
      const relationships = (this._client as any).relationships?.cache;
      if (!relationships) return [];
      const items: HomeListItemVM[] = [];
      for (const [, rel] of relationships) {
        if (rel.type === 3 || rel.type === 4) {
          const user = rel.user;
          if (!user) continue;
          items.push({
            id: user.id,
            recipientId: user.id,
            name: user.displayName ?? user.username,
            presence: this.resolveUserPresence(user.id),
            isGroupChat: false,
            recipientCount: 1,
            image: user.displayAvatarURL?.({ dynamic: true, size: 32 }) || undefined,
          });
        }
      }
      return items;
    } catch {
      return [];
    }
  }

  async getUserProfile(userId: string) {
    if (!this._client) return null;
    try {
      const user = await this._client.users.fetch(userId, { force: true });
      const profile = await (user as any).getProfile?.().catch(() => null);
      const bio = profile?.bio || '';
      const accentColor = user.hexAccentColor || (user.accentColor ? `#${user.accentColor.toString(16).padStart(6, '0')}` : null);
      const bannerUrl = user.bannerURL?.({ dynamic: true, size: 512 }) || null;

      return {
        id: user.id,
        name: (user as any).displayName ?? user.username,
        username: user.username,
        avatar: user.displayAvatarURL({ dynamic: true, size: 128 }),
        bio,
        accentColor,
        bannerUrl,
        presence: this.resolveUserPresence(user.id),
        createdAt: user.createdAt.toISOString(),
      };
    } catch {
      return null;
    }
  }

  userToVM(user: any): UserVM {
    if (user == null || user.id == null) {
      return {
        id: '0',
        name: 'Unknown User',
        username: 'unknown',
        avatar: '',
        presence: { status: 'Offline', presence: '', type: '' },
      };
    }
    return {
      id: user.id,
      name: user.displayName ?? user.username ?? 'Unknown',
      username: user.username ?? 'unknown',
      avatar: user.displayAvatarURL?.({ dynamic: true, size: 64 }) || '',
      presence: this.resolveUserPresence(user.id),
    };
  }

  memberToVM(member: GuildMember): UserVM {
    if (!member?.user) {
      return this.userToVM(null);
    }
    const role = member.roles.cache
      .filter(r => r.icon !== null)
      .sort((a, b) => b.position - a.position)
      .first();

    return {
      id: member.id,
      name: member.nickname || member.displayName || member.user.username,
      username: member.user.username,
      avatar: member.displayAvatarURL({ dynamic: true, size: 64 }),
      presence: member.presence
        ? this.presenceToVM(member.presence)
        : this.resolveUserPresence(member.id),
      color: member.displayHexColor === '#000000' ? '#525252' : member.displayHexColor,
      roleIcon: role?.iconURL() ?? undefined,
    };
  }

  async channelToVM(channel: Channel): Promise<ChannelVM> {
    const base: ChannelVM = {
      id: channel.id,
      name: '',
      topic: '',
      type: channel.type,
      channelType: 'text',
      canTalk: true,
      canManageMessages: false,
      canAttachFiles: true,
    };

    if (channel.type === 'DM') {
      const dm = channel as DMChannel;
      base.name = dm.recipient?.displayName ?? dm.recipient?.username ?? 'DM';
      base.recipients = dm.recipient ? [this.userToVM(dm.recipient)] : [];
      if (dm.recipient) {
        try {
          const fetched = await dm.recipient.fetch(true);
          const accentHex = (fetched as any).hexAccentColor
            || ((fetched as any).accentColor ? `#${(fetched as any).accentColor.toString(16).padStart(6, '0')}` : null);
          base.recipientAccentColor = accentHex || null;
        } catch {
          base.recipientAccentColor = null;
        }
      }
    } else if (channel.type === 'GROUP_DM') {
      const group = channel as any;
      base.name = group.name || group.recipients?.map((r: any) => r.displayName ?? r.username).join(', ') || 'Group';
      base.isGroupChat = true;
      base.recipients = group.recipients?.map((r: any) => this.userToVM(r)) || [];
    } else if (channel.type === 'GUILD_TEXT') {
      const tc = channel as TextChannel;
      base.name = tc.name;
      base.topic = tc.topic || '';
      base.guildId = tc.guild.id;
      base.guildName = tc.guild.name;
      base.position = tc.rawPosition ?? tc.position;
      base.parentId = tc.parentId ?? null;
      const perms = tc.permissionsFor(tc.guild.members.me!);
      base.canTalk = perms?.has('SEND_MESSAGES') ?? false;
      base.canManageMessages = perms?.has('MANAGE_MESSAGES') ?? false;
      base.canAttachFiles = perms?.has('ATTACH_FILES') ?? false;
    } else if (channel.type === 'GUILD_VOICE' || channel.type === 'GUILD_STAGE_VOICE') {
      const vc = channel as any;
      base.name = vc.name;
      base.channelType = 'voice';
      base.guildId = vc.guild?.id;
      base.guildName = vc.guild?.name;
      base.position = vc.rawPosition ?? vc.position;
      base.parentId = vc.parentId ?? null;
      base.canTalk = false;
    } else if (channel.type === 'GUILD_CATEGORY') {
      const cat = channel as any;
      base.name = cat.name;
      base.channelType = 'category';
      base.guildId = cat.guild?.id;
      base.guildName = cat.guild?.name;
      base.position = cat.rawPosition ?? cat.position;
      base.canTalk = false;
    }

    return base;
  }
}

export const discordClient = DiscordClientWrapper.instance;
