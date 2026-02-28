import React, { useState, useEffect, useCallback } from 'react';
import { StatusAvatar } from './StatusAvatar';
import { assetUrl } from '../hooks/useAssets';
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
  const [isFriend, setIsFriend] = useState(false);
  const [hoverFriendIcon, setHoverFriendIcon] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setShowRemoveConfirm(false);
    Promise.all([
      window.aerocord.user.getProfile(userId),
      window.aerocord.contacts.getFriends(),
    ]).then(([p, friendIds]) => {
      setProfile(p);
      setIsFriend(Array.isArray(friendIds) && friendIds.includes(userId));
      setLoading(false);
    });
  }, [userId]);

  const handleRemoveFriend = useCallback(async () => {
    setRemoving(true);
    const result = await window.aerocord.contacts.removeFriend(userId);
    setRemoving(false);
    if (result?.success) {
      onClose();
    }
  }, [userId, onClose]);

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
            {isFriend && (
              <div className="profile-popup-friend-area">
                <div
                  className="profile-popup-friend-icon-wrap"
                  onMouseEnter={() => setHoverFriendIcon(true)}
                  onMouseLeave={() => { setHoverFriendIcon(false); setShowRemoveConfirm(false); }}
                >
                  <img
                    className="profile-popup-friend-icon"
                    src={assetUrl('images', 'icons', 'friend.ico')}
                    alt="Friend"
                    draggable={false}
                    onClick={() => setShowRemoveConfirm(prev => !prev)}
                  />
                  {hoverFriendIcon && !showRemoveConfirm && (
                    <div className="profile-popup-friend-tooltip">Friend</div>
                  )}
                  {showRemoveConfirm && (
                    <button
                      type="button"
                      className="profile-popup-remove-friend-btn"
                      onClick={handleRemoveFriend}
                      disabled={removing}
                    >
                      {removing ? 'Removing...' : 'Remove friend?'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {profile.bannerUrl && (
              <img className="profile-popup-scene-bg" src={profile.bannerUrl} alt="" draggable={false} />
            )}
            <div className="profile-popup-avatar-area">
              <StatusAvatar
                src={profile.avatar}
                status={profile.presence?.status || 'Offline'}
                size="xl"
              />
            </div>
            <div className="profile-popup-body">
              <div className="profile-popup-name">{profile.name}</div>
              <div className="profile-popup-username">{profile.username}@discord.com</div>
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
