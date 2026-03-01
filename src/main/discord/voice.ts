/**
 * Voice manager — delegates all voice operations to the Python sidecar
 * via the PythonBridge. Audio data flows as base64-encoded PCM over NDJSON.
 */

import { pythonBridge } from './bridge';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'active';

class VoiceManager {
  private static _instance: VoiceManager;
  private _currentChannelId: string | null = null;
  private _currentGuildId: string | null = null;
  private _selfMuted = false;
  private _selfDeafened = false;
  private _inputVolume = 1.0;
  private _noiseGateDb = -40;
  private _userVolumes: Map<string, number> = new Map();
  private _userMuted: Set<string> = new Set();
  private _callState: CallState = 'idle';
  private _callChannelId: string | null = null;

  static get instance(): VoiceManager {
    if (!VoiceManager._instance) {
      VoiceManager._instance = new VoiceManager();
    }
    return VoiceManager._instance;
  }

  constructor() {
    pythonBridge.on('voiceJoined', (data: any) => {
      this._currentChannelId = data?.channelId ?? null;
      this._currentGuildId = data?.guildId ?? null;
    });

    pythonBridge.on('voiceLeft', () => {
      this._currentChannelId = null;
      this._currentGuildId = null;
      this._selfMuted = false;
      this._selfDeafened = false;
    });
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

  get callState(): CallState {
    return this._callState;
  }

  get callChannelId(): string | null {
    return this._callChannelId;
  }

  async join(channelId: string): Promise<boolean> {
    try {
      return await pythonBridge.request<boolean>('voiceJoin', { channelId });
    } catch (e) {
      console.error('Failed to join voice channel:', e);
      return false;
    }
  }

  async startCall(channelId: string): Promise<boolean> {
    try {
      this._callState = 'outgoing';
      this._callChannelId = channelId;
      const ok = await pythonBridge.request<boolean>('callStart', { channelId });
      if (!ok) {
        this._callState = 'idle';
        this._callChannelId = null;
      }
      return ok;
    } catch (e) {
      console.error('Failed to start call:', e);
      this._callState = 'idle';
      this._callChannelId = null;
      return false;
    }
  }

  async acceptCall(channelId: string): Promise<boolean> {
    try {
      return await pythonBridge.request<boolean>('callAccept', { channelId });
    } catch (e) {
      console.error('Failed to accept call:', e);
      return false;
    }
  }

  async declineCall(channelId: string): Promise<void> {
    try {
      await pythonBridge.request('callDecline', { channelId });
    } catch { /* ignore */ }
    this._callState = 'idle';
    this._callChannelId = null;
  }

  setCallState(state: CallState, channelId: string | null): void {
    this._callState = state;
    this._callChannelId = channelId;
  }

  async leave(): Promise<void> {
    try {
      await pythonBridge.request('voiceLeave');
    } catch { /* ignore */ }
    this._currentChannelId = null;
    this._currentGuildId = null;
    this._selfMuted = false;
    this._selfDeafened = false;
    this._callState = 'idle';
    this._callChannelId = null;
  }

  setSelfMute(muted: boolean): void {
    this._selfMuted = muted;
    pythonBridge.fire('voiceSetSelfMute', { muted });
  }

  setSelfDeafen(deafened: boolean): void {
    this._selfDeafened = deafened;
    pythonBridge.fire('voiceSetSelfDeafen', { deafened });
  }

  setInputVolume(volume: number): void {
    this._inputVolume = Math.max(0, Math.min(2, volume));
    pythonBridge.fire('voiceSetInputVolume', { volume: this._inputVolume });
  }

  getInputVolume(): number {
    return this._inputVolume;
  }

  setNoiseGateDb(db: number): void {
    this._noiseGateDb = Math.max(-60, Math.min(0, db));
    pythonBridge.fire('voiceSetNoiseGateDb', { db: this._noiseGateDb });
  }

  setUserVolume(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(2, volume));
    this._userVolumes.set(userId, clamped);
    pythonBridge.fire('voiceSetUserVolume', { userId, volume: clamped });
  }

  getUserVolume(userId: string): number {
    return this._userVolumes.get(userId) ?? 1.0;
  }

  setUserMuted(userId: string, muted: boolean): void {
    if (muted) this._userMuted.add(userId);
    else this._userMuted.delete(userId);
    pythonBridge.fire('voiceSetUserMuted', { userId, muted });
  }

  getUserMuted(userId: string): boolean {
    return this._userMuted.has(userId);
  }

  receiveAudioChunk(chunk: Buffer): void {
    if (this._selfMuted) return;
    const pcm = chunk.toString('base64');
    pythonBridge.fire('voiceAudioChunk', { pcm });
  }
}

export const voiceManager = VoiceManager.instance;
