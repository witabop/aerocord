import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useIPCEvent } from '../shared/hooks/useIPC';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ChannelSidebar } from './components/ChannelSidebar';
import { MemberSidebar } from './components/MemberSidebar';
import { VoiceControls } from './components/VoiceControls';
import { StatusAvatar } from '../shared/components/StatusAvatar';
import { UserProfilePopup } from '../shared/components/UserProfilePopup';
import { assetUrl } from '../shared/hooks/useAssets';
import { playSound } from '../shared/utils/sounds';
import type { MessageVM, ChannelVM, UserVM, SceneVM, VoiceChannelStateVM } from '../shared/types';
import './chat.css';

function getChannelIdFromHash(): string {
  const hash = window.location.hash.replace('#', '');
  return hash || '';
}

function computeTextColors(hex: string): { textColor: string; shadowColor: string } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const isLight = r * 0.299 + g * 0.587 + b * 0.114 > 140;
  return {
    textColor: isLight ? '#1a1a1a' : '#ffffff',
    shadowColor: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
  };
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
  const [nudging, setNudging] = useState(false);
  const [notifiedChannelIds, setNotifiedChannelIds] = useState<Set<string>>(new Set());
  const [voiceStates, setVoiceStates] = useState<VoiceChannelStateVM[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [inVoice, setInVoice] = useState(false);
  const [selfMuted, setSelfMuted] = useState(false);
  const [selfDeafened, setSelfDeafened] = useState(false);
  const [voiceChannelName, setVoiceChannelName] = useState('');
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

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

    if (ch?.guildId) {
      const [guildChannels, states] = await Promise.all([
        window.aerocord.channels.getGuildChannels(ch.guildId),
        window.aerocord.voice.getVoiceStates(ch.guildId),
      ]);
      setSidebarChannels(guildChannels);
      setVoiceStates(states);
    }

    if (ch?.isGroupChat || ch?.guildId) {
      const channelMembers = await window.aerocord.channels.getMembers(id);
      setMembers(channelMembers);
    }
  }, []);

  useEffect(() => {
    if (channelId) loadChannel(channelId);
  }, [channelId, loadChannel]);

  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      initialLoadRef.current = false;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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

  // Speaking indicators
  useIPCEvent('voice:speaking', (data: unknown) => {
    const { userId, speaking } = data as { userId: string; speaking: boolean };
    setSpeakingUsers(prev => {
      const next = new Set(prev);
      if (speaking) next.add(userId);
      else next.delete(userId);
      return next;
    });
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
  });

  useIPCEvent('voice:audioData', (data: unknown) => {
    const { pcm } = data as { userId: string; pcm: string };
    if (selfDeafened) return;
    const binary = atob(pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    playAudioChunk(new Int16Array(bytes.buffer));
  });

  useIPCEvent('event:messageCreate', (data: unknown) => {
    const msg = data as MessageVM;
    if (msg.channelId === channelId) {
      if (msg.rawContent === '[nudge]') {
        setNudging(true);
        setTimeout(() => setNudging(false), 500);
      }
      setMessages(prev => [...prev, msg]);
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
    const { userId, presence } = data as { userId: string; presence: any };
    setChannel(prev => {
      if (!prev) return prev;
      const updatedRecipients = prev.recipients?.map(r =>
        r.id === userId ? { ...r, presence } : r
      );
      return { ...prev, recipients: updatedRecipients };
    });
    setMembers(prev => prev.map(m =>
      m.id === userId ? { ...m, presence } : m
    ));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, presence } : prev);
    }
  });

  // --- Audio I/O ---

  const startMicCapture = useCallback(async () => {
    try {
      const settings = await window.aerocord.settings.get();
      const deviceId = settings.audioInputDeviceId || 'default';

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);
      workletNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        const mono = e.inputBuffer.getChannelData(0);
        const stereo16 = new Int16Array(mono.length * 2);
        for (let i = 0; i < mono.length; i++) {
          const s = Math.max(-32768, Math.min(32767, (mono[i] * 32767) | 0));
          stereo16[i * 2] = s;
          stereo16[i * 2 + 1] = s;
        }
        window.aerocord.voice.sendAudioChunk(stereo16.buffer);
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
  }, []);

  const playAudioChunk = useCallback((pcm16: Int16Array) => {
    if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
      playbackContextRef.current = new AudioContext({ sampleRate: 48000 });
      nextPlayTimeRef.current = 0;
    }
    const ctx = playbackContextRef.current;
    const frameCount = pcm16.length >> 1;
    const buffer = ctx.createBuffer(2, frameCount, 48000);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < frameCount; i++) {
      left[i] = pcm16[i * 2] / 32768;
      right[i] = pcm16[i * 2 + 1] / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  const handleSend = useCallback(async (content: string) => {
    if (!channelId || !content.trim()) return;
    await window.aerocord.messages.send(channelId, content);
    setReplyTarget(null);
  }, [channelId]);

  const handleSendGif = useCallback(
    async (filename: string) => {
      if (!channelId) return;
      await window.aerocord.messages.send(channelId, '', [`gifs/${filename}`]);
      setReplyTarget(null);
    },
    [channelId]
  );

  const handleTyping = useCallback(() => {
    if (channelId) window.aerocord.messages.triggerTyping(channelId);
  }, [channelId]);

  const handleSwitchChannel = useCallback((newChannelId: string) => {
    setChannelId(newChannelId);
    setMessages([]);
    setMembers([]);
    setTypingUsers(new Map());
    setReplyTarget(null);
    initialLoadRef.current = true;
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

  const typingEntries = Array.from(typingUsers.entries());

  const isDmChat = !channel?.guildId && !channel?.isGroupChat && channel?.recipients?.length === 1;
  const dmAccentColor = isDmChat ? channel?.recipientAccentColor : null;

  const effectiveSceneColor = dmAccentColor || scene?.color || '#3bb2ea';

  const { textColor: computedTextColor, shadowColor: computedShadowColor } = computeTextColors(effectiveSceneColor);

  const sceneStyle: React.CSSProperties = {
    '--scene-color': effectiveSceneColor,
    '--scene-text-color': computedTextColor,
    '--scene-shadow-color': computedShadowColor,
  } as React.CSSProperties;

  const sceneBgUrl = scene?.file ? assetUrl('scenes', scene.file) : '';
  const defaultSceneBgUrl = assetUrl('scenes', 'default.png');

  const displayName = channel?.name || 'Loading...';
  const isServerChat = !!channel?.guildId;
  const isGroupOrServer = !!channel?.isGroupChat || isServerChat;
  const recipient = channel?.recipients?.[0];

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
            <button className="chat-toolbar-btn no-drag">Photos</button>
            <button className="chat-toolbar-btn no-drag">Files</button>
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
            <button className="chat-toolbar-btn no-drag">Photos</button>
            <button className="chat-toolbar-btn no-drag">Files</button>
            <button className="chat-toolbar-btn no-drag">Video</button>
            <button className="chat-toolbar-btn no-drag">Call</button>
            <button className="chat-toolbar-btn no-drag">Games</button>
            <button className="chat-toolbar-btn no-drag">Activities</button>
            <button className="chat-toolbar-btn no-drag">Invite</button>
            <button className="chat-toolbar-btn no-drag">Block</button>
          </div>
          <div className="chat-header chat-header-dm">
            <img className="chat-header-scene-bg" src={defaultSceneBgUrl} alt="" draggable={false} />
            {isDmChat && <div className="chat-header-dm-tint" />}
            <div className="chat-header-info no-drag">
              <div className="chat-header-name">{displayName}</div>
              {recipient?.presence?.customStatus && (
                <div className="chat-header-status">{recipient.presence.customStatus}</div>
              )}
              {recipient?.presence && !recipient.presence.customStatus && (
                <div className="chat-header-status">
                  {recipient.presence.presence || recipient.presence.status}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {isDmChat && (
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
      )}

      <div className={`chat-messages-area ${isDmChat ? 'chat-messages-area-dm' : ''}`}>
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

        {isGroupOrServer && members.length > 0 && (
          <MemberSidebar members={members} onUserClick={handleOpenProfile} />
        )}
      </div>
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
