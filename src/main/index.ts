import { app, BrowserWindow, protocol, net, session } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { settingsManager } from './services/settings';
import { discordClient } from './discord/client';
import { registerDiscordEvents } from './discord/events';
import { registerIPCHandlers } from './ipc/handlers';
import { windowManager } from './windows/manager';
import { IPC } from './ipc/channels';

if (require('electron-squirrel-startup')) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'aerocord-asset', privileges: { standard: false, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
]);

app.on('ready', async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://cdn.discordapp.com/*', '*://media.discordapp.net/*'] },
    (details, callback) => {
      if (details.url.includes('.gif')) {
        delete details.requestHeaders['Accept'];
        details.requestHeaders['Accept'] = 'image/gif, */*';
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: blob: aerocord-asset:;"
        ],
      },
    });
  });

  const assetsBase = path.resolve(__dirname, '../../src/assets');
  protocol.handle('aerocord-asset', (request) => {
    const parsed = new URL(request.url);
    const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(assetsBase, relativePath);
    if (!filePath.startsWith(assetsBase)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(url.pathToFileURL(filePath).href);
  });
  settingsManager.load();
  registerIPCHandlers();

  const savedToken = discordClient.getSavedToken();

  if (savedToken) {
    const loginWindow = windowManager.createLoginWindow();
    loginWindow.webContents.once('did-finish-load', () => {
      loginWindow.webContents.send(IPC.EVENT_LOGIN_STATUS, 'connecting');
    });

    const result = await discordClient.login(savedToken, false, 'Online');

    if (result === 'success') {
      registerDiscordEvents();
      windowManager.closeLoginWindow();
      const homeWindow = windowManager.createHomeWindow();
      homeWindow.webContents.once('did-finish-load', () => {
        homeWindow.webContents.send(IPC.EVENT_READY);
      });
    } else {
      const lw = windowManager.loginWindow;
      if (lw && !lw.isDestroyed()) {
        lw.webContents.send(IPC.EVENT_LOGIN_STATUS, result);
      }
    }
  } else {
    windowManager.createLoginWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createLoginWindow();
  }
});
