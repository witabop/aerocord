/**
 * Discord client wrapper — thin proxy over the Python bridge sidecar.
 * All Discord operations are delegated to the Python process running discord.py-self.
 * The IPC interface exposed to renderers remains identical.
 */

import { safeStorage } from 'electron';
import { settingsManager } from '../services/settings';
import { themeService } from '../services/theme';
import { saveUserConfig, loadUserConfig } from '../services/userConfig';
import { pythonBridge } from './bridge';
import type {
  UserVM,
  PresenceVM,
  MessageVM,
  ChannelVM,
  HomeListItemVM,
  HomeListCategoryVM,
  VoiceChannelStateVM,
} from '../../renderer/shared/types';

class DiscordClientWrapper {
  private static _instance: DiscordClientWrapper;
  private _ready = false;

  static get instance(): DiscordClientWrapper {
    if (!DiscordClientWrapper._instance) {
      DiscordClientWrapper._instance = new DiscordClientWrapper();
    }
    return DiscordClientWrapper._instance;
  }

  get ready(): boolean {
    return this._ready;
  }

  async login(token: string, save: boolean, status: string): Promise<string> {
    try {
      if (!pythonBridge.ready) {
        await pythonBridge.start();
      }

      const result = await pythonBridge.request<string>('login', { token, status });
      if (result === 'success') {
        this._ready = true;

        if (save) {
          try {
            const encrypted = safeStorage.encryptString(token);
            settingsManager.update({ token: encrypted.toString('base64'), hasUserLoggedInBefore: true });
          } catch {
            settingsManager.update({ token: '', hasUserLoggedInBefore: true });
          }
        }

        const user = await this.getCurrentUser();
        if (user) {
          const loaded = loadUserConfig(user.id);
          if (loaded) {
            settingsManager.update(loaded.settings as Partial<typeof settingsManager.settings>);
            themeService.setScene(loaded.sceneId);
          }
        }
      }
      return result;
    } catch (e) {
      console.error('[Aerocord] Login exception:', e);
      return 'unknown';
    }
  }

  async logout(): Promise<void> {
    this._ready = false;
    const user = await this.getCurrentUser().catch(() => null);
    if (user) {
      saveUserConfig(user.id, {
        settings: settingsManager.getPublicSettings(),
        sceneId: themeService.currentScene?.id ?? 1,
      });
    }
    try {
      await pythonBridge.request('logout');
    } catch { /* ignore */ }
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

  async getCurrentUser(): Promise<UserVM | null> {
    try {
      return await pythonBridge.request<UserVM | null>('getCurrentUser');
    } catch {
      return null;
    }
  }

  async getStatusForOverlay(): Promise<string> {
    try {
      return await pythonBridge.request<string>('getStatusForOverlay');
    } catch {
      return 'Online';
    }
  }

  async setStatus(status: string): Promise<void> {
    await pythonBridge.request('setStatus', { status });
  }

  async setCustomStatus(text: string | null): Promise<void> {
    await pythonBridge.request('setCustomStatus', { text });
  }

  async getPrivateChannels(): Promise<HomeListItemVM[]> {
    try {
      return await pythonBridge.request<HomeListItemVM[]>('getPrivateChannels');
    } catch {
      return [];
    }
  }

  async getGuilds(): Promise<HomeListCategoryVM[]> {
    try {
      return await pythonBridge.request<HomeListCategoryVM[]>('getGuilds');
    } catch {
      return [];
    }
  }

  getNotifyEntryIdForChannel(channelId: string): Promise<string> {
    return pythonBridge.request<string>('getNotifyEntryId', { channelId }).catch(() => channelId);
  }

  async getMessages(channelId: string): Promise<MessageVM[]> {
    try {
      return await pythonBridge.request<MessageVM[]>('getMessages', { channelId });
    } catch {
      return [];
    }
  }

  async sendMessage(channelId: string, content: string, attachmentPaths?: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('sendMessage', {
        channelId,
        content,
        attachmentPaths: attachmentPaths || null,
      });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to send message' };
    }
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<boolean> {
    try {
      return await pythonBridge.request<boolean>('editMessage', { channelId, messageId, content });
    } catch {
      return false;
    }
  }

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    try {
      return await pythonBridge.request<boolean>('deleteMessage', { channelId, messageId });
    } catch {
      return false;
    }
  }

  async triggerTyping(channelId: string): Promise<void> {
    try {
      await pythonBridge.request('triggerTyping', { channelId });
    } catch { /* ignore */ }
  }

  async ackMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await pythonBridge.request('ackMessage', { channelId, messageId });
    } catch { /* ignore */ }
  }

  async getChannel(channelId: string): Promise<ChannelVM | null> {
    try {
      return await pythonBridge.request<ChannelVM | null>('getChannel', { channelId });
    } catch {
      return null;
    }
  }

  async getGuildChannels(guildId: string): Promise<ChannelVM[]> {
    try {
      return await pythonBridge.request<ChannelVM[]>('getGuildChannels', { guildId });
    } catch {
      return [];
    }
  }

  async getVoiceStates(guildId: string): Promise<VoiceChannelStateVM[]> {
    try {
      return await pythonBridge.request<VoiceChannelStateVM[]>('voiceGetStates', { guildId });
    } catch {
      return [];
    }
  }

  async getChannelMembers(channelId: string): Promise<UserVM[]> {
    try {
      return await pythonBridge.request<UserVM[]>('getChannelMembers', { channelId });
    } catch {
      return [];
    }
  }

  async sendFriendRequest(username: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('sendFriendRequest', { username });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to send friend request' };
    }
  }

  async acceptFriendRequest(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('acceptFriendRequest', { userId });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to accept' };
    }
  }

  async ignoreFriendRequest(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('ignoreFriendRequest', { userId });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to ignore' };
    }
  }

  async getOrCreateDMChannel(userId: string): Promise<string> {
    return await pythonBridge.request<string>('getOrCreateDM', { userId });
  }

  async closeConversation(channelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('closeConversation', { channelId });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to close conversation' };
    }
  }

  async getPendingFriendRequests(): Promise<HomeListItemVM[]> {
    try {
      return await pythonBridge.request<HomeListItemVM[]>('getPendingRequests');
    } catch {
      return [];
    }
  }

  async getFriends(): Promise<string[]> {
    try {
      return await pythonBridge.request<string[]>('getFriends');
    } catch {
      return [];
    }
  }

  async removeFriend(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await pythonBridge.request<{ success: boolean; error?: string }>('removeFriend', { userId });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to remove friend' };
    }
  }

  async getUserProfile(userId: string): Promise<any | null> {
    try {
      return await pythonBridge.request<any>('getUserProfile', { userId });
    } catch {
      return null;
    }
  }

  resolveUserPresence(userId: string): Promise<PresenceVM> {
    return pythonBridge.request<PresenceVM>('resolveUserPresence', { userId }).catch(() => ({
      status: 'Offline' as const,
      presence: '',
      type: '',
    }));
  }
}

export const discordClient = DiscordClientWrapper.instance;
