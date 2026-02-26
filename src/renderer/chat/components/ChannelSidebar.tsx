import React, { useMemo } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { ChannelVM, VoiceChannelStateVM, VoiceStateVM } from '../../shared/types';

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
}) => {
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

  const renderVoiceMembers = (members: VoiceStateVM[]) => (
    <div className="voice-channel-members">
      {members.map(m => (
        <div
          key={m.userId}
          className={`voice-member ${speakingUsers.has(m.userId) ? 'speaking' : ''}`}
        >
          <img
            className="voice-member-status-icon"
            src={xsFrameForStatus(m.userStatus)}
            alt=""
            draggable={false}
          />
          <span
            className="voice-member-name clickable-name"
            onClick={(e) => { e.stopPropagation(); onUserClick?.(m.userId, e.clientX, e.clientY); }}
          >{m.userName}</span>
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
          {members.length > 0 && renderVoiceMembers(members)}
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
    <div className="chat-sidebar">
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
    </div>
  );
};
