import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';

const api = {
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
    getPendingRequests: () => ipcRenderer.invoke(IPC.CONTACTS_GET_PENDING_REQUESTS),
    getFavorites: () => ipcRenderer.invoke(IPC.CONTACTS_GET_FAVORITES),
    setFavorites: (ids: string[]) => ipcRenderer.invoke(IPC.CONTACTS_SET_FAVORITES, ids),
  },
  messages: {
    get: (channelId: string) => ipcRenderer.invoke(IPC.MESSAGES_GET, channelId),
    send: (channelId: string, content: string, attachmentPaths?: string[]) =>
      ipcRenderer.invoke(IPC.MESSAGES_SEND, channelId, content, attachmentPaths),
    edit: (channelId: string, messageId: string, content: string) =>
      ipcRenderer.invoke(IPC.MESSAGES_EDIT, channelId, messageId, content),
    delete: (channelId: string, messageId: string) =>
      ipcRenderer.invoke(IPC.MESSAGES_DELETE, channelId, messageId),
    triggerTyping: (channelId: string) => ipcRenderer.invoke(IPC.MESSAGES_TRIGGER_TYPING, channelId),
  },
  channels: {
    get: (channelId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET, channelId),
    getGuildChannels: (guildId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET_GUILD_CHANNELS, guildId),
    getMembers: (channelId: string) => ipcRenderer.invoke(IPC.CHANNELS_GET_MEMBERS, channelId),
  },
  voice: {
    join: (channelId: string) => ipcRenderer.invoke(IPC.VOICE_JOIN, channelId),
    leave: () => ipcRenderer.invoke(IPC.VOICE_LEAVE),
    setSelfMute: (muted: boolean) => ipcRenderer.invoke(IPC.VOICE_SET_SELF_MUTE, muted),
    setSelfDeafen: (deafened: boolean) => ipcRenderer.invoke(IPC.VOICE_SET_SELF_DEAFEN, deafened),
    setUserVolume: (userId: string, volume: number) =>
      ipcRenderer.invoke(IPC.VOICE_SET_USER_VOLUME, userId, volume),
    getVoiceStates: (guildId: string) => ipcRenderer.invoke(IPC.VOICE_GET_STATES, guildId),
    sendAudioChunk: (chunk: ArrayBuffer) => ipcRenderer.send(IPC.VOICE_AUDIO_CHUNK, Buffer.from(chunk).toString('base64')),
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
  windows: {
    openChat: (channelId: string) => ipcRenderer.invoke(IPC.WINDOW_OPEN_CHAT, channelId),
    openSettings: () => ipcRenderer.invoke(IPC.WINDOW_OPEN_SETTINGS),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld('aerocord', api);
