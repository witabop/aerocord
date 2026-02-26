import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC } from './channels';
import { discordClient } from '../discord/client';
import { registerDiscordEvents } from '../discord/events';
import { voiceManager } from '../discord/voice';
import { settingsManager } from '../services/settings';
import { themeService } from '../services/theme';
import { windowManager } from '../windows/manager';

export function registerIPCHandlers(): void {
  // ---- Auth ----
  ipcMain.handle(IPC.AUTH_LOGIN, async (_e, token: string, save: boolean, status: string) => {
    const result = await discordClient.login(token, save, status);

    if (result === 'success') {
      registerDiscordEvents();
      windowManager.closeLoginWindow();
      const homeWindow = windowManager.createHomeWindow();
      homeWindow.webContents.once('did-finish-load', () => {
        homeWindow.webContents.send(IPC.EVENT_READY);
      });
      const statusMap: Record<string, string> = {
        online: 'Online', idle: 'Idle', dnd: 'DoNotDisturb', offline: 'Offline', invisible: 'Offline',
      };
      windowManager.setStatusOverlay(statusMap[status] || 'Online');
    }

    return result;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    await discordClient.logout();
  });

  ipcMain.handle(IPC.AUTH_GET_STATE, async () => {
    return {
      loggedIn: discordClient.ready,
      hasToken: !!discordClient.getSavedToken(),
    };
  });

  // ---- User ----
  ipcMain.handle(IPC.USER_GET_CURRENT, async () => {
    return discordClient.getCurrentUser();
  });

  ipcMain.handle(IPC.USER_SET_STATUS, async (_e, status: string) => {
    await discordClient.setStatus(status);
    const user = discordClient.getCurrentUser();
    if (user) {
      const presence = { ...user.presence, status };
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC.EVENT_PRESENCE_UPDATE, { userId: user.id, presence });
        }
      }
    }
  });

  ipcMain.handle(IPC.USER_SET_CUSTOM_STATUS, async (_e, text: string | null) => {
    await discordClient.setCustomStatus(text);
  });

  ipcMain.handle(IPC.USER_GET_PROFILE, async (_e, userId: string) => {
    return discordClient.getUserProfile(userId);
  });

  // ---- Contacts ----
  ipcMain.handle(IPC.CONTACTS_GET_PRIVATE_CHANNELS, async () => {
    return discordClient.getPrivateChannels();
  });

  ipcMain.handle(IPC.CONTACTS_GET_GUILDS, async () => {
    return discordClient.getGuilds();
  });

  ipcMain.handle(IPC.CONTACTS_SEND_FRIEND_REQUEST, async (_e, username: string) => {
    return discordClient.sendFriendRequest(username);
  });

  ipcMain.handle(IPC.CONTACTS_GET_PENDING_REQUESTS, async () => {
    return discordClient.getPendingFriendRequests();
  });

  ipcMain.handle(IPC.CONTACTS_GET_FAVORITES, async () => {
    return settingsManager.settings.favoriteChannelIds || [];
  });

  ipcMain.handle(IPC.CONTACTS_SET_FAVORITES, async (_e, ids: string[]) => {
    settingsManager.update({ favoriteChannelIds: ids } as any);
  });

  // ---- Messages ----
  ipcMain.handle(IPC.MESSAGES_GET, async (_e, channelId: string) => {
    return discordClient.getMessages(channelId);
  });

  ipcMain.handle(IPC.MESSAGES_SEND, async (_e, channelId: string, content: string, attachmentPaths?: string[]) => {
    let resolvedPaths = attachmentPaths;
    if (attachmentPaths?.length) {
      const assetsPath = await getAssetsPath();
      resolvedPaths = attachmentPaths.map((p) =>
        path.isAbsolute(p) ? p : path.join(assetsPath, p.replace(/^\//, ''))
      );
    }
    return discordClient.sendMessage(channelId, content, resolvedPaths);
  });

  ipcMain.handle(IPC.MESSAGES_EDIT, async (_e, channelId: string, messageId: string, content: string) => {
    return discordClient.editMessage(channelId, messageId, content);
  });

  ipcMain.handle(IPC.MESSAGES_DELETE, async (_e, channelId: string, messageId: string) => {
    return discordClient.deleteMessage(channelId, messageId);
  });

  ipcMain.handle(IPC.MESSAGES_TRIGGER_TYPING, async (_e, channelId: string) => {
    await discordClient.triggerTyping(channelId);
  });

  // ---- Channels ----
  ipcMain.handle(IPC.CHANNELS_GET, async (_e, channelId: string) => {
    return discordClient.getChannel(channelId);
  });

  ipcMain.handle(IPC.CHANNELS_GET_GUILD_CHANNELS, async (_e, guildId: string) => {
    return await discordClient.getGuildChannels(guildId);
  });

  ipcMain.handle(IPC.CHANNELS_GET_MEMBERS, async (_e, channelId: string) => {
    return discordClient.getChannelMembers(channelId);
  });

  // ---- Voice ----
  ipcMain.handle(IPC.VOICE_JOIN, async (_e, channelId: string) => {
    return voiceManager.join(channelId);
  });

  ipcMain.handle(IPC.VOICE_LEAVE, async () => {
    await voiceManager.leave();
  });

  ipcMain.handle(IPC.VOICE_SET_SELF_MUTE, async (_e, muted: boolean) => {
    voiceManager.setSelfMute(muted);
  });

  ipcMain.handle(IPC.VOICE_SET_SELF_DEAFEN, async (_e, deafened: boolean) => {
    voiceManager.setSelfDeafen(deafened);
  });

  ipcMain.handle(IPC.VOICE_SET_USER_VOLUME, async (_e, userId: string, volume: number) => {
    voiceManager.setUserVolume(userId, volume);
  });

  ipcMain.handle(IPC.VOICE_GET_STATES, async (_e, guildId: string) => {
    return discordClient.getVoiceStates(guildId);
  });

  ipcMain.on(IPC.VOICE_AUDIO_CHUNK, (_e, b64: string) => {
    voiceManager.receiveAudioChunk(Buffer.from(b64, 'base64'));
  });

  // ---- Settings ----
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return settingsManager.getPublicSettings();
  });

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, partial: Record<string, unknown>) => {
    settingsManager.update(partial as any);
  });

  // ---- Theme ----
  ipcMain.handle(IPC.THEME_GET_SCENES, async () => {
    return themeService.scenes;
  });

  ipcMain.handle(IPC.THEME_SET_SCENE, async (_e, sceneId: number) => {
    themeService.setScene(sceneId);
  });

  ipcMain.handle(IPC.THEME_GET_CURRENT, async () => {
    return themeService.currentScene;
  });

  // ---- Assets ----
  async function getAssetsPath(): Promise<string> {
    const { app } = require('electron');
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.resolve(__dirname, '../../src/assets');
    }
    return path.join(process.resourcesPath, 'assets');
  }

  ipcMain.handle(IPC.ASSETS_GET_PATH, getAssetsPath);

  ipcMain.handle(IPC.ASSETS_LIST_GIFS, async () => {
    const base = await getAssetsPath();
    const gifsDir = path.join(base, 'gifs');
    try {
      if (!fs.existsSync(gifsDir)) return [];
      const names = fs.readdirSync(gifsDir);
      return names.filter((n) => n.toLowerCase().endsWith('.gif')).sort();
    } catch {
      return [];
    }
  });

  // ---- Windows ----
  ipcMain.handle(IPC.WINDOW_OPEN_CHAT, async (_e, channelId: string) => {
    windowManager.openChatWindow(channelId);
  });

  ipcMain.handle(IPC.WINDOW_OPEN_SETTINGS, async () => {
    windowManager.openSettingsWindow();
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.close();
  });
}
