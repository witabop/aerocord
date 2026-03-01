/**
 * Event router — subscribes to events from the Python bridge and broadcasts
 * them to all renderer windows via Electron IPC, preserving the exact same
 * channel names and data shapes as before.
 */

import { BrowserWindow } from 'electron';
import { pythonBridge } from './bridge';
import { IPC } from '../ipc/channels';
import { settingsManager } from '../services/settings';
import { windowManager } from '../windows/manager';
import { themeService } from '../services/theme';
import { voiceManager } from './voice';

const recentlyUnfriendedUserIds = new Set<string>();
/** Sign-on: only one notification per user per online session; cleared when they go offline. */
const signOnNotifiedUserIds = new Set<string>();

/** Call when removeFriend is invoked so we can suppress the bogus Offline presence update. */
export function markRecentlyUnfriended(userId: string): void {
  const id = String(userId ?? '');
  if (!id) return;
  recentlyUnfriendedUserIds.add(id);
  setTimeout(() => recentlyUnfriendedUserIds.delete(id), 15000);
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

export function registerDiscordEvents(): void {
  pythonBridge.on('messageCreate', (vm: any) => {
    vm.notifyEntryOpen = windowManager.hasNotifyEntryOpen(vm.notifyEntryId ?? vm.channelId);
    broadcastToAll(IPC.EVENT_MESSAGE_CREATE, vm);

    const isSelf = vm.author?.id === vm._selfId;
    if (isSelf) return;

    const channelOpenAndFocused = windowManager.isChannelOpenAndFocused(vm.channelId);
    if (channelOpenAndFocused) return;

    const isDM = !!vm.isDirectMessage;
    const isMention = !!vm.mentionsSelf;
    const scene = themeService.currentScene;
    const channelOpen = windowManager.isChannelOpen(vm.channelId);

    if (isDM && settingsManager.settings.notifyDm) {
      if (!channelOpen) {
        windowManager.openNotificationWindow({
          type: 'message',
          message: vm,
          channelId: vm.channelId,
          scene,
        });
      }
      broadcastToAll(IPC.PLAY_SOUND, 'newemail.wav');
    } else if (isMention && settingsManager.settings.notifyMention) {
      if (!channelOpen) {
        windowManager.openNotificationWindow({
          type: 'message',
          message: vm,
          channelId: vm.channelId,
          scene,
        });
      }
      broadcastToAll(IPC.PLAY_SOUND, 'newemail.wav');
    }
  });

  pythonBridge.on('messageDelete', (data: any) => {
    broadcastToAll(IPC.EVENT_MESSAGE_DELETE, data);
  });

  pythonBridge.on('messageUpdate', (vm: any) => {
    broadcastToAll(IPC.EVENT_MESSAGE_UPDATE, vm);
  });

  pythonBridge.on('presenceUpdate', (data: any) => {
    const rawStatus = data.presence?.status ?? data.newStatus ?? '';
    const newStatus = String(rawStatus ?? '').toLowerCase();
    const isOffline = newStatus === 'offline';
    const userId = data.userId != null ? String(data.userId) : '';
    if (isOffline && userId && recentlyUnfriendedUserIds.has(userId)) {
      return;
    }

    if (isOffline && userId) {
      signOnNotifiedUserIds.delete(userId);
    }

    broadcastToAll(IPC.EVENT_PRESENCE_UPDATE, {
      userId: data.userId,
      presence: data.presence,
      name: data.name,
      username: data.username,
      avatar: data.avatar,
    });

    const wasOffline = data.oldStatus === 'offline' || !data.oldStatus;
    const isNowOnline = data.newStatus && data.newStatus !== 'offline';

    if (wasOffline && isNowOnline && data.isFriend && settingsManager.settings.notifyFriendOnline && userId) {
      if (signOnNotifiedUserIds.has(userId)) return;
      signOnNotifiedUserIds.add(userId);
      windowManager.openNotificationWindow({
        type: 'signOn',
        user: {
          id: data.userId,
          name: (data.globalName ?? data.name) || 'Unknown',
          username: data.username || '',
          avatar: (data.globalAvatar ?? data.avatar) || '',
          presence: data.presence,
        },
        presence: data.presence,
        scene: themeService.currentScene,
      });
    }
  });

  pythonBridge.on('typingStart', (data: any) => {
    broadcastToAll(IPC.EVENT_TYPING_START, data);
  });

  pythonBridge.on('voiceStateUpdate', (data: any) => {
    broadcastToAll(IPC.EVENT_VOICE_STATE_UPDATE, data);
  });

  pythonBridge.on('channelCreate', (data: any) => {
    broadcastToAll(IPC.EVENT_CHANNEL_CREATE, data);
  });

  pythonBridge.on('channelDelete', (data: any) => {
    broadcastToAll(IPC.EVENT_CHANNEL_DELETE, data);
  });

  pythonBridge.on('relationshipChange', () => {
    broadcastToAll(IPC.EVENT_RELATIONSHIP_CHANGE);
  });

  // --- DM Call events ---
  // State-machine approach: we DON'T rely on the ringing list (it's always
  // empty in current discord.py-self). Instead, we infer call direction from
  // our own state: if callState is 'idle' when callCreate arrives, someone
  // else started the call (incoming). If it's 'outgoing', we started it.

  pythonBridge.on('callCreate', (data: any) => {
    const { channelId, callerId, peerConnected } = data;
    const state = voiceManager.callState;
    console.log(`[Events] callCreate: ch=${channelId} caller=${callerId} peerConnected=${peerConnected} ourState=${state}`);

    if (state === 'idle') {
      // We didn't start this — it's an incoming call
      voiceManager.setCallState('incoming', channelId);
      broadcastToAll(IPC.CALL_INCOMING, { channelId, callerId });
    } else if (state === 'outgoing' && voiceManager.callChannelId === channelId) {
      // Our outgoing call: only transition to active if the PEER has connected
      if (peerConnected) {
        voiceManager.setCallState('active', channelId);
        broadcastToAll(IPC.CALL_ACTIVE, { channelId });
      }
    }
  });

  pythonBridge.on('callUpdate', (data: any) => {
    const { channelId, peerConnected } = data;
    const state = voiceManager.callState;
    console.log(`[Events] callUpdate: ch=${channelId} peerConnected=${peerConnected} ourState=${state}`);

    if (state === 'idle') {
      // Late-arriving ring — treat as incoming
      voiceManager.setCallState('incoming', channelId);
      broadcastToAll(IPC.CALL_INCOMING, { channelId, callerId: data.callerId });
      return;
    }

    // Outgoing call: peer picked up
    if (state === 'outgoing' && voiceManager.callChannelId === channelId && peerConnected) {
      voiceManager.setCallState('active', channelId);
      broadcastToAll(IPC.CALL_ACTIVE, { channelId });
      return;
    }

    // Incoming call cancelled by caller
    if (state === 'incoming' && voiceManager.callChannelId === channelId) {
      if (data.unavailable) {
        voiceManager.setCallState('idle', null);
        broadcastToAll(IPC.CALL_ENDED, { channelId });
      }
    }
  });

  pythonBridge.on('callDelete', (data: any) => {
    const { channelId } = data;
    const state = voiceManager.callState;
    console.log(`[Events] callDelete: ch=${channelId} ourState=${state}`);

    if (state !== 'idle') {
      const wasActive = state === 'active';
      voiceManager.setCallState('idle', null);
      broadcastToAll(IPC.CALL_ENDED, { channelId });

      if (wasActive && voiceManager.currentChannelId === channelId) {
        voiceManager.leave();
      }
    }
  });

  // Voice events from Python sidecar
  pythonBridge.on('voiceJoined', (data: any) => {
    broadcastToAll('voice:joined', data);
  });

  pythonBridge.on('voiceLeft', () => {
    broadcastToAll('voice:left');
  });

  pythonBridge.on('voiceSpeaking', (data: any) => {
    broadcastToAll('voice:speaking', data);
  });

  pythonBridge.on('voiceAudioData', (data: any) => {
    if (data?.pcm) {
      const buf = Buffer.from(data.pcm, 'base64');
      broadcastToAll('voice:audioData', { userId: data.userId, pcm: buf });
    }
  });

  pythonBridge.on('callOutgoing', (data: any) => {
    if (data?.channelId) {
      voiceManager.setCallState('outgoing', data.channelId);
    }
    broadcastToAll(IPC.CALL_OUTGOING, data);
  });

  pythonBridge.on('callActive', (data: any) => {
    if (data?.channelId) {
      voiceManager.setCallState('active', data.channelId);
    }
    broadcastToAll(IPC.CALL_ACTIVE, data);
  });

  pythonBridge.on('callEnded', (data: any) => {
    if (data?.channelId && voiceManager.callChannelId === data.channelId) {
      voiceManager.setCallState('idle', null);
    }
    broadcastToAll(IPC.CALL_ENDED, data);
  });

  // Voice-level peer connect/disconnect — the most reliable signal for DM calls
  // These come from the voice WebSocket (CLIENTS_CONNECT / CLIENT_DISCONNECT),
  // not the gateway, so they work even when CALL_UPDATE doesn't fire.
  pythonBridge.on('peerJoinedVoice', (data: any) => {
    const callCh = voiceManager.callChannelId;
    const callSt = voiceManager.callState;
    console.log(`[Events] peerJoinedVoice: user=${data.userId} ch=${data.channelId} ourState=${callSt}`);

    if (callSt === 'outgoing' && callCh) {
      console.log('[Events] Peer connected to our outgoing call, transitioning to active');
      voiceManager.setCallState('active', callCh);
      broadcastToAll(IPC.CALL_ACTIVE, { channelId: callCh });
    }
  });

  pythonBridge.on('peerLeftVoice', (data: any) => {
    const callCh = voiceManager.callChannelId;
    const callSt = voiceManager.callState;
    console.log(`[Events] peerLeftVoice: user=${data.userId} ch=${data.channelId} ourState=${callSt}`);

    if (callSt === 'active' && callCh) {
      console.log('[Events] Peer left active call, ending');
      voiceManager.setCallState('idle', null);
      broadcastToAll(IPC.CALL_ENDED, { channelId: callCh });
      voiceManager.leave();
    }
  });

  // Gateway voice state updates — still useful for guild voice channels
  pythonBridge.on('voiceStateUpdate', (data: any) => {
    const callCh = voiceManager.callChannelId;
    const callSt = voiceManager.callState;

    if (data.channelId && callSt === 'outgoing' && callCh && callCh === data.channelId) {
      console.log('[Events] Peer joined call channel via gateway voiceState, transitioning to active');
      voiceManager.setCallState('active', callCh);
      broadcastToAll(IPC.CALL_ACTIVE, { channelId: callCh });
    }

    if (!data.channelId && data.oldChannelId && callSt === 'active' && callCh && callCh === data.oldChannelId) {
      console.log('[Events] Peer left active call via gateway, ending');
      voiceManager.setCallState('idle', null);
      broadcastToAll(IPC.CALL_ENDED, { channelId: data.oldChannelId });
      voiceManager.leave();
    }
  });
}
