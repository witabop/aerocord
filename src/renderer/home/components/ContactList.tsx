import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { HomeListItemVM } from '../../shared/types';

interface ContactListProps {
  title: string;
  items: HomeListItemVM[];
  onDoubleClick: (channelId: string) => void;
  defaultCollapsed?: boolean;
  icon?: string;
  onToggleFavorite?: (channelId: string, add: boolean) => void;
  favoriteIds?: Set<string>;
  hideFavOption?: boolean;
  notifiedIds?: Set<string>;
  /** When 'friendRequests', context menu shows Accept / Ignore instead of Favorites */
  contextMenuMode?: 'favorites' | 'friendRequests';
  onAcceptFriendRequest?: (userId: string) => void;
  onIgnoreFriendRequest?: (userId: string) => void;
  /** When set, context menu includes "Close conversation" for items where this returns true (e.g. DMs only, not servers/groups). */
  onCloseConversation?: (channelId: string) => void;
  /** When onCloseConversation is set, only show "Close conversation" for items where this returns true. Default: all. */
  canCloseConversation?: (item: HomeListItemVM) => boolean;
  /** When set, context menu includes "Remove friend" for DMs where the other user is in friendIds. */
  onRemoveFriend?: (userId: string) => void;
  /** Set of user ids that are friends (used with onRemoveFriend). */
  friendIds?: Set<string>;
}

interface CtxMenu {
  x: number;
  y: number;
  itemId: string;
  isFav: boolean;
}

function xsFrameIcon(status: string, isMulti: boolean): string {
  const suffix = isMulti ? 'M' : '';
  switch (status) {
    case 'Online': return `XSFrameActive${suffix}.png`;
    case 'Idle': return `XSFrameIdle${suffix}.png`;
    case 'DoNotDisturb': return `XSFrameDnd${suffix}.png`;
    case 'Invisible':
    case 'Offline':
    default: return `XSFrameOffline${suffix}.png`;
  }
}

