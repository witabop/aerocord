export interface UserVM {
  id: string;
  name: string;
  username: string;
  avatar: string;
  presence?: PresenceVM;
  color?: string;
  roleIcon?: string;
  isSpeaking?: boolean;
}

export interface PresenceVM {
  status: 'Online' | 'Idle' | 'DoNotDisturb' | 'Invisible' | 'Offline';
  presence: string;
  type: string;
  customStatus?: string | null;
}

export interface MentionVM {
  id: string;
  name: string;
}

export interface MessageVM {
  id: string;
  channelId: string;
  author: UserVM;
  content: string;
  rawContent: string;
  timestamp: string;
  special: boolean;
  isReply: boolean;
  isTTS: boolean;
  replyMessage?: MessageVM;
  attachments: AttachmentVM[];
  embeds: EmbedVM[];
  type: string;
  mentions: MentionVM[];
  mentionRoles?: MentionVM[];
  mentionsSelf: boolean;
  /** True if message is from a DM or group DM (so we show notification for any message from others). */
  isDirectMessage?: boolean;
  /** Channel id to show notification on in home list (for guilds: first channel id of that server; for DMs: channel id). */
  notifyEntryId?: string;
  /** True if a chat window for this entry is already open (don't show notification icon). */
  notifyEntryOpen?: boolean;
  /** True if the message was edited after sending. */
  edited?: boolean;
}

export interface AttachmentVM {
  id: string;
  url: string;
  proxyUrl: string;
  filename: string;
  size: number;
  width?: number;
  height?: number;
  contentType?: string;
}

export interface EmbedVM {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  author?: { name: string; url?: string; iconUrl?: string };
  thumbnail?: { url: string; width?: number; height?: number };
  image?: { url: string; width?: number; height?: number };
  /** GIFV / Tenor-style embeds: animated content URL (may be .mp4 or .gif) */
  video?: { url: string; width?: number; height?: number };
  footer?: { text: string; iconUrl?: string };
  fields: { name: string; value: string; inline: boolean }[];
}

export interface ChannelVM {
  id: string;
  name: string;
  topic: string;
  type: string;
  channelType: 'text' | 'voice' | 'category';
  canTalk: boolean;
  canManageMessages: boolean;
  canAttachFiles: boolean;
  guildId?: string;
  guildName?: string;
  recipients?: UserVM[];
  isGroupChat?: boolean;
  position?: number;
  parentId?: string | null;
  recipientAccentColor?: string | null;
}

export interface VoiceStateVM {
  userId: string;
  userName: string;
  userAvatar: string;
  userStatus: 'Online' | 'Idle' | 'DoNotDisturb' | 'Offline';
  selfMute: boolean;
  selfDeaf: boolean;
  speaking: boolean;
}

export interface VoiceChannelStateVM {
  channelId: string;
  members: VoiceStateVM[];
}

export interface GuildVM {
  id: string;
  name: string;
  icon?: string;
}

export interface GuildFolderVM {
  name?: string;
  guildIds: string[];
}

export interface HomeListItemVM {
  id: string;
  guildId?: string;
  recipientId?: string;
  name: string;
  presence: PresenceVM;
  lastMsgId?: string;
  isGroupChat: boolean;
  recipientCount: number;
  image?: string;
  hasNotification?: boolean;
}

export interface HomeListCategoryVM {
  name: string;
  collapsed: boolean;
  items: HomeListItemVM[];
}

export interface SceneVM {
  id: number;
  file: string;
  displayName: string;
  color: string;
  isDefault: boolean;
  textColor: string;
  shadowColor: string;
  credit?: string;
}

export interface SettingsData {
  showBetaWarning: boolean;
  notifyFriendOnline: boolean;
  notifyDm: boolean;
  notifyMention: boolean;
  notifyChat: boolean;
  automaticallyOpenNotification: boolean;
  playNotificationSounds: boolean;
  readMessageNotifications: boolean;
  readOnlineNotifications: boolean;
  enableMessageTts: boolean;
  nudgeIntensity: number;
  nudgeLength: number;
  goIdleWithFullscreenProgram: boolean;
  displayUnimplementedButtons: boolean;
  highlightMentions: boolean;
  displayDiscordServerLink: boolean;
  displayHomeNews: boolean;
  displayAds: boolean;
  displayAerochatAttribution: boolean;
  displayLinkPreviews: boolean;
  showMemberList: boolean;
  selectedTimeFormat: '24h' | '12h';
  discordDeveloperMode: boolean;
  inputDeviceIndex: number;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  noiseGateDb: number;
  /** GIF URLs, "local:gifs/filename", or { link, displayUrl } for embed GIFs (e.g. Tenor) so we send the link but display the media. */
  favoriteGifUrls: FavoriteGifEntry[];
  selectedChannels?: Record<string, string>;
}

export type FavoriteGifEntry = string | { link: string; displayUrl: string };

export interface NotificationData {
  type: 'signOn' | 'message' | 'friendRequest';
  user?: UserVM;
  message?: MessageVM;
  channelId?: string;
  presence?: PresenceVM;
  scene?: SceneVM;
}

