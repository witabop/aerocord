import React, { useState, useEffect, useCallback } from 'react';
import { StatusAvatar } from '../shared/components/StatusAvatar';
import { assetUrl } from '../shared/hooks/useAssets';
import type { NotificationData } from '../shared/types';
import './notification.css';

function getNotificationData(): NotificationData | null {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return null;
  try {
    return JSON.parse(decodeURIComponent(hash));
  } catch {
    return null;
  }
}

export const NotificationApp: React.FC = () => {
  const [data] = useState<NotificationData | null>(() => getNotificationData());
  const [visible, setVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsClosing(true), 7000);
    return () => clearTimeout(timer);
  }, []);

  const closeWindow = useCallback(() => {
    window.aerocord.windows.close();
  }, []);

  const handleClick = useCallback(() => {
    if (data?.channelId) {
      window.aerocord.windows.openChat(data.channelId);
    }
    setIsClosing(true);
  }, [data]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === 'notification-slide-out') {
      closeWindow();
    }
  }, [closeWindow]);

  if (!data || !visible) return null;

  const sceneBg = data.scene?.file ? assetUrl('scenes', data.scene.file) : '';
  const sceneColor = data.scene?.color || '#3bb2ea';

  const notifHeader = (
    <div className="notification-header">
      <img className="notification-logo" src={assetUrl('images', 'notification', 'Logo.png')} alt="" draggable={false} />
      <span className="notification-header-text">Windows Live Messenger</span>
    </div>
  );

  if (data.type === 'signOn') {
    const status = data.presence?.status || 'Online';
    return (
      <div
        className={`notification-window notification-signon ${isClosing ? 'notification-closing' : ''}`}
        style={{ '--notif-scene-color': sceneColor } as React.CSSProperties}
        onClick={handleClick}
        onAnimationEnd={handleAnimationEnd}
      >
        {sceneBg && <img className="notif-scene-bg" src={sceneBg} alt="" draggable={false} />}
        {notifHeader}
        <button className="notification-close" onClick={(e) => { e.stopPropagation(); handleClose(); }}>&#x2715;</button>
        <div className="notification-content">
          <StatusAvatar
            src={data.user?.avatar || ''}
            status={status}
            size="large"
          />
          <div className="notification-text">
            <div className="notification-title">{data.user?.name}</div>
            <div className="notification-subtitle">has just signed in</div>
          </div>
        </div>
      </div>
    );
  }

  const msgStatus = data.message?.author?.presence?.status || 'Online';
  return (
    <div
      className={`notification-window notification-message ${isClosing ? 'notification-closing' : ''}`}
      style={{ '--notif-scene-color': sceneColor } as React.CSSProperties}
      onClick={handleClick}
      onAnimationEnd={handleAnimationEnd}
    >
      {sceneBg && <img className="notif-scene-bg" src={sceneBg} alt="" draggable={false} />}
      {notifHeader}
      <button className="notification-close" onClick={(e) => { e.stopPropagation(); handleClose(); }}>&#x2715;</button>
      <div className="notification-content">
        <StatusAvatar
          src={data.message?.author?.avatar || ''}
          status={msgStatus}
          size="large"
        />
        <div className="notification-text">
          <div className="notification-title">{data.message?.author?.name} says:</div>
          <div className="notification-body">
            {data.message?.rawContent === '[nudge]' ? 'sent you a nudge!' : data.message?.content?.substring(0, 80)}
          </div>
        </div>
      </div>
    </div>
  );
};
