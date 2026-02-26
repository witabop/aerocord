import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Settings {
  token: string;
  lastReadMessages: Record<string, string>;
  selectedChannels: Record<string, string>;
  recentDMChats: string[];
  recentServerChats: string[];
  readReceiptReference: string;
  hasUserLoggedInBefore: boolean;
  hasWarnedAboutVoiceChat: boolean;
  viewedNotices: number[];

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
  favoriteChannelIds: string[];
}

const DEFAULTS: Settings = {
  token: '',
  lastReadMessages: {},
  selectedChannels: {},
  recentDMChats: [],
  recentServerChats: [],
  readReceiptReference: '',
  hasUserLoggedInBefore: false,
  hasWarnedAboutVoiceChat: false,
  viewedNotices: [],

  showBetaWarning: true,
  notifyFriendOnline: true,
  notifyDm: true,
  notifyMention: true,
  notifyChat: true,
  automaticallyOpenNotification: false,
  playNotificationSounds: true,
  readMessageNotifications: false,
  readOnlineNotifications: false,
  enableMessageTts: true,
  nudgeIntensity: 10,
  nudgeLength: 2,
  goIdleWithFullscreenProgram: true,
  displayUnimplementedButtons: false,
  highlightMentions: true,
  displayDiscordServerLink: true,
  displayHomeNews: true,
  displayAds: true,
  displayAerochatAttribution: true,
  displayLinkPreviews: true,
  selectedTimeFormat: '24h',
  discordDeveloperMode: false,
  inputDeviceIndex: 0,
  audioInputDeviceId: 'default',
  audioOutputDeviceId: 'default',
  favoriteChannelIds: [],
};

class SettingsManager {
  private static _instance: SettingsManager;
  private _settings: Settings;
  private _filePath: string;

  private constructor() {
    this._filePath = path.join(app.getPath('userData'), 'config.json');
    this._settings = { ...DEFAULTS };
  }

  static get instance(): SettingsManager {
    if (!SettingsManager._instance) {
      SettingsManager._instance = new SettingsManager();
    }
    return SettingsManager._instance;
  }

  get settings(): Settings {
    return this._settings;
  }

  load(): void {
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this._settings = { ...DEFAULTS, ...parsed };
      }
    } catch {
      this._settings = { ...DEFAULTS };
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this._filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._filePath, JSON.stringify(this._settings, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  update(partial: Partial<Settings>): void {
    Object.assign(this._settings, partial);
    this.save();
  }

  getPublicSettings() {
    const { token, ...publicSettings } = this._settings;
    return publicSettings;
  }
}

export const settingsManager = SettingsManager.instance;
