import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '../main/ipc/channels';

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.APP_GET_VERSION) as Promise<string>,
  },
  auth: {
    login: (token: string, save: boolean, status: string) =>
      ipcRenderer.invoke(IPC.AUTH_LOGIN, token, save, status),
    logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    getState: () => ipcRenderer.invoke(IPC.AUTH_GET_STATE),
  },
  user: {
    getCurrent: () => ipcRenderer.invoke(IPC.USER_GET_CURRENT),
    setStatus: (status: string) => ipcRenderer.invoke(IPC.USER_SET_STATUS, status),
    setCustomStatus: (text: string | null) => ipcRenderer.invoke(IPC.USER_SET_CUSTOM_STATUS, text),
    getProfile: (userId: string) => ipcRenderer.invoke(IPC.USER_GET_PROFILE, userId),
  },
  contacts: {
    getPrivateChannels: () => ipcRenderer.invoke(IPC.CONTACTS_GET_PRIVATE_CHANNELS),
    getGuilds: () => ipcRenderer.invoke(IPC.CONTACTS_GET_GUILDS),
    sendFriendRequest: (username: string) =>
      ipcRenderer.invoke(IPC.CONTACTS_SEND_FRIEND_REQUEST, username) as Promise<{ success: boolean; error?: string }>,
    getPendingRequests: () => ipcRenderer.invoke(IPC.CONTACTS_GET_PENDING_REQUESTS),
    acceptFriendRequest: (userId: string) => ipcRenderer.invoke(IPC.CONTACTS_ACCEPT_FRIEND_REQUEST, userId),
    ignoreFriendRequest: (userId: string) => ipcRenderer.invoke(IPC.CONTACTS_IGNORE_FRIEND_REQUEST, userId),
    getFriends: () => ipcRenderer.invoke(IPC.CONTACTS_GET_FRIENDS) as Promise<string[]>,
    removeFriend: (userId: string) => ipcRenderer.invoke(IPC.CONTACTS_REMOVE_FRIEND, userId) as Promise<{ success: boolean; error?: string }>,
    getFavorites: () => ipcRenderer.invoke(IPC.CONTACTS_GET_FAVORITES),
    setFavorites: (ids: string[]) => ipcRenderer.invoke(IPC.CONTACTS_SET_FAVORITES, ids),
  },
  messages: {
    get: (channelId: string) => ipcRenderer.invoke(IPC.MESSAGES_GET, channelId),
    getBefore: (channelId: string, beforeId: string, limit?: number) =>
      ipcRenderer.invoke(IPC.MESSAGES_GET_BEFORE, channelId, beforeId, limit),
    send: (channelId: string, content: string, attachmentPaths?: string[], attachmentUrls?: string[], replyToMessageId?: string) =>
      ipcRenderer.invoke(IPC.MESSAGES_SEND, channelId, content, attachmentPaths, attachmentUrls, replyToMessageId),
    edit: (channelId: string, messageId: string, content: string) =>
      ipcRenderer.invoke(IPC.MESSAGES_EDIT, channelId, messageId, content),
    delete: (channelId: string, messageId: string) =>
      ipcRenderer.invoke(IPC.MESSAGES_DELETE, channelId, messageId),
    triggerTyping: (channelId: string) => ipcRenderer.invoke(IPC.MESSAGES_TRIGGER_TYPING, channelId),
    ack: (channelId: string, messageId: string) => ipcRenderer.invoke(IPC.MESSAGES_ACK, channelId, messageId),
  },
  channels: {
    get: (channelId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET, channelId),
    getGuildChannels: (guildId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET_GUILD_CHANNELS, guildId),
    getMembers: (channelId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke(IPC.CHANNELS_GET_MEMBERS, channelId, limit, offset),
    searchMembers: (channelId: string, query: string, limit?: number) =>
      ipcRenderer.invoke(IPC.CHANNELS_SEARCH_MEMBERS, channelId, query, limit),
    getOrCreateDM: (userId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET_OR_CREATE_DM, userId) as Promise<string>,
    closeConversation: (channelId: string) => ipcRenderer.invoke(IPC.CHANNELS_CLOSE_CONVERSATION, channelId) as Promise<{ success: boolean; error?: string }>,
  },
  voice: {
    join: (channelId: string) => ipcRenderer.invoke(IPC.VOICE_JOIN, channelId),
    leave: () => ipcRenderer.invoke(IPC.VOICE_LEAVE),
    setSelfMute: (muted: boolean) => ipcRenderer.invoke(IPC.VOICE_SET_SELF_MUTE, muted),
    setSelfDeafen: (deafened: boolean) => ipcRenderer.invoke(IPC.VOICE_SET_SELF_DEAFEN, deafened),
    setInputVolume: (volume: number) => ipcRenderer.invoke(IPC.VOICE_SET_INPUT_VOLUME, volume),
    getInputVolume: () => ipcRenderer.invoke(IPC.VOICE_GET_INPUT_VOLUME) as Promise<number>,
    setUserVolume: (userId: string, volume: number) =>
      ipcRenderer.invoke(IPC.VOICE_SET_USER_VOLUME, userId, volume),
    getUserVolume: (userId: string) => ipcRenderer.invoke(IPC.VOICE_GET_USER_VOLUME, userId) as Promise<number>,
    setUserMuted: (userId: string, muted: boolean) =>
      ipcRenderer.invoke(IPC.VOICE_SET_USER_MUTED, userId, muted),
    getUserMuted: (userId: string) => ipcRenderer.invoke(IPC.VOICE_GET_USER_MUTED, userId) as Promise<boolean>,
    getVoiceStates: (guildId: string) => ipcRenderer.invoke(IPC.VOICE_GET_STATES, guildId),
    sendAudioChunk: (chunk: ArrayBuffer) => ipcRenderer.send(IPC.VOICE_AUDIO_CHUNK, Buffer.from(chunk)),
    startCall: (channelId: string) => ipcRenderer.invoke(IPC.CALL_START, channelId) as Promise<boolean>,
    acceptCall: (channelId: string) => ipcRenderer.invoke(IPC.CALL_ACCEPT, channelId) as Promise<boolean>,
    declineCall: (channelId: string) => ipcRenderer.invoke(IPC.CALL_DECLINE, channelId) as Promise<void>,
    getCallState: () => ipcRenderer.invoke(IPC.CALL_GET_STATE) as Promise<{ callState: string; callChannelId: string | null }>,
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (partial: Record<string, unknown>) => ipcRenderer.invoke(IPC.SETTINGS_UPDATE, partial),
  },
  theme: {
    getScenes: () => ipcRenderer.invoke(IPC.THEME_GET_SCENES),
    setCurrent: (sceneId: number) => ipcRenderer.invoke(IPC.THEME_SET_SCENE, sceneId),
    getCurrent: () => ipcRenderer.invoke(IPC.THEME_GET_CURRENT),
  },
  assets: {
    getPath: () => ipcRenderer.invoke(IPC.ASSETS_GET_PATH),
    listGifs: () => ipcRenderer.invoke(IPC.ASSETS_LIST_GIFS) as Promise<string[]>,
  },
  gifs: {
    hasKeys: () => ipcRenderer.invoke(IPC.GIFS_HAS_KEYS) as Promise<boolean>,
    fetchTrending: (limit?: number) =>
      ipcRenderer.invoke(IPC.GIFS_FETCH_TRENDING, limit) as Promise<{ id: string; url: string; fullUrl?: string }[]>,
    search: (q: string, limit?: number) =>
      ipcRenderer.invoke(IPC.GIFS_SEARCH, q, limit) as Promise<{ id: string; url: string; fullUrl?: string }[]>,
  },
  dialog: {
    pickFiles: (options: { type: 'images' | 'files'; maxSizeBytes?: number }) =>
      ipcRenderer.invoke(IPC.DIALOG_PICK_FILES, options) as Promise<
        { ok: true; filePaths: string[] } | { ok: false; error: 'FILE_TOO_LARGE'; filePaths: string[] }
      >,
  },
  files: {
    writeTemp: (base64: string, extension: string) =>
      ipcRenderer.invoke(IPC.FILES_WRITE_TEMP, base64, extension) as Promise<string>,
    getPreviewDataUrl: (filePath: string) =>
      ipcRenderer.invoke(IPC.FILES_GET_PREVIEW_DATA_URL, filePath) as Promise<string | null>,
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url) as Promise<void>,
  },
  windows: {
    openChat: (channelId: string) => ipcRenderer.invoke(IPC.WINDOW_OPEN_CHAT, channelId),
    openSettings: () => ipcRenderer.invoke(IPC.WINDOW_OPEN_SETTINGS),
    openNotification: (data: unknown) => ipcRenderer.invoke(IPC.WINDOW_OPEN_NOTIFICATION, data),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld('aerocord', api);