export const ContactList: React.FC<ContactListProps> = ({
  title,
  items,
  onDoubleClick,
  defaultCollapsed = false,
  icon,
  onToggleFavorite,
  favoriteIds,
  hideFavOption,
  notifiedIds,
  contextMenuMode,
  onAcceptFriendRequest,
  onIgnoreFriendRequest,
  onCloseConversation,
  canCloseConversation,
  onRemoveFriend,
  friendIds,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!ctxMenu || !rootRef.current) return;
    let el: HTMLElement | null = rootRef.current;
    while (el) {
      const style = getComputedStyle(el);
      const ov = style.overflowY || style.overflow;
      if (ov === 'auto' || ov === 'scroll') {
        const onScroll = () => setCtxMenu(null);
        el.addEventListener('scroll', onScroll);
        return () => el?.removeEventListener('scroll', onScroll);
      }
      el = el.parentElement;
    }
  }, [ctxMenu]);

  const handleItemClick = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleItemDoubleClick = useCallback((id: string) => {
    onDoubleClick(id);
  }, [onDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: string) => {
    if (contextMenuMode !== 'friendRequests' && hideFavOption && !onCloseConversation && !onRemoveFriend) return;
    e.preventDefault();
    const isFav = favoriteIds?.has(itemId) ?? false;
    setCtxMenu({ x: e.clientX, y: e.clientY, itemId, isFav });
  }, [favoriteIds, hideFavOption, contextMenuMode, onCloseConversation, onRemoveFriend]);

  const handleToggleFav = useCallback(() => {
    if (ctxMenu && onToggleFavorite) {
      onToggleFavorite(ctxMenu.itemId, !ctxMenu.isFav);
    }
    setCtxMenu(null);
  }, [ctxMenu, onToggleFavorite]);

  const handleAcceptRequest = useCallback(() => {
    if (ctxMenu && onAcceptFriendRequest) {
      onAcceptFriendRequest(ctxMenu.itemId);
    }
    setCtxMenu(null);
  }, [ctxMenu, onAcceptFriendRequest]);

  const handleIgnoreRequest = useCallback(() => {
    if (ctxMenu && onIgnoreFriendRequest) {
      onIgnoreFriendRequest(ctxMenu.itemId);
    }
    setCtxMenu(null);
  }, [ctxMenu, onIgnoreFriendRequest]);

  const handleCloseConversation = useCallback(() => {
    if (ctxMenu && onCloseConversation) {
      onCloseConversation(ctxMenu.itemId);
    }
    setCtxMenu(null);
  }, [ctxMenu, onCloseConversation]);

  const handleRemoveFriend = useCallback(() => {
    if (ctxMenu && onRemoveFriend) {
      const item = items.find(i => i.id === ctxMenu.itemId);
      if (item?.recipientId) onRemoveFriend(item.recipientId);
    }
    setCtxMenu(null);
  }, [ctxMenu, onRemoveFriend, items]);

  const onlineCount = useMemo(
    () => items.filter(i =>
      i.presence?.status === 'Online' ||
      i.presence?.status === 'Idle' ||
      i.presence?.status === 'DoNotDisturb'
    ).length,
    [items],
  );

  return (
    <div className="contact-category" ref={rootRef}>
      <div
        className="contact-category-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`category-arrow ${collapsed ? 'collapsed' : ''}`}>&#x25BC;</span>
        {icon && <img className="contact-category-icon" src={icon} alt="" draggable={false} />}
        <span>{title}</span>
        <span className="contact-category-count">({onlineCount}/{items.length})</span>
      </div>
      {!collapsed && (
        <ul className="contact-list">
          {items.map((item) => {
            const isMulti = item.isGroupChat || item.recipientCount > 2;
            const status = item.presence?.status || 'Offline';
            const effectiveStatus = isMulti
              ? (status === 'Offline' ? 'Offline' : 'Online')
              : status;
            const iconFile = xsFrameIcon(effectiveStatus, isMulti);
            const iconSrc = assetUrl('images', 'frames', 'Frames', iconFile);

            return (
              <li
                key={item.id}
                className={`contact-item ${selectedId === item.id ? 'selected' : ''}`}
                onClick={() => handleItemClick(item.id)}
                onDoubleClick={() => handleItemDoubleClick(item.id)}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
              >
                <img
                  className="contact-status-icon"
                  src={iconSrc}
                  alt=""
                  draggable={false}
                />
                <div className="contact-item-info">
                  <span className="contact-item-name">{item.name}</span>
                  {isMulti && item.recipientCount > 0 && (
                    <span className="contact-item-members">- {item.recipientCount} members</span>
                  )}
                  {!isMulti && item.presence?.presence && (
                    <span className="contact-item-presence">- {item.presence.presence}</span>
                  )}
                </div>
                {notifiedIds?.has(item.id) && (
                  <img
                    className="contact-notif-icon"
                    src={assetUrl('images', 'icons', 'Notification.ico')}
                    alt=""
                    draggable={false}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ctxMenu && (
        <div
          className="contact-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenuMode === 'friendRequests' ? (
            <>
              <button className="contact-ctx-item" onClick={handleAcceptRequest}>
                Accept
              </button>
              <button className="contact-ctx-item" onClick={handleIgnoreRequest}>
                Ignore
              </button>
            </>
          ) : (
            <>
              {!hideFavOption && (
                <button className="contact-ctx-item" onClick={handleToggleFav}>
                  {ctxMenu.isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                </button>
              )}
              {onCloseConversation && (() => {
                const item = items.find(i => i.id === ctxMenu.itemId);
                const showClose = item && (!canCloseConversation || canCloseConversation(item));
                return showClose ? (
                  <button className="contact-ctx-item" onClick={handleCloseConversation}>
                    Close conversation
                  </button>
                  ) : null;
              })()}
              {onRemoveFriend && (() => {
                const item = items.find(i => i.id === ctxMenu.itemId);
                const showRemove = item?.recipientId && friendIds?.has(item.recipientId);
                return showRemove ? (
                  <button className="contact-ctx-item" onClick={handleRemoveFriend}>
                    Remove friend
                  </button>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
};
