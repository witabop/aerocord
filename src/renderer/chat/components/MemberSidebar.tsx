import React from 'react';
import { StatusAvatar } from '../../shared/components/StatusAvatar';
import type { UserVM } from '../../shared/types';

interface MemberSidebarProps {
  members: UserVM[];
  onUserClick?: (userId: string, x: number, y: number) => void;
}

export const MemberSidebar: React.FC<MemberSidebarProps> = ({ members, onUserClick }) => {
  if (members.length === 0) return null;

  return (
    <div className="member-sidebar">
      {members.map((member) => {
        const status = member.presence?.status || 'Offline';
        const isOffline = status === 'Offline' || status === 'Invisible';
        return (
          <div
            key={member.id}
            className={`member-sidebar-item ${isOffline ? 'member-offline' : ''}`}
            onClick={(e) => onUserClick?.(member.id, e.clientX, e.clientY)}
            style={{ cursor: 'pointer' }}
          >
            <StatusAvatar
              src={member.avatar}
              status={status}
              size="small"
            />
            <span className="member-sidebar-name">{member.name}</span>
          </div>
        );
      })}
    </div>
  );
};