export interface UserProfileVM {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  accentColor: string | null;
  bannerUrl: string | null;
  presence?: PresenceVM;
  createdAt: string;
}

export type LoginStatus = 'success' | 'unauthorized' | 'badRequest' | 'serverError' | 'unknown';

export type DmCallState = 'idle' | 'outgoing' | 'incoming' | 'active';

export interface AerocordAPI {
  app: {
    getVersion(): Promise<string>;
  };
  auth: {
    login(token: string, save: boolean, status: string): Promise<LoginStatus>;
    logout(): Promise<void>;
    getState(): Promise<{ loggedIn: boolean; hasToken: boolean }>;
  };
  user: {
    getCurrent(): Promise<UserVM | null>;
    setStatus(status: string): Promise<void>;
    setCustomStatus(text: string | null): Promise<void>;
    getProfile(userId: string): Promise<UserProfileVM | null>;
  };
  contacts: {
    getPrivateChannels(): Promise<HomeListItemVM[]>;
    getGuilds(): Promise<HomeListCategoryVM[]>;
    sendFriendRequest(username: string): Promise<{ success: boolean; error?: string }>;
    getPendingRequests(): Promise<HomeListItemVM[]>;
    acceptFriendRequest(userId: string): Promise<{ success: boolean; error?: string }>;
    ignoreFriendRequest(userId: string): Promise<{ success: boolean; error?: string }>;
    getFriends(): Promise<string[]>;
    removeFriend(userId: string): Promise<{ success: boolean; error?: string }>;
    getFavorites(): Promise<string[]>;
    setFavorites(ids: string[]): Promise<void>;
  };
  messages: {
    get(channelId: string): Promise<MessageVM[]>;
    getBefore(channelId: string, beforeId: string, limit?: number): Promise<MessageVM[]>;
    send(channelId: string, content: string, attachmentPaths?: string[], attachmentUrls?: string[]): Promise<{ success: boolean; error?: string }>;
    edit(channelId: string, messageId: string, content: string): Promise<boolean>;
    delete(channelId: string, messageId: string): Promise<boolean>;
    triggerTyping(channelId: string): Promise<void>;
    ack(channelId: string, messageId: string): Promise<void>;
  };
  channels: {
    get(channelId: string): Promise<ChannelVM | null>;
    getGuildChannels(guildId: string): Promise<ChannelVM[]>;
    getMembers(channelId: string, limit?: number, offset?: number): Promise<UserVM[]>;
    searchMembers(channelId: string, query: string, limit?: number): Promise<UserVM[]>;
    getOrCreateDM(userId: string): Promise<string>;
    closeConversation(channelId: string): Promise<{ success: boolean; error?: string }>;
  };
  voice: {
    join(channelId: string): Promise<boolean>;
    leave(): Promise<void>;
    setSelfMute(muted: boolean): Promise<void>;
    setSelfDeafen(deafened: boolean): Promise<void>;
    setInputVolume(volume: number): Promise<void>;
    getInputVolume(): Promise<number>;
    setUserVolume(userId: string, volume: number): Promise<void>;
    getUserVolume(userId: string): Promise<number>;
    setUserMuted(userId: string, muted: boolean): Promise<void>;
    getUserMuted(userId: string): Promise<boolean>;
    getVoiceStates(guildId: string): Promise<VoiceChannelStateVM[]>;
    sendAudioChunk(chunk: ArrayBuffer): void;
    startCall(channelId: string): Promise<boolean>;
    acceptCall(channelId: string): Promise<boolean>;
    declineCall(channelId: string): Promise<void>;
    getCallState(): Promise<{ callState: string; callChannelId: string | null }>;
  };
  settings: {
    get(): Promise<SettingsData>;
    update(partial: Partial<SettingsData>): Promise<void>;
  };
  theme: {
    getScenes(): Promise<SceneVM[]>;
    setCurrent(sceneId: number): Promise<void>;
    getCurrent(): Promise<SceneVM | null>;
  };
  assets: {
    getPath(): Promise<string>;
    listGifs(): Promise<string[]>;
  };
  gifs: {
    hasKeys(): Promise<boolean>;
    fetchTrending(limit?: number): Promise<{ id: string; url: string; fullUrl?: string }[]>;
    search(q: string, limit?: number): Promise<{ id: string; url: string; fullUrl?: string }[]>;
  };
  dialog: {
    pickFiles(options: { type: 'images' | 'files'; maxSizeBytes?: number }): Promise<
      { ok: true; filePaths: string[] } | { ok: false; error: 'FILE_TOO_LARGE'; filePaths: string[] }
    >;
  };
  files: {
    writeTemp(base64: string, extension: string): Promise<string>;
    getPreviewDataUrl(filePath: string): Promise<string | null>;
    getPathForFile(file: File): string;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  windows: {
    openChat(channelId: string): Promise<void>;
    openSettings(): Promise<void>;
    openNotification(data: unknown): Promise<void>;
    close(): Promise<void>;
  };
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    aerocord: AerocordAPI;
  }
}
