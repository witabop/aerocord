import { BrowserWindow } from 'electron';
import { PassThrough } from 'stream';
import { discordClient } from './client';

function broadcastToAll(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

class VoiceManager {
  private static _instance: VoiceManager;
  private _currentChannelId: string | null = null;
  private _currentGuildId: string | null = null;
  private _connection: any = null;
  private _selfMuted = false;
  private _selfDeafened = false;
  private _userVolumes: Map<string, number> = new Map();
  private _speakingUsers: Set<string> = new Set();
  private _micStream: PassThrough | null = null;
  private _dispatcher: any = null;
  private _receiveStreams: Map<string, any> = new Map();
  private _clientSpeakingTimer: ReturnType<typeof setTimeout> | null = null;

  static get instance(): VoiceManager {
    if (!VoiceManager._instance) {
      VoiceManager._instance = new VoiceManager();
    }
    return VoiceManager._instance;
  }

  get currentChannelId(): string | null {
    return this._currentChannelId;
  }

  get currentGuildId(): string | null {
    return this._currentGuildId;
  }

  get selfMuted(): boolean {
    return this._selfMuted;
  }

  get selfDeafened(): boolean {
    return this._selfDeafened;
  }

  async join(channelId: string): Promise<boolean> {
    const client = discordClient.client;
    if (!client) return false;

    if (this._currentChannelId) {
      await this.leave();
    }

    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel) {
        console.error('Voice channel not found in cache:', channelId);
        return false;
      }

      const type = (channel as any).type;
      if (type !== 'GUILD_VOICE' && type !== 'GUILD_STAGE_VOICE') {
        console.error('Channel is not a voice channel:', type);
        return false;
      }

      const guildId = (channel as any).guild?.id ?? null;
      const channelName = (channel as any).name;

      const connection = await client.voice.joinChannel(channel as any, {
        selfMute: false,
        selfDeaf: false,
        selfVideo: false,
      });

      if (!connection) return false;

      this._connection = connection;
      this._currentChannelId = channelId;
      this._currentGuildId = guildId;

      this._setupSpeakingListener();
      this._setupAudioInput();
      this._setupAudioReceiver();

      broadcastToAll('voice:joined', {
        channelId,
        guildId,
        channelName,
      });

      return true;
    } catch (e) {
      console.error('Failed to join voice channel:', e);
      return false;
    }
  }

  async leave(): Promise<void> {
    this._cleanupAudio();
    if (this._clientSpeakingTimer) {
      clearTimeout(this._clientSpeakingTimer);
      this._clientSpeakingTimer = null;
    }

    if (this._connection) {
      try {
        this._connection.disconnect();
      } catch { /* ignore */ }
    }

    const wasInChannel = !!this._currentChannelId;
    this._connection = null;
    this._currentChannelId = null;
    this._currentGuildId = null;
    this._selfMuted = false;
    this._selfDeafened = false;
    this._speakingUsers.clear();

    if (wasInChannel) {
      broadcastToAll('voice:left');
    }
  }

  setSelfMute(muted: boolean): void {
    this._selfMuted = muted;
    if (muted && this._micStream) {
      this._micStream.pause();
    } else if (!muted && this._micStream) {
      this._micStream.resume();
    }
  }

  setSelfDeafen(deafened: boolean): void {
    this._selfDeafened = deafened;
  }

  setUserVolume(userId: string, volume: number): void {
    this._userVolumes.set(userId, Math.max(0, Math.min(2, volume)));
  }

  getUserVolume(userId: string): number {
    return this._userVolumes.get(userId) ?? 1.0;
  }

  receiveAudioChunk(chunk: Buffer): void {
    if (this._selfMuted || !this._micStream) return;
    try {
      this._micStream.write(chunk);
      if (this._hasVoiceActivity(chunk)) {
        this._setClientSpeaking(true);
      }
    } catch { /* ignore */ }
  }

  private _hasVoiceActivity(chunk: Buffer): boolean {
    const sampleCount = chunk.length >> 1;
    if (sampleCount === 0) return false;
    let sumSq = 0;
    for (let i = 0; i < chunk.length; i += 4) {
      const sample = chunk.readInt16LE(i);
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / (sampleCount >> 1));
    return rms > 800;
  }

  private _setClientSpeaking(active: boolean): void {
    const clientId = discordClient.client?.user?.id;
    if (!clientId) return;

    if (active) {
      if (!this._speakingUsers.has(clientId)) {
        this._speakingUsers.add(clientId);
        broadcastToAll('voice:speaking', { userId: clientId, speaking: true });
      }
      if (this._clientSpeakingTimer) clearTimeout(this._clientSpeakingTimer);
      this._clientSpeakingTimer = setTimeout(() => {
        this._speakingUsers.delete(clientId);
        broadcastToAll('voice:speaking', { userId: clientId, speaking: false });
        this._clientSpeakingTimer = null;
      }, 300);
    }
  }

  private _setupSpeakingListener(): void {
    if (!this._connection) return;

    this._connection.on('speaking', (user: any, speaking: any) => {
      if (!user) return;
      const isSpeaking = speaking?.bitfield > 0;
      const userId = user.id;

      if (isSpeaking) {
        this._speakingUsers.add(userId);
      } else {
        this._speakingUsers.delete(userId);
      }

      broadcastToAll('voice:speaking', { userId, speaking: isSpeaking });
    });
  }

  private _setupAudioInput(): void {
    if (!this._connection) return;

    this._micStream = new PassThrough();

    try {
      // playAudio with type 'converted' expects 16-bit signed stereo PCM at 48kHz
      this._dispatcher = this._connection.playAudio(this._micStream, {
        type: 'converted',
        bitrate: 'auto',
      });

      this._dispatcher.on('error', (err: Error) => {
        console.error('Audio dispatcher error:', err);
      });
    } catch (e) {
      console.error('Failed to start audio input:', e);
    }
  }

  private _setupAudioReceiver(): void {
    if (!this._connection?.receiver) return;

    this._connection.on('speaking', (user: any, speaking: any) => {
      if (!user || this._selfDeafened) return;
      const userId = user.id;

      if (speaking?.bitfield > 0 && !this._receiveStreams.has(userId)) {
        try {
          const stream = this._connection.receiver.createStream(user, {
            mode: 'pcm',
            end: 'silence',
          });

          this._receiveStreams.set(userId, stream);

          stream.on('data', (chunk: Buffer) => {
            if (this._selfDeafened) return;
            const volume = this.getUserVolume(userId);
            const data = volume !== 1.0 ? this._applyVolume(chunk, volume) : chunk;
            broadcastToAll('voice:audioData', {
              userId,
              pcm: data.toString('base64'),
            });
          });

          stream.on('end', () => {
            this._receiveStreams.delete(userId);
          });

          stream.on('error', () => {
            this._receiveStreams.delete(userId);
          });
        } catch (e) {
          console.error('Failed to create receive stream for', userId, e);
        }
      }
    });
  }

  private _applyVolume(buffer: Buffer, volume: number): Buffer {
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i += 2) {
      let sample = buffer.readInt16LE(i);
      sample = Math.max(-32768, Math.min(32767, Math.round(sample * volume)));
      result.writeInt16LE(sample, i);
    }
    return result;
  }

  private _cleanupAudio(): void {
    if (this._dispatcher) {
      try { this._dispatcher.destroy(); } catch { /* ignore */ }
      this._dispatcher = null;
    }
    if (this._micStream) {
      try { this._micStream.destroy(); } catch { /* ignore */ }
      this._micStream = null;
    }
    for (const [, stream] of this._receiveStreams) {
      try { stream.destroy(); } catch { /* ignore */ }
    }
    this._receiveStreams.clear();
  }
}

export const voiceManager = VoiceManager.instance;
