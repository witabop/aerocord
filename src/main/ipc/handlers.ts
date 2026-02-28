import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IPC } from './channels';
import { discordClient } from '../discord/client';
import { registerDiscordEvents, markRecentlyUnfriended } from '../discord/events';
import { voiceManager } from '../discord/voice';
import { settingsManager } from '../services/settings';
import { themeService } from '../services/theme';
import { windowManager } from '../windows/manager';

export function registerIPCHandlers(): void {
  // ---- App ----
  ipcMain.handle(IPC.APP_GET_VERSION, async () => app.getVersion());

  // ---- Shell (register early so open-in-browser works in all windows) ----
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    await shell.openExternal(url);
  });

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
    return await discordClient.getCurrentUser();
  });

  ipcMain.handle(IPC.USER_SET_STATUS, async (_e, status: string) => {
    await discordClient.setStatus(status);
    windowManager.setStatusOverlay(status);
    const user = await discordClient.getCurrentUser();
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
    return await discordClient.getPrivateChannels();
  });

  ipcMain.handle(IPC.CONTACTS_GET_GUILDS, async () => {
    return await discordClient.getGuilds();
  });

  ipcMain.handle(IPC.CONTACTS_SEND_FRIEND_REQUEST, async (_e, username: string) => {
    return discordClient.sendFriendRequest(username);
  });

  ipcMain.handle(IPC.CONTACTS_GET_PENDING_REQUESTS, async () => {
    return discordClient.getPendingFriendRequests();
  });

  ipcMain.handle(IPC.CONTACTS_ACCEPT_FRIEND_REQUEST, async (_e, userId: string) => {
    return discordClient.acceptFriendRequest(userId);
  });

  ipcMain.handle(IPC.CONTACTS_IGNORE_FRIEND_REQUEST, async (_e, userId: string) => {
    return discordClient.ignoreFriendRequest(userId);
  });

  ipcMain.handle(IPC.CONTACTS_GET_FRIENDS, async () => {
    return discordClient.getFriends();
  });

  ipcMain.handle(IPC.CONTACTS_REMOVE_FRIEND, async (_e, userId: string) => {
    markRecentlyUnfriended(String(userId ?? ''));
    return discordClient.removeFriend(userId);
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

  ipcMain.handle(IPC.MESSAGES_GET_BEFORE, async (_e, channelId: string, beforeId: string, limit?: number) => {
    return discordClient.getMessagesBefore(channelId, beforeId, limit);
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

  ipcMain.handle(IPC.MESSAGES_ACK, async (_e, channelId: string, messageId: string) => {
    await discordClient.ackMessage(channelId, messageId);
  });

  // ---- Channels ----
  ipcMain.handle(IPC.CHANNELS_GET, async (_e, channelId: string) => {
    return discordClient.getChannel(channelId);
  });

  ipcMain.handle(IPC.CHANNELS_GET_GUILD_CHANNELS, async (_e, guildId: string) => {
    return await discordClient.getGuildChannels(guildId);
  });

  ipcMain.handle(IPC.CHANNELS_GET_MEMBERS, async (_e, channelId: string, limit?: number, offset?: number) => {
    return discordClient.getChannelMembers(channelId, limit, offset);
  });

  ipcMain.handle(IPC.CHANNELS_GET_OR_CREATE_DM, async (_e, userId: string) => {
    return discordClient.getOrCreateDMChannel(userId);
  });

  ipcMain.handle(IPC.CHANNELS_CLOSE_CONVERSATION, async (_e, channelId: string) => {
    const result = await discordClient.closeConversation(channelId);
    if (result.success) {
      windowManager.closeChatWindow(channelId);
    }
    return result;
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

  ipcMain.handle(IPC.VOICE_SET_INPUT_VOLUME, async (_e, volume: number) => {
    voiceManager.setInputVolume(volume);
  });

  ipcMain.handle(IPC.VOICE_GET_INPUT_VOLUME, async () => {
    return voiceManager.getInputVolume();
  });

  ipcMain.handle(IPC.VOICE_SET_USER_VOLUME, async (_e, userId: string, volume: number) => {
    voiceManager.setUserVolume(userId, volume);
  });

  ipcMain.handle(IPC.VOICE_GET_USER_VOLUME, async (_e, userId: string) => {
    return voiceManager.getUserVolume(userId);
  });

  ipcMain.handle(IPC.VOICE_SET_USER_MUTED, async (_e, userId: string, muted: boolean) => {
    voiceManager.setUserMuted(userId, muted);
  });

  ipcMain.handle(IPC.VOICE_GET_USER_MUTED, async (_e, userId: string) => {
    return voiceManager.getUserMuted(userId);
  });

  ipcMain.handle(IPC.VOICE_GET_STATES, async (_e, guildId: string) => {
    return await discordClient.getVoiceStates(guildId);
  });

  ipcMain.on(IPC.VOICE_AUDIO_CHUNK, (_e, data: Buffer | Uint8Array) => {
    voiceManager.receiveAudioChunk(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });

  // ---- DM Calls ----
  ipcMain.handle(IPC.CALL_START, async (_e, channelId: string) => {
    return voiceManager.startCall(channelId);
  });

  ipcMain.handle(IPC.CALL_ACCEPT, async (_e, channelId: string) => {
    return voiceManager.acceptCall(channelId);
  });

  ipcMain.handle(IPC.CALL_DECLINE, async (_e, channelId: string) => {
    await voiceManager.declineCall(channelId);
  });

  ipcMain.handle(IPC.CALL_HANGUP, async () => {
    await voiceManager.leave();
  });

  ipcMain.handle(IPC.CALL_GET_STATE, async () => {
    return { callState: voiceManager.callState, callChannelId: voiceManager.callChannelId };
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

  // ---- Dialog / Files ----
  const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

  ipcMain.handle(
    IPC.DIALOG_PICK_FILES,
    async (e, options: { type: 'images' | 'files'; maxSizeBytes?: number }) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const maxSize = options.maxSizeBytes ?? MAX_FILE_SIZE_BYTES;
      const opts = {
        properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
        filters:
          options.type === 'images'
            ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
            : [],
      };
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled || !result.filePaths.length) {
        return { ok: true as const, filePaths: [] };
      }
      const tooBig: string[] = [];
      for (const filePath of result.filePaths) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.size > maxSize) tooBig.push(filePath);
        } catch {
          tooBig.push(filePath);
        }
      }
      if (tooBig.length > 0) {
        return { ok: false as const, error: 'FILE_TOO_LARGE', filePaths: result.filePaths };
      }
      return { ok: true as const, filePaths: result.filePaths };
    }
  );

  ipcMain.handle(IPC.FILES_WRITE_TEMP, async (_e, base64: string, extension: string) => {
    const buf = Buffer.from(base64, 'base64');
    const name = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension.replace(/^\./, '')}`;
    const filePath = path.join(os.tmpdir(), name);
    fs.writeFileSync(filePath, buf);
    return filePath;
  });

  const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
  ipcMain.handle(IPC.FILES_GET_PREVIEW_DATA_URL, async (_e, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXT.has(ext)) return null;
      const buf = fs.readFileSync(filePath);
      if (buf.length > 5 * 1024 * 1024) return null; // skip huge files
      const base64 = buf.toString('base64');
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/bmp';
      return `data:${mime};base64,${base64}`;
    } catch {
      return null;
    }
  });

  // ---- Windows ----
  ipcMain.handle(IPC.WINDOW_OPEN_CHAT, async (_e, channelId: string) => {
    windowManager.openChatWindow(channelId);
  });

  ipcMain.handle(IPC.WINDOW_OPEN_SETTINGS, async () => {
    windowManager.openSettingsWindow();
  });

  ipcMain.handle(IPC.WINDOW_OPEN_NOTIFICATION, async (_e, data: unknown) => {
    windowManager.openNotificationWindow(data);
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.close();
  });
}
