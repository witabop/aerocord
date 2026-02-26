import { BrowserWindow, screen, nativeImage, Tray, app } from 'electron';
import * as path from 'path';

const APP_ICON = nativeImage.createFromPath(
  path.resolve(__dirname, '../../src/assets/images/icons/MainWnd.ico'),
);

function trayIconPath(status: string): string {
  const file = status === 'Online' ? 'Active.ico'
    : status === 'Idle' ? 'Idle.ico'
    : status === 'DoNotDisturb' ? 'Dnd.ico'
    : 'Offline.ico';
  return path.resolve(__dirname, '../../src/assets/images/tray', file);
}

declare const LOGIN_WINDOW_WEBPACK_ENTRY: string;
declare const LOGIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const HOME_WINDOW_WEBPACK_ENTRY: string;
declare const HOME_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const CHAT_WINDOW_WEBPACK_ENTRY: string;
declare const CHAT_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const SETTINGS_WINDOW_WEBPACK_ENTRY: string;
declare const SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const NOTIFICATION_WINDOW_WEBPACK_ENTRY: string;
declare const NOTIFICATION_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

class WindowManager {
  private static _instance: WindowManager;
  private _loginWindow: BrowserWindow | null = null;
  private _homeWindow: BrowserWindow | null = null;
  private _chatWindows: Map<string, BrowserWindow> = new Map();
  private _settingsWindow: BrowserWindow | null = null;
  private _tray: Tray | null = null;

  static get instance(): WindowManager {
    if (!WindowManager._instance) {
      WindowManager._instance = new WindowManager();
    }
    return WindowManager._instance;
  }

  createLoginWindow(): BrowserWindow {
    if (this._loginWindow && !this._loginWindow.isDestroyed()) {
      this._loginWindow.focus();
      return this._loginWindow;
    }

    this._loginWindow = new BrowserWindow({
      width: 460,
      height: 500,
      resizable: false,
      autoHideMenuBar: true,
      icon: APP_ICON,
      title: 'Windows Live Messenger',
      webPreferences: {
        preload: LOGIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._loginWindow.loadURL(LOGIN_WINDOW_WEBPACK_ENTRY);
    this._loginWindow.on('closed', () => { this._loginWindow = null; });
    return this._loginWindow;
  }

  createHomeWindow(): BrowserWindow {
    if (this._homeWindow && !this._homeWindow.isDestroyed()) {
      this._homeWindow.focus();
      return this._homeWindow;
    }

    this._homeWindow = new BrowserWindow({
      width: 330,
      height: 650,
      minWidth: 280,
      minHeight: 400,
      autoHideMenuBar: true,
      icon: APP_ICON,
      title: 'Windows Live Messenger',
      webPreferences: {
        preload: HOME_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._homeWindow.loadURL(HOME_WINDOW_WEBPACK_ENTRY);
    this._homeWindow.on('closed', () => {
      this._homeWindow = null;
      for (const [, win] of this._chatWindows) {
        if (!win.isDestroyed()) win.close();
      }
      this._chatWindows.clear();
    });

    return this._homeWindow;
  }

  openChatWindow(channelId: string): BrowserWindow {
    const existing = this._chatWindows.get(channelId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    const chatWindow = new BrowserWindow({
      width: 600,
      height: 500,
      minWidth: 400,
      minHeight: 350,
      autoHideMenuBar: true,
      icon: APP_ICON,
      title: 'Windows Live Messenger',
      webPreferences: {
        preload: CHAT_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const url = new URL(CHAT_WINDOW_WEBPACK_ENTRY);
    url.hash = channelId;
    chatWindow.loadURL(url.toString());
    this._chatWindows.set(channelId, chatWindow);

    chatWindow.on('closed', () => {
      this._chatWindows.delete(channelId);
    });

    return chatWindow;
  }

  openSettingsWindow(): BrowserWindow {
    if (this._settingsWindow && !this._settingsWindow.isDestroyed()) {
      this._settingsWindow.focus();
      return this._settingsWindow;
    }

    this._settingsWindow = new BrowserWindow({
      width: 500,
      height: 450,
      autoHideMenuBar: true,
      icon: APP_ICON,
      title: 'Windows Live Messenger - Options',
      webPreferences: {
        preload: SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._settingsWindow.loadURL(SETTINGS_WINDOW_WEBPACK_ENTRY);
    this._settingsWindow.on('closed', () => { this._settingsWindow = null; });
    return this._settingsWindow;
  }

  openNotificationWindow(data: unknown): BrowserWindow {
    const notifWindow = new BrowserWindow({
      width: 270,
      height: 110,
      resizable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: NOTIFICATION_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const url = new URL(NOTIFICATION_WINDOW_WEBPACK_ENTRY);
    url.hash = encodeURIComponent(JSON.stringify(data));
    notifWindow.loadURL(url.toString());

    const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const x = 10;
    const y = screenHeight - 120;
    notifWindow.setPosition(x, y);

    setTimeout(() => {
      if (!notifWindow.isDestroyed()) notifWindow.close();
    }, 8000);

    return notifWindow;
  }

  closeLoginWindow(): void {
    if (this._loginWindow && !this._loginWindow.isDestroyed()) {
      this._loginWindow.close();
      this._loginWindow = null;
    }
  }

  get homeWindow(): BrowserWindow | null {
    return this._homeWindow;
  }

  get loginWindow(): BrowserWindow | null {
    return this._loginWindow;
  }

  setStatusOverlay(status: string): void {
    const overlayIcon = nativeImage.createFromPath(trayIconPath(status));
    if (this._homeWindow && !this._homeWindow.isDestroyed()) {
      this._homeWindow.setOverlayIcon(overlayIcon, status);
    }
    for (const [, win] of this._chatWindows) {
      if (!win.isDestroyed()) {
        win.setOverlayIcon(overlayIcon, status);
      }
    }

    if (!this._tray) {
      this._tray = new Tray(overlayIcon);
      this._tray.setToolTip('Windows Live Messenger');
    } else {
      this._tray.setImage(overlayIcon);
    }
  }
}

export const windowManager = WindowManager.instance;
