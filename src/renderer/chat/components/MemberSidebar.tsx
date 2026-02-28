import React, { useRef, useEffect, useCallback } from 'react';
import { StatusAvatar } from '../../shared/components/StatusAvatar';
import type { UserVM } from '../../shared/types';

interface MemberSidebarProps {
  members: UserVM[];
  onUserClick?: (userId: string, x: number, y: number) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isLoadingInitial?: boolean;
  hasMore?: boolean;
}

export const MemberSidebar: React.FC<MemberSidebarProps> = ({
  members,
  onUserClick,
  onLoadMore,
  isLoadingMore,
  isLoadingInitial,
  hasMore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !onLoadMore || isLoadingMore || !hasMore) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div className="member-sidebar" ref={containerRef}>
      {isLoadingInitial && members.length === 0 && (
        <div className="member-sidebar-loading-initial">Loading members...</div>
      )}
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
            <span
              className="member-sidebar-name"
              style={member.color && member.color !== '#525252' ? { color: member.color } : undefined}
            >
              {member.name}
            </span>
          </div>
        );
      })}
      {isLoadingMore && (
        <div className="member-sidebar-loading">Loading...</div>
      )}
    </div>
  );
};
