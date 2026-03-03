import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { StatusAvatar } from '../../shared/components/StatusAvatar';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { UserVM } from '../../shared/types';

const BOTTOM_SEPARATOR_URL = assetUrl('images', 'message', 'BottomSeparator.png');
const LARGE_GUILD_THRESHOLD = 1000;

const STATUS_SORT_ORDER: Record<string, number> = {
  Online: 0,
  Idle: 1,
  DoNotDisturb: 2,
  Invisible: 3,
  Offline: 4,
};

interface MemberSidebarProps {
  members: UserVM[];
  onUserClick?: (userId: string, x: number, y: number) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isLoadingInitial?: boolean;
  hasMore?: boolean;
  guildMemberCount?: number;
}

interface RoleGroup {
  roleId: string | null;
  roleName: string;
  permissions: number;
  members: UserVM[];
}

function isOnline(m: UserVM): boolean {
  const s = m.presence?.status;
  return s !== 'Offline' && s !== 'Invisible' && s !== undefined;
}

function statusKey(m: UserVM): number {
  return STATUS_SORT_ORDER[m.presence?.status ?? 'Offline'] ?? 4;
}

function memberSort(a: UserVM, b: UserVM): number {
  const sa = statusKey(a);
  const sb = statusKey(b);
  if (sa !== sb) return sa - sb;
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

function groupMembersByRole(members: UserVM[]): RoleGroup[] {
  const seen = new Set<string>();
  const deduped: UserVM[] = [];
  for (const m of members) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    deduped.push(m);
  }

  const roleMap = new Map<string, { roleName: string; permissions: number; members: UserVM[] }>();
  const noRole: UserVM[] = [];
  const offline: UserVM[] = [];

  for (const m of deduped) {
    if (m.displayRoleId && m.displayRoleName) {
      if (isOnline(m)) {
        const id = m.displayRoleId;
        if (!roleMap.has(id)) {
          roleMap.set(id, {
            roleName: m.displayRoleName,
            permissions: m.displayRolePermissions ?? 0,
            members: [],
          });
        }
        roleMap.get(id)!.members.push(m);
      } else {
        offline.push(m);
      }
    } else {
      if (isOnline(m)) {
        noRole.push(m);
      } else {
        offline.push(m);
      }
    }
  }

  const roleGroups = Array.from(roleMap.entries())
    .map(([roleId, data]) => ({
      roleId: roleId as string | null,
      roleName: data.roleName,
      permissions: data.permissions,
      members: data.members,
    }))
    .sort((a, b) => {
      if (a.permissions !== b.permissions) return b.permissions - a.permissions;
      return a.members.length - b.members.length;
    });

  const groups: RoleGroup[] = [...roleGroups];
  if (noRole.length > 0) {
    groups.push({ roleId: null, roleName: '', permissions: -1, members: noRole });
  }
  if (offline.length > 0) {
    groups.push({ roleId: '__offline__', roleName: 'Offline', permissions: -2, members: offline });
  }

  groups.forEach((g) => g.members.sort(memberSort));
  return groups;
}

export const MemberSidebar: React.FC<MemberSidebarProps> = ({
  members,
  onUserClick,
  onLoadMore,
  isLoadingMore,
  isLoadingInitial,
  hasMore,
  guildMemberCount,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLargeGuild = (guildMemberCount ?? 0) >= LARGE_GUILD_THRESHOLD;

  const roleGroups = useMemo(() => {
    if (isLargeGuild) return null;
    return groupMembersByRole(members);
  }, [members, isLargeGuild]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !onLoadMore || isLoadingMore || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const renderMember = (member: UserVM) => {
    const status = member.presence?.status || 'Offline';
    const isOffline = status === 'Offline' || status === 'Invisible';
    return (
      <div
        key={member.id}
        className={`member-sidebar-item ${isOffline ? 'member-offline' : ''}`}
        onClick={(e) => onUserClick?.(member.id, e.clientX, e.clientY)}
        style={{ cursor: 'pointer' }}
      >
        <StatusAvatar src={member.avatar} status={status} size="small" />
        <span
          className="member-sidebar-name"
          style={member.color && member.color !== '#525252' ? { color: member.color } : undefined}
        >
          {member.name}
        </span>
      </div>
    );
  };

  return (
    <div className="member-sidebar" ref={containerRef}>
      {isLoadingInitial && members.length === 0 && (
        <div className="member-sidebar-loading-initial">Loading members...</div>
      )}

      {roleGroups ? (
        roleGroups.map((group) => (
          <div key={group.roleId ?? '__norole__'} className="member-sidebar-role-group">
            {group.roleId != null && (
              <>
                <div className="member-sidebar-role-header">{group.roleName}</div>
                <img
                  className="member-sidebar-separator"
                  src={BOTTOM_SEPARATOR_URL}
                  alt=""
                  draggable={false}
                  aria-hidden
                />
              </>
            )}
            {group.members.map(renderMember)}
          </div>
        ))
      ) : (
        members.map(renderMember)
      )}

      {isLoadingMore && (
        <div className="member-sidebar-loading">Loading...</div>
      )}
    </div>
  );
};
