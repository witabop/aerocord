import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { ChannelVM, VoiceChannelStateVM, VoiceStateVM } from '../../shared/types';

const VOLUME_OPTIONS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const VOLUME_LABELS = ['0%', '25%', '50%', '75%', '100%', '125%', '150%', '175%', '200%'];

interface ChannelSidebarProps {
  channels: ChannelVM[];
  activeChannelId: string;
  guildName: string;
  onSelectChannel: (channelId: string) => void;
  voiceStates: VoiceChannelStateVM[];
  speakingUsers: Set<string>;
  currentVoiceChannelId: string | null;
  onJoinVoice: (channelId: string) => void;
  onUserClick?: (userId: string, x: number, y: number) => void;
  notifiedChannelIds?: Set<string>;
  /** When in a VC, show voice context menu on member right-click */
  inVoice?: boolean;
  currentUserId?: string;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

function xsFrameForStatus(status: string): string {
  switch (status) {
    case 'Online': return assetUrl('images', 'frames', 'Frames', 'XSFrameActive.png');
    case 'Idle': return assetUrl('images', 'frames', 'Frames', 'XSFrameIdle.png');
    case 'DoNotDisturb': return assetUrl('images', 'frames', 'Frames', 'XSFrameDnd.png');
    default: return assetUrl('images', 'frames', 'Frames', 'XSFrameOffline.png');
  }
}

interface CategoryGroup {
  id: string | null;
  name: string;
  position: number;
  children: ChannelVM[];
}

interface VoiceCtxMenu {
  x: number;
  y: number;
  member: VoiceStateVM;
  channelId: string;
}

interface VoiceCtxMenuState {
  inputVolume: number;
  userVolume: number;
  userMuted: boolean;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  channels,
  activeChannelId,
  guildName,
  onSelectChannel,
  voiceStates,
  speakingUsers,
  currentVoiceChannelId,
  onJoinVoice,
  onUserClick,
  notifiedChannelIds,
  inVoice = false,
  currentUserId,
  selfMuted = false,
  selfDeafened = false,
  onToggleMute,
  onToggleDeafen,
}) => {
  const [voiceCtxMenu, setVoiceCtxMenu] = useState<VoiceCtxMenu | null>(null);
  const [voiceCtxMenuState, setVoiceCtxMenuState] = useState<VoiceCtxMenuState | null>(null);
  const [voiceCtxSubmenu, setVoiceCtxSubmenu] = useState<'client-volume' | 'user-volume' | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!voiceCtxMenu) return;
    const close = () => setVoiceCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [voiceCtxMenu]);

  useEffect(() => {
    if (!voiceCtxMenu || !sidebarRef.current) return;
    const el = sidebarRef.current;
    const onScroll = () => setVoiceCtxMenu(null);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [voiceCtxMenu]);

  useEffect(() => {
    if (!voiceCtxMenu) {
      setVoiceCtxMenuState(null);
      setVoiceCtxSubmenu(null);
      return;
    }
    Promise.all([
      window.aerocord.voice.getInputVolume(),
      window.aerocord.voice.getUserVolume(voiceCtxMenu.member.userId),
      window.aerocord.voice.getUserMuted(voiceCtxMenu.member.userId),
    ]).then(([inputVolume, userVolume, userMuted]) => {
      setVoiceCtxMenuState({ inputVolume, userVolume, userMuted });
    });
  }, [voiceCtxMenu]);

  const handleVoiceMemberContextMenu = useCallback(
    (e: React.MouseEvent, member: VoiceStateVM, channelId: string) => {
      if (!inVoice || channelId !== currentVoiceChannelId) return;
      e.preventDefault();
      e.stopPropagation();
      setVoiceCtxMenu({ x: e.clientX, y: e.clientY, member, channelId });
    },
    [inVoice, currentVoiceChannelId],
  );

  const voiceStateMap = useMemo(
    () => new Map(voiceStates.map(vs => [vs.channelId, vs.members])),
    [voiceStates],
  );

  const categoryGroups = useMemo(() => {
    const categories = channels.filter(c => c.channelType === 'category');
    const nonCategories = channels.filter(c => c.channelType !== 'category');

    const catMap = new Map<string, CategoryGroup>();
    for (const cat of categories) {
      catMap.set(cat.id, { id: cat.id, name: cat.name, position: cat.position ?? 0, children: [] });
    }

    const uncategorized: ChannelVM[] = [];
    for (const ch of nonCategories) {
      if (ch.parentId && catMap.has(ch.parentId)) {
        catMap.get(ch.parentId)!.children.push(ch);
      } else {
        uncategorized.push(ch);
      }
    }

    for (const group of catMap.values()) {
      group.children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    uncategorized.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const sorted = Array.from(catMap.values()).sort((a, b) => a.position - b.position);

    const result: CategoryGroup[] = [];
    if (uncategorized.length > 0) {
      result.push({ id: null, name: '', position: -1, children: uncategorized });
    }
    result.push(...sorted);
    return result;
  }, [channels]);

  const renderVoiceMembers = (members: VoiceStateVM[], channelId: string) => (
    <div className="voice-channel-members">
      {members.map(m => (
        <div
          key={m.userId}
          className={`voice-member ${speakingUsers.has(m.userId) ? 'speaking' : ''}`}
          onContextMenu={(e) => handleVoiceMemberContextMenu(e, m, channelId)}
        >
          <img
            className="voice-member-status-icon"
            src={xsFrameForStatus(m.userStatus)}
            alt=""
            draggable={false}
          />
          <span className="voice-member-name">{m.userName}</span>
          {m.selfMute && <span className="voice-member-icon" title="Muted">🔇</span>}
          {m.selfDeaf && <span className="voice-member-icon" title="Deafened">🔈</span>}
        </div>
      ))}
    </div>
  );

  const renderChannel = (ch: ChannelVM) => {
    if (ch.channelType === 'voice') {
      const members = voiceStateMap.get(ch.id) || [];
      const isCurrentVoice = ch.id === currentVoiceChannelId;
      return (
        <div key={ch.id} className="voice-channel-group">
          <div
            className={`chat-sidebar-channel voice-channel ${isCurrentVoice ? 'active' : ''}`}
            onClick={() => onJoinVoice(ch.id)}
          >
            <img className="voice-channel-icon" src={assetUrl('images', 'message', 'voicechannel.png')} alt="" draggable={false} />
            {ch.name}
          </div>
          {members.length > 0 && renderVoiceMembers(members, ch.id)}
        </div>
      );
    }

    return (
      <div
        key={ch.id}
        className={`chat-sidebar-channel ${ch.id === activeChannelId ? 'active' : ''}`}
        onClick={() => onSelectChannel(ch.id)}
      >
        <span># {ch.name}</span>
        {notifiedChannelIds?.has(ch.id) && (
          <img className="channel-notif-icon" src={assetUrl('images', 'icons', 'Notification.ico')} alt="" draggable={false} />
        )}
      </div>
    );
  };

  return (
    <div className="chat-sidebar" ref={sidebarRef}>
      <div className="chat-sidebar-guild-name">{guildName}</div>

      {categoryGroups.map(group => (
        <div key={group.id ?? '__uncategorized'} className="sidebar-section">
          {group.id !== null && (
            <div className="sidebar-category-label">
              {group.name}
            </div>
          )}
          {group.children.map(renderChannel)}
        </div>
      ))}

      {voiceCtxMenu && createPortal(
        (() => {
          const isSelf = voiceCtxMenu.member.userId === currentUserId;
          return (
            <div
              className="msg-context-menu voice-ctx-menu"
              style={{ top: voiceCtxMenu.y, left: voiceCtxMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
            <button
              type="button"
              className="msg-ctx-item"
              onClick={() => {
                onUserClick?.(voiceCtxMenu.member.userId, voiceCtxMenu.x, voiceCtxMenu.y);
                setVoiceCtxMenu(null);
              }}
            >
              Profile
            </button>
            <div className="msg-ctx-separator" role="separator" />
            {isSelf ? (
              <>
                <button
                  type="button"
                  className={`msg-ctx-item ${selfDeafened ? 'active' : ''}`}
                  onClick={() => { onToggleDeafen?.(); setVoiceCtxMenu(null); }}
                >
                  Deafen {selfDeafened && '✓'}
                </button>
                <button
                  type="button"
                  className={`msg-ctx-item ${selfMuted ? 'active' : ''}`}
                  onClick={() => { onToggleMute?.(); setVoiceCtxMenu(null); }}
                >
                  Mute {selfMuted && '✓'}
                </button>
                <div
                  className="voice-ctx-submenu-wrapper"
                  onMouseEnter={() => setVoiceCtxSubmenu('client-volume')}
                  onMouseLeave={() => setVoiceCtxSubmenu(null)}
                >
                  <div className="msg-ctx-item voice-ctx-has-submenu">Volume ▸</div>
                  {voiceCtxSubmenu === 'client-volume' && (
                    <div className="voice-ctx-submenu">
                      {VOLUME_OPTIONS.map((vol, i) => (
                        <button
                          key={vol}
                          type="button"
                          className={`msg-ctx-item voice-ctx-vol-item ${voiceCtxMenuState && Math.abs(voiceCtxMenuState.inputVolume - vol) < 0.01 ? 'active' : ''}`}
                          onClick={() => {
                            window.aerocord.voice.setInputVolume(vol);
                            setVoiceCtxMenu(null);
                          }}
                        >
                          {voiceCtxMenuState && Math.abs(voiceCtxMenuState.inputVolume - vol) < 0.01 ? <span>✓</span> : null}
                          <span>{VOLUME_LABELS[i]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`msg-ctx-item ${voiceCtxMenuState?.userMuted ? 'active' : ''}`}
                  onClick={() => {
                    window.aerocord.voice.setUserMuted(voiceCtxMenu.member.userId, !voiceCtxMenuState?.userMuted);
                    setVoiceCtxMenu(null);
                  }}
                >
                  Mute {voiceCtxMenuState?.userMuted && '✓'}
                </button>
                <div
                  className="voice-ctx-submenu-wrapper"
                  onMouseEnter={() => setVoiceCtxSubmenu('user-volume')}
                  onMouseLeave={() => setVoiceCtxSubmenu(null)}
                >
                  <div className="msg-ctx-item voice-ctx-has-submenu">Volume ▸</div>
                  {voiceCtxSubmenu === 'user-volume' && (
                    <div className="voice-ctx-submenu">
                      {VOLUME_OPTIONS.map((vol, i) => (
                        <button
                          key={vol}
                          type="button"
                          className={`msg-ctx-item voice-ctx-vol-item ${voiceCtxMenuState && Math.abs(voiceCtxMenuState.userVolume - vol) < 0.01 ? 'active' : ''}`}
                          onClick={() => {
                            window.aerocord.voice.setUserVolume(voiceCtxMenu.member.userId, vol);
                            setVoiceCtxMenu(null);
                          }}
                        >
                          {voiceCtxMenuState && Math.abs(voiceCtxMenuState.userVolume - vol) < 0.01 ? <span>✓</span> : null}
                          <span>{VOLUME_LABELS[i]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          );
        })(),
        document.body,
      )}
    </div>
  );
};
