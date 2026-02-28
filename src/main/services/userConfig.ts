import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface UserConfigData {
  /** Public settings (no token). Includes favoriteChannelIds. */
  settings: Record<string, unknown>;
  /** Current scene id. */
  sceneId: number;
}

const CONFIG_DIR = 'user-config';

function getUserConfigPath(userId: string): string {
  const dir = path.join(app.getPath('userData'), CONFIG_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${userId}.json`);
}

export function saveUserConfig(userId: string, data: UserConfigData): void {
  try {
    const filePath = getUserConfigPath(userId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[userConfig] Failed to save config for user', userId, e);
  }
}

export function loadUserConfig(userId: string): UserConfigData | null {
  try {
    const filePath = getUserConfigPath(userId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as UserConfigData;
    if (parsed && typeof parsed.settings === 'object' && typeof parsed.sceneId === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
