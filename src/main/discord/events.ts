import { BrowserWindow } from 'electron';
import { discordClient } from './client';
import { IPC } from '../ipc/channels';
import { settingsManager } from '../services/settings';
import { windowManager } from '../windows/manager';
import { themeService } from '../services/theme';

function broadcastToAll(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

export function registerDiscordEvents(): void {
  const client = discordClient.client;
  if (!client) return;

  client.on('messageCreate', (msg) => {
    const vm = discordClient.messageToVM(msg);
    broadcastToAll(IPC.EVENT_MESSAGE_CREATE, vm);

    const isSelf = msg.author.id === client.user?.id;
    if (isSelf) return;

    const isDM = msg.channel.type === 'DM' || (msg.channel as any).type === 'GROUP_DM';
    const isMention = msg.mentions.users.has(client.user!.id) || msg.mentions.everyone;

    const scene = themeService.currentScene;

    if (isDM && settingsManager.settings.notifyDm) {
      windowManager.openNotificationWindow({
        type: 'message',
        message: vm,
        channelId: msg.channel.id,
        scene,
      });
      broadcastToAll(IPC.PLAY_SOUND, 'newemail.wav');
    } else if (isMention && settingsManager.settings.notifyMention) {
      windowManager.openNotificationWindow({
        type: 'message',
        message: vm,
        channelId: msg.channel.id,
        scene,
      });
      broadcastToAll(IPC.PLAY_SOUND, 'newemail.wav');
    }
  });

  client.on('messageDelete', (msg) => {
    broadcastToAll(IPC.EVENT_MESSAGE_DELETE, {
      id: msg.id,
      channelId: msg.channelId,
    });
  });

  client.on('messageUpdate', (_old, newMsg) => {
    if (newMsg.partial) return;
    broadcastToAll(IPC.EVENT_MESSAGE_UPDATE, discordClient.messageToVM(newMsg as any));
  });

  client.on('presenceUpdate', (oldPresence, newPresence) => {
    if (!newPresence?.user) return;
    broadcastToAll(IPC.EVENT_PRESENCE_UPDATE, {
      userId: newPresence.userId,
      presence: discordClient.presenceToVM(newPresence),
    });

    if (newPresence.userId === client.user?.id) {
      const statusMap: Record<string, string> = {
        online: 'Online', idle: 'Idle', dnd: 'DoNotDisturb', offline: 'Offline', invisible: 'Offline',
      };
      windowManager.setStatusOverlay(statusMap[newPresence.status] || 'Online');
    }

    const wasOffline = !oldPresence || oldPresence.status === 'offline';
    const isNowOnline = newPresence.status !== 'offline';

    if (wasOffline && isNowOnline && settingsManager.settings.notifyFriendOnline) {
      const user = discordClient.userToVM(newPresence.user);
      windowManager.openNotificationWindow({
        type: 'signOn',
        user,
        presence: discordClient.presenceToVM(newPresence),
        scene: themeService.currentScene,
      });
    }
  });

  client.on('typingStart', (typing) => {
    broadcastToAll(IPC.EVENT_TYPING_START, {
      channelId: typing.channel.id,
      userId: typing.user?.id,
      userName: (typing.user as any)?.displayName ?? typing.user?.username,
    });
  });

  client.on('debug', (msg: string) => {
    if (msg.includes('[VOICE]') || msg.includes('VOICE')) {
      console.log('[Voice Debug]', msg);
    }
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    broadcastToAll(IPC.EVENT_VOICE_STATE_UPDATE, {
      userId: newState.id,
      channelId: newState.channelId,
      oldChannelId: oldState?.channelId,
      selfMute: newState.selfMute,
      selfDeaf: newState.selfDeaf,
      guildId: newState.guild?.id,
    });
  });

  client.on('channelCreate', (channel) => {
    broadcastToAll(IPC.EVENT_CHANNEL_CREATE, { id: channel.id, type: channel.type });
  });

  client.on('channelDelete', (channel) => {
    broadcastToAll(IPC.EVENT_CHANNEL_DELETE, { id: channel.id, type: channel.type });
  });
}
