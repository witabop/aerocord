import React, { useState, useEffect, useCallback } from 'react';
import { StatusAvatar } from './StatusAvatar';
import type { UserProfileVM } from '../types';
import './UserProfilePopup.css';

interface UserProfilePopupProps {
  userId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export const UserProfilePopup: React.FC<UserProfilePopupProps> = ({ userId, position, onClose }) => {
  const [profile, setProfile] = useState<UserProfileVM | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.aerocord.user.getProfile(userId).then(p => {
      setProfile(p);
      setLoading(false);
    });
  }, [userId]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const clampedX = Math.min(position.x, window.innerWidth - 280);
  const clampedY = Math.min(position.y, window.innerHeight - 340);

  const accentColor = profile?.accentColor || '#5865F2';

  return (
    <div className="profile-popup-overlay" onClick={handleOverlayClick}>
      <div
        className="profile-popup"
        style={{
          left: clampedX,
          top: clampedY,
          '--profile-accent': accentColor,
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="profile-popup-loading">Loading...</div>
        ) : profile ? (
          <>
            {profile.bannerUrl && (
              <img className="profile-popup-scene-bg" src={profile.bannerUrl} alt="" draggable={false} />
            )}
            <div className="profile-popup-avatar-area">
              <StatusAvatar
                src={profile.avatar}
                status={profile.presence?.status || 'Offline'}
                size="large"
              />
            </div>
            <div className="profile-popup-body">
              <div className="profile-popup-name">{profile.name}</div>
              <div className="profile-popup-username">{profile.username}</div>
              {profile.presence?.customStatus && (
                <div className="profile-popup-custom-status">{profile.presence.customStatus}</div>
              )}
              {profile.bio && (
                <>
                  <div className="profile-popup-divider" />
                  <div className="profile-popup-section-label">About Me</div>
                  <div className="profile-popup-bio">{profile.bio}</div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="profile-popup-loading">Could not load profile</div>
        )}
      </div>
    </div>
  );
};
