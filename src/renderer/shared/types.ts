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
  mentionsSelf: boolean;
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
  selectedTimeFormat: '24h' | '12h';
  discordDeveloperMode: boolean;
  inputDeviceIndex: number;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
}

export interface NotificationData {
  type: 'signOn' | 'message';
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

export interface AerocordAPI {
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
    getFavorites(): Promise<string[]>;
    setFavorites(ids: string[]): Promise<void>;
  };
  messages: {
    get(channelId: string): Promise<MessageVM[]>;
    send(channelId: string, content: string, attachmentPaths?: string[]): Promise<boolean>;
    edit(channelId: string, messageId: string, content: string): Promise<boolean>;
    delete(channelId: string, messageId: string): Promise<boolean>;
    triggerTyping(channelId: string): Promise<void>;
  };
  channels: {
    get(channelId: string): Promise<ChannelVM | null>;
    getGuildChannels(guildId: string): Promise<ChannelVM[]>;
    getMembers(channelId: string): Promise<UserVM[]>;
  };
  voice: {
    join(channelId: string): Promise<boolean>;
    leave(): Promise<void>;
    setSelfMute(muted: boolean): Promise<void>;
    setSelfDeafen(deafened: boolean): Promise<void>;
    setUserVolume(userId: string, volume: number): Promise<void>;
    getVoiceStates(guildId: string): Promise<VoiceChannelStateVM[]>;
    sendAudioChunk(chunk: ArrayBuffer): void;
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
  windows: {
    openChat(channelId: string): Promise<void>;
    openSettings(): Promise<void>;
    close(): Promise<void>;
  };
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    aerocord: AerocordAPI;
  }
}
