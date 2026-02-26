import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { StatusAvatar } from '../../shared/components/StatusAvatar';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { UserVM, SceneVM } from '../../shared/types';

const STATUS_OPTIONS = [
  { value: 'Online', label: 'Available', icon: 'Active.ico' },
  { value: 'DoNotDisturb', label: 'Busy', icon: 'Dnd.ico' },
  { value: 'Idle', label: 'Away', icon: 'Idle.ico' },
  { value: 'Invisible', label: 'Appear offline', icon: 'Offline.ico' },
];

interface UserProfileProps {
  user: UserVM | null;
  scene: SceneVM | null;
  onStatusChange: (status: string) => void;
  onCustomStatusChange: (text: string | null) => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  scene,
  onStatusChange,
  onCustomStatusChange,
  onSignOut,
  onOpenSettings,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [editingCustomStatus, setEditingCustomStatus] = useState(false);
  const [customStatusText, setCustomStatusText] = useState('');
  const customStatusRef = useRef<HTMLInputElement>(null);
  const statusBtnRef = useRef<HTMLDivElement>(null);
  const statusOpt = STATUS_OPTIONS.find(s => s.value === user?.presence?.status) || STATUS_OPTIONS[0];

  const handleCustomStatusClick = useCallback(() => {
    setCustomStatusText(user?.presence?.customStatus || '');
    setEditingCustomStatus(true);
    setTimeout(() => customStatusRef.current?.focus(), 0);
  }, [user]);

  const handleCustomStatusSubmit = useCallback(() => {
    setEditingCustomStatus(false);
    const trimmed = customStatusText.trim();
    onCustomStatusChange(trimmed || null);
  }, [customStatusText, onCustomStatusChange]);

  if (!user) {
    return (
      <div className="user-profile">
        <div className="user-profile-info">
          <span className="user-display-name">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <StatusAvatar
        src={user.avatar}
        status={user.presence?.status || 'Offline'}
        size="large"
      />
      <div className="user-profile-info no-drag">
        <div
          ref={statusBtnRef}
          className={`user-name-row ${dropdownOpen ? 'active' : ''}`}
          onClick={() => {
            if (!dropdownOpen && statusBtnRef.current) {
              const rect = statusBtnRef.current.getBoundingClientRect();
              setDropdownPos({ top: rect.bottom + 2, left: rect.left });
            }
            setDropdownOpen(!dropdownOpen);
          }}
          title="Change status"
          role="button"
        >
          <span className="user-display-name">{user.name}</span>
          <span className="user-status-dropdown-btn">
            ({statusOpt.label}) &#x25BC;
          </span>
        </div>

        <div className={`user-custom-status-wrap ${editingCustomStatus ? 'active' : ''}`}>
          {editingCustomStatus ? (
            <input
              ref={customStatusRef}
              className="custom-status-input"
              value={customStatusText}
              onChange={(e) => setCustomStatusText(e.target.value)}
              onBlur={handleCustomStatusSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomStatusSubmit();
                if (e.key === 'Escape') setEditingCustomStatus(false);
              }}
              placeholder="Share a quick message"
              maxLength={128}
            />
          ) : (
            <div className="user-custom-status" onClick={handleCustomStatusClick}>
              {user.presence?.customStatus || 'Share a quick message'}
            </div>
          )}
        </div>
      </div>

      {dropdownOpen && ReactDOM.createPortal(
        <>
          <div className="status-dropdown-overlay" onClick={() => setDropdownOpen(false)} />
          <div className="status-dropdown-popup" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="wlm-menu-item"
                onClick={() => {
                  onStatusChange(opt.value);
                  setDropdownOpen(false);
                }}
              >
                <img className="wlm-menu-icon" src={assetUrl('images', 'tray', opt.icon)} alt="" draggable={false} />
                {opt.label}
              </button>
            ))}
            <div className="wlm-menu-separator" />
            <button className="wlm-menu-item" onClick={() => { onSignOut(); setDropdownOpen(false); }}>
              Sign out from here
            </button>
            <div className="wlm-menu-separator" />
            <button className="wlm-menu-item" onClick={() => { onOpenSettings(); setDropdownOpen(false); }}>
              Options
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
