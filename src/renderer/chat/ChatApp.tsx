import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useIPCEvent } from '../shared/hooks/useIPC';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ChannelSidebar } from './components/ChannelSidebar';
import { MemberSidebar } from './components/MemberSidebar';
import { VoiceControls } from './components/VoiceControls';
import { StatusAvatar } from '../shared/components/StatusAvatar';
import { UserProfilePopup } from '../shared/components/UserProfilePopup';
import { DmCallOverlay } from './components/DmCallOverlay';
import { assetUrl } from '../shared/hooks/useAssets';
import { playSound, playSoundLoop, stopSoundLoop } from '../shared/utils/sounds';
import { computeTextColors } from '../shared/utils/colors';
import type { MessageVM, ChannelVM, UserVM, SceneVM, VoiceChannelStateVM, DmCallState } from '../shared/types';
import './chat.css';

function getChannelIdFromHash(): string {
  const hash = window.location.hash.replace('#', '');
  return hash || '';
}

export const ChatApp: React.FC = () => {
  const [channelId, setChannelId] = useState(() => getChannelIdFromHash());
  const [channel, setChannel] = useState<ChannelVM | null>(null);
  const [messages, setMessages] = useState<MessageVM[]>([]);
  const [currentUser, setCurrentUser] = useState<UserVM | null>(null);
  const [scene, setScene] = useState<SceneVM | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [replyTarget, setReplyTarget] = useState<MessageVM | null>(null);
  const [sidebarChannels, setSidebarChannels] = useState<ChannelVM[]>([]);
  const [members, setMembers] = useState<UserVM[]>([]);
  const [memberOffset, setMemberOffset] = useState(0);
  const [hasMoreMembers, setHasMoreMembers] = useState(true);
  const [isLoadingInitialMembers, setIsLoadingInitialMembers] = useState(false);
  const [isLoadingMoreMembers, setIsLoadingMoreMembers] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [nudging, setNudging] = useState(false);
  const [notifiedChannelIds, setNotifiedChannelIds] = useState<Set<string>>(new Set());
  const [voiceStates, setVoiceStates] = useState<VoiceChannelStateVM[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [inVoice, setInVoice] = useState(false);
  const [selfMuted, setSelfMuted] = useState(false);
  const [selfDeafened, setSelfDeafened] = useState(false);
  const [voiceChannelName, setVoiceChannelName] = useState('');
  const [dmCallState, setDmCallState] = useState<DmCallState>('idle');
  const [dmCallChannelId, setDmCallChannelId] = useState<string | null>(null);
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [showMemberList, setShowMemberList] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ id: string; path: string; name: string }>>([]);
  const uploadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackRef = useRef<{
    ctx: AudioContext;
    processor: ScriptProcessorNode;
    users: Map<string, { leftQ: Float32Array[]; rightQ: Float32Array[]; offset: number; primed: boolean }>;
  } | null>(null);
  const speakingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const selfSpeakingRef = useRef(false);
  const selfSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackReadyRef = useRef(false);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  /** True only when this window is the one with the active DM call (or in voice in this context). Used so we only call voice.leave() on beforeunload when closing THIS window, not when closing another chat window (e.g. guild) which would incorrectly end a DM call. */
  const isCallOrVoiceWindowRef = useRef(false);

  const MEMBER_PAGE_SIZE = 30;

  const loadChannel = useCallback(async (id: string) => {
    if (!id) return;
    const [ch, msgs, user, currentScene] = await Promise.all([
      window.aerocord.channels.get(id),
      window.aerocord.messages.get(id),
      window.aerocord.user.getCurrent(),
      window.aerocord.theme.getCurrent(),
    ]);

    setChannel(ch);
    setMessages(msgs);
    setCurrentUser(user);
    setScene(currentScene);
    setHasMoreMessages(msgs.length >= 50);

    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      window.aerocord.messages.ack(id, lastMsg.id).catch(() => {});
    }

    if (ch?.guildId) {
      const [guildChannels, states] = await Promise.all([
        window.aerocord.channels.getGuildChannels(ch.guildId),
        window.aerocord.voice.getVoiceStates(ch.guildId),
      ]);
      setSidebarChannels(guildChannels);
      setVoiceStates(states);
    }

    if (ch?.isGroupChat || ch?.guildId) {
      setMemberOffset(0);
      setHasMoreMembers(true);
      setIsLoadingInitialMembers(true);
      window.aerocord.channels.getMembers(id, MEMBER_PAGE_SIZE, 0).then((channelMembers) => {
        setMembers(channelMembers);
        setMemberOffset(channelMembers.length);
        setHasMoreMembers(channelMembers.length >= MEMBER_PAGE_SIZE);
      }).catch(() => {}).finally(() => {
        setIsLoadingInitialMembers(false);
      });
    }
  }, []);

  const loadMoreMembers = useCallback(async () => {
    if (!channelId || isLoadingMoreMembers || !hasMoreMembers) return;
    setIsLoadingMoreMembers(true);
    try {
      const moreMembers = await window.aerocord.channels.getMembers(channelId, MEMBER_PAGE_SIZE, memberOffset);
      if (moreMembers.length > 0) {
        setMembers(prev => [...prev, ...moreMembers]);
        setMemberOffset(prev => prev + moreMembers.length);
      }
      setHasMoreMembers(moreMembers.length >= MEMBER_PAGE_SIZE);
    } catch { /* ignore */ }
    setIsLoadingMoreMembers(false);
  }, [channelId, isLoadingMoreMembers, hasMoreMembers, memberOffset]);

  const loadMoreMessages = useCallback(async () => {
    if (!channelId || isLoadingMoreMessages || !hasMoreMessages || messages.length === 0) return;
    setIsLoadingMoreMessages(true);
    const scrollEl = document.querySelector('.chat-messages');
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const oldestId = messages[0].id;
      const olderMsgs = await window.aerocord.messages.getBefore(channelId, oldestId, 50);
      if (olderMsgs.length > 0) {
        setMessages(prev => [...olderMsgs, ...prev]);
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
          }
        });
      }
      setHasMoreMessages(olderMsgs.length >= 50);
    } catch { /* ignore */ }
    setIsLoadingMoreMessages(false);
  }, [channelId, isLoadingMoreMessages, hasMoreMessages, messages]);

  useEffect(() => {
    if (channelId) loadChannel(channelId);
  }, [channelId, loadChannel]);

  useEffect(() => {
    if (channel?.guildId && channelId) {
      window.aerocord.settings.get().then((s) => {
        const sel = s.selectedChannels ?? {};
        if (sel[channel.guildId!] === channelId) return;
        window.aerocord.settings.update({
          selectedChannels: { ...sel, [channel.guildId!]: channelId },
        });
      }).catch(() => {});
    }
  }, [channel?.guildId, channelId, channel]);

  useEffect(() => {
    window.aerocord.settings.get().then((s) => setShowMemberList(s.showMemberList ?? true));
  }, []);

  useEffect(() => {
    if (!channelId) return;
    window.aerocord.voice.getCallState().then(({ callState: cs, callChannelId: cId }) => {
      if (cId === channelId && (cs === 'incoming' || cs === 'outgoing' || cs === 'active')) {
        setDmCallState(cs as DmCallState);
        setDmCallChannelId(cId);
        if (cs === 'incoming') playSoundLoop('phone.wav');
        if (cs === 'outgoing') playSoundLoop('outgoing.wav');
      }
    }).catch(() => {});
  }, [channelId]);

  useEffect(() => {
    isCallOrVoiceWindowRef.current =
      dmCallState !== 'idle' && dmCallChannelId !== null && dmCallChannelId === channelId;
  }, [dmCallState, dmCallChannelId, channelId]);

  // Disconnect from voice/call only when THIS window closes (not when another chat window closes)
  useEffect(() => {
    const onBeforeUnload = () => {
      if (isCallOrVoiceWindowRef.current) {
        window.aerocord.voice.leave();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Close profile popup when user scrolls any scroll container
  useEffect(() => {
    if (!profilePopup) return;
    const onScroll = () => setProfilePopup(null);
    const scrollables = document.querySelectorAll('.chat-messages, .chat-sidebar, .member-sidebar');
    scrollables.forEach((el) => el.addEventListener('scroll', onScroll));
    return () => scrollables.forEach((el) => el.removeEventListener('scroll', onScroll));
  }, [profilePopup]);

  const initialLoadRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  /** When set, we should scroll to bottom once messages for this channel have been rendered. */
  const pendingScrollChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (channelId) pendingScrollChannelIdRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    const wasAtBottom = (() => {
      const el = document.querySelector('.chat-messages');
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    })();

    const messagesBelongToCurrentChannel =
      messages.length > 0 && messages[0].channelId === channelId;
    const shouldScrollToBottomOnLoad =
      channelId &&
      pendingScrollChannelIdRef.current === channelId &&
      messagesBelongToCurrentChannel;

    if (shouldScrollToBottomOnLoad) {
      pendingScrollChannelIdRef.current = null;
      initialLoadRef.current = false;
      const scrollToBottom = () => {
        const el = document.querySelector('.chat-messages');
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollToBottom);
        });
      });
    } else if (messages.length > prevMessageCountRef.current && wasAtBottom) {
      const scrollToBottom = () => {
        const el = messagesScrollRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (!nearBottom) return;
        el.scrollTop = el.scrollHeight;
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      };
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      const delays = [100, 350, 700];
      const timers = delays.map((ms) => setTimeout(scrollToBottom, ms));
      return () => timers.forEach((t) => clearTimeout(t));
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, channelId]);

  // Voice state updates (join/leave/mute/deafen)
  useIPCEvent('event:voiceStateUpdate', (data: unknown) => {
    const { userId, channelId: vcId, oldChannelId, selfMute, selfDeaf, guildId } = data as any;
    if (guildId !== channel?.guildId) return;

    const isSelf = userId === currentUser?.id;
    if (!isSelf && currentVoiceChannelId) {
      if (vcId === currentVoiceChannelId && oldChannelId !== currentVoiceChannelId) {
        playSound('joincall.wav');
      } else if (oldChannelId === currentVoiceChannelId && vcId !== currentVoiceChannelId) {
        playSound('leavecall.wav');
      }
    }

    setVoiceStates(prev => {
      const next = prev.map(vs => ({
        ...vs,
        members: vs.members.filter(m => m.userId !== userId),
      }));

      if (vcId) {
        const existing = next.find(vs => vs.channelId === vcId);
        const newMember = {
          userId,
          userName: '',
          userAvatar: '',
          userStatus: 'Online' as const,
          selfMute: selfMute ?? false,
          selfDeaf: selfDeaf ?? false,
          speaking: false,
        };

        if (existing) {
          existing.members.push(newMember);
        } else {
          next.push({ channelId: vcId, members: [newMember] });
        }
      }

      return next.filter(vs => vs.members.length > 0);
    });

    if (channel?.guildId) {
      window.aerocord.voice.getVoiceStates(channel.guildId).then(setVoiceStates);
    }
  });

  // Speaking indicators — driven by both WebSocket events and audio-data
  // activity.  A 300ms timeout clears the indicator after audio stops.
  useIPCEvent('voice:speaking', (data: unknown) => {
    const { userId, speaking } = data as { userId: string; speaking: boolean };
    if (speaking) {
      if (!playbackReadyRef.current) return;
      setSpeakingUsers(prev => {
        if (prev.has(userId)) return prev;
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    } else {
      // Clear immediately when Python tells us the user stopped speaking
      const timers = speakingTimersRef.current;
      const t = timers.get(userId);
      if (t) { clearTimeout(t); timers.delete(userId); }
      setSpeakingUsers(prev => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  });

  // Voice joined
  useIPCEvent('voice:joined', (data: unknown) => {
    const { channelId: vcId, channelName } = data as any;
    setCurrentVoiceChannelId(vcId);
    setInVoice(true);
    setVoiceChannelName(channelName || '');
    playSound('joincall.wav');
    startMicCapture();
  });

  // Voice left
  useIPCEvent('voice:left', () => {
    setCurrentVoiceChannelId(null);
    setInVoice(false);
    setSelfMuted(false);
    setSelfDeafened(false);
    setVoiceChannelName('');
    playSound('leavecall.wav');
    stopMicCapture();
    stopAudioPlayback();
    playbackReadyRef.current = false;
    // Clear all speaking state
    for (const t of speakingTimersRef.current.values()) clearTimeout(t);
    speakingTimersRef.current.clear();
    setSpeakingUsers(new Set());
  });

  useIPCEvent('voice:audioData', (data: unknown) => {
    const { userId, pcm } = data as { userId: string; pcm: Uint8Array | Buffer | string };
    if (selfDeafened) return;
    let bytes: Uint8Array;
    if (typeof pcm === 'string') {
      const binary = atob(pcm);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new Uint8Array(pcm);
    }
    if (bytes.length < 2) return;
    playAudioChunk(userId, new Int16Array(bytes.buffer));

    if (!playbackReadyRef.current) return;

    // Mark speaker active and (re)start a 300ms timeout to clear it.
    setSpeakingUsers(prev => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    const timers = speakingTimersRef.current;
    const prev = timers.get(userId);
    if (prev) clearTimeout(prev);
    timers.set(userId, setTimeout(() => {
      timers.delete(userId);
      setSpeakingUsers(p => {
        if (!p.has(userId)) return p;
        const n = new Set(p);
        n.delete(userId);
        return n;
      });
    }, 300));
  });

  // DM Call events
  useIPCEvent('call:outgoing', (data: unknown) => {
    const { channelId: callChId } = data as { channelId: string };
    if (callChId !== channelId) return;
    setDmCallState('outgoing');
    setDmCallChannelId(callChId);
    playSoundLoop('outgoing.wav');
    const sysMsg: MessageVM = {
      id: `call-out-${Date.now()}`, channelId, content: 'You have started a call.',
      rawContent: '', timestamp: new Date().toISOString(), special: true,
      author: currentUser ?? { id: '', name: '', username: '', avatar: '' },
      isReply: false, isTTS: false, attachments: [], embeds: [], type: 'CALL',
      mentions: [], mentionsSelf: false,
    };
    setMessages(prev => [...prev, sysMsg]);
  });

  useIPCEvent('call:incoming', (data: unknown) => {
    const { channelId: callChId } = data as { channelId: string; callerId: string };
    if (callChId !== channelId) return;
    setDmCallState('incoming');
    setDmCallChannelId(callChId);
    playSoundLoop('phone.wav');
    const callerName = channel?.recipients?.[0]?.name || 'Someone';
    const sysMsg: MessageVM = {
      id: `call-in-${Date.now()}`, channelId, content: `${callerName} has started a call.`,
      rawContent: '', timestamp: new Date().toISOString(), special: true,
      author: channel?.recipients?.[0] ?? { id: '', name: '', username: '', avatar: '' },
      isReply: false, isTTS: false, attachments: [], embeds: [], type: 'CALL',
      mentions: [], mentionsSelf: false,
    };
    setMessages(prev => [...prev, sysMsg]);
  });

  useIPCEvent('call:active', (data: unknown) => {
    const { channelId: callChId } = data as { channelId: string };
    if (callChId !== channelId) return;
    const wasOutgoing = dmCallState === 'outgoing';
    stopSoundLoop('outgoing.wav');
    stopSoundLoop('phone.wav');
    setDmCallState('active');
    const recipientName = channel?.recipients?.[0]?.name || 'They';
    const content = wasOutgoing
      ? `${recipientName} has accepted your call.`
      : `You have accepted ${recipientName}'s call.`;
    const sysMsg: MessageVM = {
      id: `call-active-${Date.now()}`, channelId, content,
      rawContent: '', timestamp: new Date().toISOString(), special: true,
      author: currentUser ?? { id: '', name: '', username: '', avatar: '' },
      isReply: false, isTTS: false, attachments: [], embeds: [], type: 'CALL',
      mentions: [], mentionsSelf: false,
    };
    setMessages(prev => [...prev, sysMsg]);
  });

  useIPCEvent('call:ended', (data: unknown) => {
    const { channelId: callChId } = data as { channelId: string };
    if (callChId !== channelId) return;
    const wasState = dmCallState;
    stopSoundLoop('outgoing.wav');
    stopSoundLoop('phone.wav');
    setDmCallState('idle');
    setDmCallChannelId(null);
    if (wasState === 'active') {
      stopMicCapture();
      stopAudioPlayback();
    }
    const recipientName = channel?.recipients?.[0]?.name || 'They';
    let content = 'Call has ended.';
    if (wasState === 'incoming') {
      content = `You have declined ${recipientName}'s call.`;
    } else if (wasState === 'outgoing') {
      content = `${recipientName} has declined your call.`;
    }
    const sysMsg: MessageVM = {
      id: `call-end-${Date.now()}`, channelId, content,
      rawContent: '', timestamp: new Date().toISOString(), special: true,
      author: currentUser ?? { id: '', name: '', username: '', avatar: '' },
      isReply: false, isTTS: false, attachments: [], embeds: [], type: 'CALL',
      mentions: [], mentionsSelf: false,
    };
    setMessages(prev => [...prev, sysMsg]);
    playSound('leavecall.wav');
  });

  useIPCEvent('event:messageCreate', (data: unknown) => {
    const msg = data as MessageVM;
    if (msg.channelId === channelId) {
      if (msg.rawContent === '[nudge]') {
        setNudging(true);
        setTimeout(() => setNudging(false), 500);
      }
      setMessages(prev => [...prev, msg]);
      window.aerocord.messages.ack(channelId, msg.id).catch(() => {});
    } else if (msg.mentionsSelf && channel?.guildId) {
      setNotifiedChannelIds(prev => {
        const next = new Set(prev);
        next.add(msg.channelId);
        return next;
      });
    }
  });

  useIPCEvent('event:messageDelete', (data: unknown) => {
    const { id, channelId: deletedChannelId } = data as { id: string; channelId: string };
    if (deletedChannelId !== channelId) return;
    setMessages(prev => prev.filter(m => m.id !== id));
  });

  useIPCEvent('event:messageUpdate', (data: unknown) => {
    const msg = data as MessageVM;
    if (msg.channelId !== channelId) return;
    setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
  });

  useIPCEvent('event:typingStart', (data: unknown) => {
    const { channelId: typingChannelId, userId, userName } = data as { channelId: string; userId: string; userName: string };
    if (typingChannelId !== channelId) return;
    if (userId === currentUser?.id) return;

    setTypingUsers(prev => {
      const next = new Map(prev);
      next.set(userId, userName);
      return next;
    });

    const existing = typingTimersRef.current.get(userId);
    if (existing) clearTimeout(existing);
    typingTimersRef.current.set(userId, setTimeout(() => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      typingTimersRef.current.delete(userId);
    }, 8000));
  });

  useIPCEvent('event:presenceUpdate', (data: unknown) => {
    const { userId, presence, name, avatar } = data as { userId: string; presence: any; name?: string; avatar?: string };
    setChannel(prev => {
      if (!prev) return prev;
      const updatedRecipients = prev.recipients?.map(r => {
        if (r.id !== userId) return r;
        const updates: Partial<typeof r> = { presence };
        if (name) updates.name = name;
        if (avatar) updates.avatar = avatar;
        return { ...r, ...updates };
      });
      return { ...prev, recipients: updatedRecipients };
    });
    setMembers(prev => prev.map(m => {
      if (m.id !== userId) return m;
      const updates: Partial<typeof m> = { presence };
      if (name) updates.name = name;
      if (avatar) updates.avatar = avatar;
      return { ...m, ...updates };
    }));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, presence } : prev);
    }
  });

  // --- Audio I/O ---

  const startMicCapture = useCallback(async () => {
    // Guard: tear down any existing capture to prevent duplicate streams
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }

    try {
      const settings = await window.aerocord.settings.get();
      const deviceId = settings.audioInputDeviceId || 'default';

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { ideal: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      // Use native hardware rate — do NOT force 48kHz so we get the true rate
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const nativeRate = ctx.sampleRate;
      const resampleRatio = 48000 / nativeRate;
      console.log('[Audio] Native sample rate:', nativeRate, 'resample ratio:', resampleRatio.toFixed(4));

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);
      workletNodeRef.current = processor;

      let callCount = 0;
      let firstCallTime = 0;

      processor.onaudioprocess = (e) => {
        const now = performance.now();
        if (callCount === 0) firstCallTime = now;
        callCount++;
        if (callCount === 50) {
          const elapsed = now - firstCallTime;
          const effectiveRate = Math.round((1024 * 49) / (elapsed / 1000));
          console.log('[Audio] Measured effective sample rate:', effectiveRate, 'Hz (expected', nativeRate, ')');
          callCount = 0;
        }

        const mono = e.inputBuffer.getChannelData(0);

        // Always resample to exactly 48kHz
        const outLen = Math.round(mono.length * resampleRatio);
        const resampled = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const srcIdx = i / resampleRatio;
          const idx = Math.floor(srcIdx);
          const frac = srcIdx - idx;
          const a = mono[idx] ?? 0;
          const b = mono[Math.min(idx + 1, mono.length - 1)] ?? 0;
          resampled[i] = a + (b - a) * frac;
        }

        const stereo16 = new Int16Array(resampled.length * 2);
        let sumSq = 0;
        for (let i = 0; i < resampled.length; i++) {
          const s = Math.max(-32768, Math.min(32767, (resampled[i] * 32767) | 0));
          stereo16[i * 2] = s;
          stereo16[i * 2 + 1] = s;
          sumSq += resampled[i] * resampled[i];
        }
        window.aerocord.voice.sendAudioChunk(stereo16.buffer);

        // Voice-activity detection for the self speaking indicator.
        // RMS threshold tuned for noise-suppressed mic input.
        const rms = Math.sqrt(sumSq / resampled.length);
        const uid = currentUserRef.current?.id;
        if (uid && rms > 0.008 && playbackReadyRef.current) {
          if (!selfSpeakingRef.current) {
            selfSpeakingRef.current = true;
            setSpeakingUsers(prev => {
              if (prev.has(uid)) return prev;
              const n = new Set(prev);
              n.add(uid);
              return n;
            });
          }
          if (selfSpeakingTimerRef.current) clearTimeout(selfSpeakingTimerRef.current);
          selfSpeakingTimerRef.current = setTimeout(() => {
            selfSpeakingRef.current = false;
            setSpeakingUsers(p => {
              if (!p.has(uid)) return p;
              const n = new Set(p);
              n.delete(uid);
              return n;
            });
          }, 300);
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (e) {
      console.error('Failed to start mic capture:', e);
    }
  }, []);

  const stopMicCapture = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (selfSpeakingTimerRef.current) {
      clearTimeout(selfSpeakingTimerRef.current);
      selfSpeakingTimerRef.current = null;
    }
    selfSpeakingRef.current = false;
  }, []);

  const ensurePlayback = useCallback(() => {
    if (playbackRef.current && playbackRef.current.ctx.state !== 'closed') {
      return playbackRef.current;
    }
    const ctx = new AudioContext({ sampleRate: 48000 });
    const users = new Map<string, { leftQ: Float32Array[]; rightQ: Float32Array[]; offset: number; primed: boolean }>();

    const PRIME_SAMPLES = 4800; // 100ms at 48kHz — absorbs IPC jitter

    // Fade-in gain to suppress the initial audio burst when joining a busy channel.
    // Without this, buffered audio from all speaking users hits simultaneously.
    const gainNode = ctx.createGain();
    const RAMP_SECONDS = 1.6;
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + RAMP_SECONDS);
    gainNode.connect(ctx.destination);

    playbackReadyRef.current = false;
    setTimeout(() => { playbackReadyRef.current = true; }, RAMP_SECONDS * 1000);

    const processor = ctx.createScriptProcessor(2048, 0, 2);
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      outL.fill(0);
      outR.fill(0);

      for (const [, u] of users) {
        if (!u.primed) {
          let total = -u.offset;
          for (const c of u.leftQ) total += c.length;
          if (total < PRIME_SAMPLES) continue;
          u.primed = true;
        }

        let outIdx = 0;
        while (outIdx < outL.length && u.leftQ.length > 0) {
          const chunkL = u.leftQ[0];
          const chunkR = u.rightQ[0];
          const avail = chunkL.length - u.offset;
          const n = Math.min(avail, outL.length - outIdx);

          for (let i = 0; i < n; i++) {
            outL[outIdx + i] += chunkL[u.offset + i];
            outR[outIdx + i] += chunkR[u.offset + i];
          }

          outIdx += n;
          u.offset += n;
          if (u.offset >= chunkL.length) {
            u.leftQ.shift();
            u.rightQ.shift();
            u.offset = 0;
          }
        }

        if (u.leftQ.length === 0) {
          u.primed = false;
        }
      }
    };
    processor.connect(gainNode);

    const state = { ctx, processor, users };
    playbackRef.current = state;
    return state;
  }, []);

  const playAudioChunk = useCallback((userId: string, pcm16: Int16Array) => {
    const pb = ensurePlayback();
    let u = pb.users.get(userId);
    if (!u) {
      u = { leftQ: [], rightQ: [], offset: 0, primed: false };
      pb.users.set(userId, u);
    }

    const frames = pcm16.length >> 1;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = pcm16[i * 2] / 32768;
      right[i] = pcm16[i * 2 + 1] / 32768;
    }
    u.leftQ.push(left);
    u.rightQ.push(right);

    while (u.leftQ.length > 50) {
      u.leftQ.shift();
      u.rightQ.shift();
      u.offset = 0;
    }
  }, [ensurePlayback]);

  const stopAudioPlayback = useCallback(() => {
    const pb = playbackRef.current;
    if (pb) {
      pb.processor.disconnect();
      pb.ctx.close().catch(() => {});
      playbackRef.current = null;
    }
  }, []);

  const handleSend = useCallback(
    async (content: string, attachmentPaths?: string[]) => {
      if (!channelId) return;
      setSendError(null);
      if (sendErrorTimerRef.current) {
        clearTimeout(sendErrorTimerRef.current);
        sendErrorTimerRef.current = null;
      }
      const hasText = content.trim().length > 0;
      const hasAttachments = attachmentPaths && attachmentPaths.length > 0;
      if (!hasText && !hasAttachments) return;
      const sendContent = hasText ? content.trim() : '\u200B';
      const result = await window.aerocord.messages.send(channelId, sendContent, attachmentPaths);
      if (result.success) {
        if (hasAttachments) setPendingAttachments([]);
        setReplyTarget(null);
      } else {
        setSendError(result.error || 'Failed to send message');
        sendErrorTimerRef.current = setTimeout(() => {
          setSendError(null);
          sendErrorTimerRef.current = null;
        }, 8000);
      }
    },
    [channelId]
  );

  const handleSendGif = useCallback(
    async (filename: string) => {
      if (!channelId) return;
      setSendError(null);
      const result = await window.aerocord.messages.send(channelId, '', [`gifs/${filename}`]);
      if (result.success) {
        setReplyTarget(null);
      } else {
        setSendError(result.error || 'Failed to send');
        sendErrorTimerRef.current = setTimeout(() => setSendError(null), 8000);
      }
    },
    [channelId]
  );

  const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

  const handleAddAttachments = useCallback((filePaths: string[]) => {
    if (!filePaths.length) return;
    setPendingAttachments((prev) => [
      ...prev,
      ...filePaths.map((p) => ({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        path: p,
        name: p.replace(/^.*[/\\]/, '') || 'file',
      })),
    ]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleClearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  const handlePickPhotos = useCallback(async () => {
    if (!channelId || !channel?.canTalk) return;
    const result = await window.aerocord.dialog.pickFiles({
      type: 'images',
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    });
    if (!result.ok) {
      setUploadError('Files must be 8MB or smaller.');
      if (uploadErrorTimerRef.current) clearTimeout(uploadErrorTimerRef.current);
      uploadErrorTimerRef.current = setTimeout(() => {
        setUploadError(null);
        uploadErrorTimerRef.current = null;
      }, 5000);
      return;
    }
    if (result.filePaths.length) handleAddAttachments(result.filePaths);
  }, [channelId, channel?.canTalk, handleAddAttachments]);

  const handlePickFiles = useCallback(async () => {
    if (!channelId || !channel?.canTalk) return;
    const result = await window.aerocord.dialog.pickFiles({
      type: 'files',
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    });
    if (!result.ok) {
      setUploadError('Files must be 8MB or smaller.');
      if (uploadErrorTimerRef.current) clearTimeout(uploadErrorTimerRef.current);
      uploadErrorTimerRef.current = setTimeout(() => {
        setUploadError(null);
        uploadErrorTimerRef.current = null;
      }, 5000);
      return;
    }
    if (result.filePaths.length) handleAddAttachments(result.filePaths);
  }, [channelId, channel?.canTalk, handleAddAttachments]);

  const handleTyping = useCallback(() => {
    if (channelId) window.aerocord.messages.triggerTyping(channelId);
  }, [channelId]);

  const handleSwitchChannel = useCallback((newChannelId: string) => {
    setChannelId(newChannelId);
    setMessages([]);
    setMembers([]);
    setMemberOffset(0);
    setHasMoreMembers(true);
    setHasMoreMessages(true);
    setIsLoadingInitialMembers(false);
    setPendingAttachments([]);
    setTypingUsers(new Map());
    setReplyTarget(null);
    initialLoadRef.current = true;
    prevMessageCountRef.current = 0;
    setNotifiedChannelIds(prev => {
      const next = new Set(prev);
      next.delete(newChannelId);
      return next;
    });
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (channelId) await window.aerocord.messages.delete(channelId, messageId);
  }, [channelId]);

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    if (channelId) await window.aerocord.messages.edit(channelId, messageId, content);
  }, [channelId]);

  const handleOpenProfile = useCallback((userId: string, x: number, y: number) => {
    setProfilePopup({ userId, x, y });
  }, []);

  const handleReply = useCallback((msg: MessageVM) => {
    setReplyTarget(msg);
  }, []);

  const handleJoinVoice = useCallback(async (vcId: string) => {
    if (currentVoiceChannelId === vcId) return;
    await window.aerocord.voice.join(vcId);
  }, [currentVoiceChannelId]);

  const handleLeaveVoice = useCallback(async () => {
    await window.aerocord.voice.leave();
  }, []);

  const handleToggleMute = useCallback(async () => {
    const newVal = !selfMuted;
    setSelfMuted(newVal);
    await window.aerocord.voice.setSelfMute(newVal);
    if (newVal && micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => { t.enabled = false; });
    } else if (!newVal && micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => { t.enabled = true; });
    }
  }, [selfMuted]);

  const handleToggleDeafen = useCallback(async () => {
    const newVal = !selfDeafened;
    setSelfDeafened(newVal);
    await window.aerocord.voice.setSelfDeafen(newVal);
  }, [selfDeafened]);

  const handleStartCall = useCallback(async () => {
    if (!channelId || dmCallState !== 'idle') return;
    await window.aerocord.voice.startCall(channelId);
  }, [channelId, dmCallState]);

  const handleAcceptCall = useCallback(async () => {
    if (!dmCallChannelId) return;
    stopSoundLoop('phone.wav');
    await window.aerocord.voice.acceptCall(dmCallChannelId);
  }, [dmCallChannelId]);

  const handleDeclineCall = useCallback(async () => {
    if (!dmCallChannelId) return;
    stopSoundLoop('phone.wav');
    await window.aerocord.voice.declineCall(dmCallChannelId);
  }, [dmCallChannelId]);

  const handleHangupCall = useCallback(async () => {
    stopSoundLoop('outgoing.wav');
    stopSoundLoop('phone.wav');
    await window.aerocord.voice.leave();
  }, []);

  const typingEntries = useMemo(() => Array.from(typingUsers.entries()), [typingUsers]);

  const isDmChat = !channel?.guildId && !channel?.isGroupChat && channel?.recipients?.length === 1;
  const isServerChat = !!channel?.guildId;
  const isGroupOrServer = !!channel?.isGroupChat || isServerChat;
  const recipient = channel?.recipients?.[0];

  const sceneStyle = useMemo((): React.CSSProperties => {
    const dmAccentColor = isDmChat ? channel?.recipientAccentColor : null;
    const effectiveColor = dmAccentColor || scene?.color || '#3bb2ea';
    const { textColor, shadowColor } = computeTextColors(effectiveColor);
    return {
      '--scene-color': effectiveColor,
      '--scene-text-color': textColor,
      '--scene-shadow-color': shadowColor,
    } as React.CSSProperties;
  }, [isDmChat, channel?.recipientAccentColor, scene?.color]);

  const sceneBgUrl = useMemo(
    () => scene?.file ? assetUrl('scenes', scene.file) : '',
    [scene?.file],
  );
  const defaultSceneBgUrl = useMemo(() => assetUrl('scenes', 'default.png'), []);

  const displayName = channel?.name || 'Loading...';

  useEffect(() => {
    if (!channel) return;
    if (isServerChat) {
      document.title = `#${channel.name} <${channel.guildName || 'Server'}>`;
    } else if (channel.isGroupChat) {
      document.title = channel.name || 'Group Chat';
    } else if (isDmChat && recipient) {
      document.title = `${recipient.name} <${recipient.username}@discord.com>`;
    }
  }, [channel, isServerChat, isDmChat, recipient]);

  return (
    <div className={`wlm-window chat-window ${nudging ? 'nudge-active' : ''}`} style={sceneStyle}>
      {isGroupOrServer ? (
        <>
          <div className="chat-toolbar chat-toolbar-scene">
            <button type="button" className="chat-toolbar-btn no-drag" onClick={handlePickPhotos} title="Upload photos">Photos</button>
            <button type="button" className="chat-toolbar-btn no-drag" onClick={handlePickFiles} title="Upload files">Files</button>
            <button className="chat-toolbar-btn no-drag">Video</button>
            <button className="chat-toolbar-btn no-drag">Call</button>
          {isDmChat && <div className="dm-banner-gradient" />}
            <button className="chat-toolbar-btn no-drag">Games</button>
            <button className="chat-toolbar-btn no-drag">Activities</button>
            <button className="chat-toolbar-btn no-drag">Invite</button>
            <button className="chat-toolbar-btn no-drag">Block</button>
          </div>
          <div className="chat-header chat-header-group">
            {sceneBgUrl && (
              <img className="chat-header-scene-bg" src={sceneBgUrl} alt="" draggable={false} />
            )}
            <img
              className="chat-header-group-icon"
              src={assetUrl('images', 'chat', 'GroupIcon.png')}
              alt=""
              draggable={false}
            />
            <div className="chat-header-info no-drag">
              <div className="chat-header-name">{isServerChat ? (channel?.guildName || displayName) : displayName}</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="chat-toolbar chat-toolbar-dm">
            <button type="button" className="chat-toolbar-btn no-drag" onClick={handlePickPhotos} title="Upload photos">Photos</button>
            <button type="button" className="chat-toolbar-btn no-drag" onClick={handlePickFiles} title="Upload files">Files</button>
            <button className="chat-toolbar-btn no-drag">Video</button>
            <button className="chat-toolbar-btn no-drag" onClick={handleStartCall}>Call</button>
            <button className="chat-toolbar-btn no-drag">Games</button>
            <button className="chat-toolbar-btn no-drag">Activities</button>
            <button className="chat-toolbar-btn no-drag">Invite</button>
            <button className="chat-toolbar-btn no-drag">Block</button>
          </div>
          <div className="chat-header chat-header-dm">
            <img className="chat-header-scene-bg" src={defaultSceneBgUrl} alt="" draggable={false} />
            {isDmChat && <div className="chat-header-dm-tint" />}
            <div className="chat-header-info no-drag">
              {dmCallState === 'idle' && (
                <>
                  <div className="chat-header-name">{displayName}</div>
                  {recipient?.presence?.customStatus && (
                    <div className="chat-header-status">{recipient.presence.customStatus}</div>
                  )}
                  {recipient?.presence && !recipient.presence.customStatus && (
                    <div className="chat-header-status">
                      {recipient.presence.presence || recipient.presence.status}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {isDmChat && dmCallState !== 'idle' ? (
        <DmCallOverlay
          callState={dmCallState}
          recipient={recipient}
          currentUser={currentUser}
          speakingUsers={speakingUsers}
          selfMuted={selfMuted}
          selfDeafened={selfDeafened}
          onHangup={handleHangupCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
        />
      ) : isDmChat ? (
        <>
          <div className="dm-portrait-recipient">
            {recipient && (
              <StatusAvatar
                src={recipient.avatar}
                status={recipient.presence?.status || 'Offline'}
                size="xl"
              />
            )}
          </div>
          <div className="dm-portrait-client">
            {currentUser && (
              <StatusAvatar
                src={currentUser.avatar}
                status={currentUser.presence?.status || 'Online'}
                size="xl"
              />
            )}
          </div>
        </>
      ) : null}

      <div className={`chat-messages-area ${isDmChat ? `chat-messages-area-dm${dmCallState !== 'idle' ? ' in-call' : ''}` : ''}`}>
        {isServerChat && sidebarChannels.length > 0 && (
          <div className="chat-sidebar-wrapper">
            <ChannelSidebar
              channels={sidebarChannels}
              activeChannelId={channelId}
              guildName={channel?.guildName || ''}
              onSelectChannel={handleSwitchChannel}
              voiceStates={voiceStates}
              speakingUsers={speakingUsers}
              currentVoiceChannelId={currentVoiceChannelId}
              onJoinVoice={handleJoinVoice}
              onUserClick={handleOpenProfile}
              notifiedChannelIds={notifiedChannelIds}
              inVoice={inVoice}
              currentUserId={currentUser?.id}
              selfMuted={selfMuted}
              selfDeafened={selfDeafened}
              onToggleMute={handleToggleMute}
              onToggleDeafen={handleToggleDeafen}
            />
            {inVoice && (
              <VoiceControls
                channelName={voiceChannelName}
                selfMuted={selfMuted}
                selfDeafened={selfDeafened}
                onToggleMute={handleToggleMute}
                onToggleDeafen={handleToggleDeafen}
                onLeave={handleLeaveVoice}
              />
            )}
          </div>
        )}

        <div className="chat-messages-container">
          <MessageList
            messages={messages}
            currentUserId={currentUser?.id}
            onDelete={handleDeleteMessage}
            onReply={handleReply}
            onEdit={handleEditMessage}
            onUserClick={handleOpenProfile}
            messagesEndRef={messagesEndRef}
            scrollContainerRef={messagesScrollRef}
            onLoadMoreMessages={loadMoreMessages}
            isLoadingMore={isLoadingMoreMessages}
            hasMoreMessages={hasMoreMessages}
          />

          <div className="chat-typing">
            {typingEntries.map(([userId, userName]) => (
              <span key={userId} className="chat-typing-user">
                <img
                  src={assetUrl('images', 'message', 'typing.gif')}
                  alt=""
                  className="chat-typing-gif"
                  draggable={false}
                />
                <span className="chat-typing-name">{userName}</span>
              </span>
            ))}
          </div>

          <MessageInput
            onSend={handleSend}
            onSendGif={handleSendGif}
            pendingAttachments={pendingAttachments}
            onAddAttachments={handleAddAttachments}
            onRemoveAttachment={handleRemoveAttachment}
            onClearAttachments={handleClearAttachments}
            onUploadError={setUploadError}
            maxFileSizeBytes={MAX_FILE_SIZE_BYTES}
            onTyping={handleTyping}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            disabled={channel ? !channel.canTalk : true}
            members={members}
          />

          {messages.length > 0 && (
            <div className="chat-last-message-info">
              Last message received at {new Date(messages[messages.length - 1].timestamp).toLocaleTimeString()} on {new Date(messages[messages.length - 1].timestamp).toLocaleDateString()}.
            </div>
          )}
        </div>

        {isGroupOrServer && (members.length > 0 || isLoadingInitialMembers) && showMemberList && (
          <MemberSidebar
            members={members}
            onUserClick={handleOpenProfile}
            onLoadMore={loadMoreMembers}
            isLoadingMore={isLoadingMoreMembers}
            isLoadingInitial={isLoadingInitialMembers}
            hasMore={hasMoreMembers}
          />
        )}
      </div>

      {uploadError && (
        <div className="chat-upload-error" role="alert">
          <img className="chat-upload-error-icon" src={assetUrl('images', 'message', 'Error.png')} alt="" draggable={false} />
          <span className="chat-upload-error-text">{uploadError}</span>
        </div>
      )}

      {sendError && (
        <div className="chat-upload-error" role="alert">
          <img className="chat-upload-error-icon" src={assetUrl('images', 'message', 'Error.png')} alt="" draggable={false} />
          <span className="chat-upload-error-text">{sendError}</span>
        </div>
      )}

      {profilePopup && (
        <UserProfilePopup
          userId={profilePopup.userId}
          position={{ x: profilePopup.x, y: profilePopup.y }}
          onClose={() => setProfilePopup(null)}
        />
      )}
    </div>
  );
};
