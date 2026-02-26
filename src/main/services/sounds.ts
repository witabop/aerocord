import * as path from 'path';
import { settingsManager } from './settings';

const SOUND_FILES: Record<string, string> = {
  online: 'online.wav',
  type: 'type.wav',
  nudge: 'nudge.wav',
  newemail: 'newemail.wav',
};

class SoundService {
  private static _instance: SoundService;
  private _basePath: string;

  private constructor() {
    this._basePath = path.join(__dirname, '..', 'assets', 'sounds');
  }

  static get instance(): SoundService {
    if (!SoundService._instance) {
      SoundService._instance = new SoundService();
    }
    return SoundService._instance;
  }

  getSoundPath(name: string): string | null {
    const file = SOUND_FILES[name];
    if (!file) return null;
    return path.join(this._basePath, file);
  }

  shouldPlaySounds(): boolean {
    return settingsManager.settings.playNotificationSounds;
  }
}

export const soundService = SoundService.instance;
