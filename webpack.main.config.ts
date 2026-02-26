import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  externals: {
    'ffmpeg-static': 'commonjs2 ffmpeg-static',
    'opusscript': 'commonjs2 opusscript',
    'sodium': 'commonjs2 sodium',
    'libsodium-wrappers': 'commonjs2 libsodium-wrappers',
    '@discordjs/opus': 'commonjs2 @discordjs/opus',
    'bufferutil': 'commonjs2 bufferutil',
    'utf-8-validate': 'commonjs2 utf-8-validate',
    'erlpack': 'commonjs2 erlpack',
    'zlib-sync': 'commonjs2 zlib-sync',
    'tweetnacl': 'commonjs2 tweetnacl',
    '@stablelib/xchacha20poly1305': 'commonjs2 @stablelib/xchacha20poly1305',
    '@stablelib/chacha20poly1305': 'commonjs2 @stablelib/chacha20poly1305',
    '@stablelib/chacha': 'commonjs2 @stablelib/chacha',
    '@stablelib/aead': 'commonjs2 @stablelib/aead',
    '@stablelib/binary': 'commonjs2 @stablelib/binary',
    '@stablelib/wipe': 'commonjs2 @stablelib/wipe',
    '@stablelib/constant-time': 'commonjs2 @stablelib/constant-time',
    '@stablelib/poly1305': 'commonjs2 @stablelib/poly1305',
    '@stablelib/int': 'commonjs2 @stablelib/int',
    '@stablelib/xchacha20': 'commonjs2 @stablelib/xchacha20',
  },
};
