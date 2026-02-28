/**
 * PythonBridge — spawns the Python sidecar process and manages NDJSON
 * communication over stdin/stdout. Provides request/response RPC and
 * event subscriptions.
 */

import { spawn, ChildProcess } from 'child_process';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import * as readline from 'readline';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SpawnConfig = {
  command: string;
  args: string[];
  cwd?: string;
};

class PythonBridge extends EventEmitter {
  private static _instance: PythonBridge;
  private _process: ChildProcess | null = null;
  private _pending = new Map<string, PendingRequest>();
  private _requestId = 0;
  private _ready = false;
  private _restarting = false;
  private _lineReader: readline.Interface | null = null;

  static get instance(): PythonBridge {
    if (!PythonBridge._instance) {
      PythonBridge._instance = new PythonBridge();
    }
    return PythonBridge._instance;
  }

  get ready(): boolean {
    return this._ready;
  }

  /**
   * Start the Python sidecar process.
   * Returns a promise that resolves when the bridge reports ready.
   */
  async start(): Promise<void> {
    if (this._process) return;

    const config = this._resolvePythonCommand();
    console.log('[Bridge] Starting Python sidecar:', config.command, config.args.join(' '), config.cwd ? `(cwd: ${config.cwd})` : '');

    this._process = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: config.cwd,
    });

    this._process.on('error', (err) => {
      console.error('[Bridge] Process error:', err.message);
    });

    this._process.on('exit', (code, signal) => {
      console.log(`[Bridge] Process exited: code=${code} signal=${signal}`);
      this._cleanup();
      if (!this._restarting) {
        this.emit('processExit', code, signal);
      }
    });

    if (this._process.stderr) {
      const stderrReader = readline.createInterface({ input: this._process.stderr });
      stderrReader.on('line', (line) => {
        console.log('[Python]', line);
      });
    }

    if (this._process.stdout) {
      this._lineReader = readline.createInterface({ input: this._process.stdout });
      this._lineReader.on('line', (line) => {
        this._handleLine(line);
      });
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python bridge startup timed out'));
      }, 15000);

      const onReady = () => {
        clearTimeout(timeout);
        this._ready = true;
        resolve();
      };

      this.once('bridgeReady', onReady);

      this._process!.on('exit', () => {
        clearTimeout(timeout);
        this.removeListener('bridgeReady', onReady);
        if (!this._ready) {
          reject(new Error('Python bridge process exited before ready'));
        }
      });
    });
  }

  /**
   * Stop the Python sidecar process gracefully.
   */
  async stop(): Promise<void> {
    this._ready = false;
    if (this._process) {
      try {
        this._process.stdin?.end();
      } catch { /* ignore */ }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try { this._process?.kill('SIGKILL'); } catch { /* ignore */ }
          resolve();
        }, 5000);

        this._process!.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this._cleanup();
  }

  /**
   * Send an RPC request to the Python sidecar.
   * Returns a promise that resolves with the result.
   */
  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this._process?.stdin?.writable) {
      throw new Error('Python bridge not running');
    }

    const id = String(++this._requestId);
    const msg = JSON.stringify({ type: 'request', id, method, params }) + '\n';

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 60000);

      this._pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      try {
        this._process!.stdin!.write(msg);
      } catch (err) {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Send a fire-and-forget message (no response expected).
   */
  fire(method: string, params: Record<string, unknown> = {}): void {
    if (!this._process?.stdin?.writable) return;
    const msg = JSON.stringify({ type: 'fire', method, params }) + '\n';
    try {
      this._process.stdin.write(msg);
    } catch { /* ignore */ }
  }

  private _handleLine(line: string): void {
    if (!line.trim()) return;

    // Fast-path audio: detect by a short prefix check before full JSON parse.
    // Audio events dominate throughput (~50/s per speaking user) so avoiding
    // EventEmitter dispatch shaves measurable latency.
    if (line.startsWith('{"type":"event","name":"voiceAudioData"')) {
      try {
        const msg = JSON.parse(line);
        const d = msg.data;
        if (d?.pcm) {
          const buf = Buffer.from(d.pcm, 'base64');
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send('voice:audioData', { userId: d.userId, pcm: buf });
            }
          }
        }
      } catch { /* drop malformed audio event */ }
      return;
    }

    let msg: { type: string; id?: string; name?: string; result?: unknown; error?: string; data?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      console.warn('[Bridge] Invalid JSON from Python:', line.slice(0, 200));
      return;
    }

    if (msg.type === 'response' && msg.id) {
      const pending = this._pending.get(msg.id);
      if (pending) {
        this._pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.type === 'event' && msg.name) {
      this.emit(msg.name, msg.data);
    }
  }

  private _cleanup(): void {
    if (this._lineReader) {
      this._lineReader.close();
      this._lineReader = null;
    }
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Python bridge disconnected'));
    }
    this._pending.clear();
    this._process = null;
    this._ready = false;
  }

  private _resolvePythonCommand(): SpawnConfig {
    const isDev = !app.isPackaged;

    if (isDev) {
      const pythonDir = path.resolve(__dirname, '../../python');

      if (fs.existsSync(path.join(pythonDir, 'aerocord_bridge', '__main__.py'))) {
        const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
        return { command: pythonExe, args: ['-m', 'aerocord_bridge'], cwd: pythonDir };
      }
    }

    const resourcesPath = process.resourcesPath;
    const exeName = process.platform === 'win32' ? 'aerocord_bridge.exe' : 'aerocord_bridge';

    const searchPaths = [
      path.join(resourcesPath, 'aerocord_bridge', exeName),
      path.join(resourcesPath, exeName),
      path.join(path.dirname(app.getPath('exe')), 'aerocord_bridge', exeName),
    ];

    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        return { command: p, args: [], cwd: path.dirname(p) };
      }
    }

    if (isDev) {
      const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
      const pythonDir = path.resolve(__dirname, '../../python');
      return { command: pythonExe, args: ['-m', 'aerocord_bridge'], cwd: pythonDir };
    }

    throw new Error(`Cannot find Python sidecar binary. Searched: ${searchPaths.join(', ')}`);
  }
}

export const pythonBridge = PythonBridge.instance;
