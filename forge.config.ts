import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      devContentSecurityPolicy: "default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: blob: aerocord-asset:;",
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/login/index.html',
            js: './src/renderer/login/index.tsx',
            name: 'login_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
          {
            html: './src/renderer/home/index.html',
            js: './src/renderer/home/index.tsx',
            name: 'home_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
          {
            html: './src/renderer/chat/index.html',
            js: './src/renderer/chat/index.tsx',
            name: 'chat_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
          {
            html: './src/renderer/settings/index.html',
            js: './src/renderer/settings/index.tsx',
            name: 'settings_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
          {
            html: './src/renderer/notification/index.html',
            js: './src/renderer/notification/index.tsx',
            name: 'notification_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
