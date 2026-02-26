import React, { useState, useCallback, useEffect } from 'react';
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
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleItemClick = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleItemDoubleClick = useCallback((id: string) => {
    onDoubleClick(id);
  }, [onDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: string) => {
    if (hideFavOption) return;
    e.preventDefault();
    const isFav = favoriteIds?.has(itemId) ?? false;
    setCtxMenu({ x: e.clientX, y: e.clientY, itemId, isFav });
  }, [favoriteIds, hideFavOption]);

  const handleToggleFav = useCallback(() => {
    if (ctxMenu && onToggleFavorite) {
      onToggleFavorite(ctxMenu.itemId, !ctxMenu.isFav);
    }
    setCtxMenu(null);
  }, [ctxMenu, onToggleFavorite]);

  const onlineCount = items.filter(i =>
    i.presence?.status === 'Online' ||
    i.presence?.status === 'Idle' ||
    i.presence?.status === 'DoNotDisturb'
  ).length;

  return (
    <div className="contact-category">
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
          <button className="contact-ctx-item" onClick={handleToggleFav}>
            {ctxMenu.isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
        </div>
      )}
    </div>
  );
};
