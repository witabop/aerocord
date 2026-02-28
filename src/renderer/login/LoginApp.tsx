import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useIPCEvent } from '../shared/hooks/useIPC';
import { assetUrl } from '../shared/hooks/useAssets';
import { StatusAvatar } from '../shared/components/StatusAvatar';
import type { LoginStatus } from '../shared/types';
import './login.css';

const DEFAULT_SCENE_COLOR = '#3bb2ea';

const STATUS_OPTIONS = [
  { value: 'Online', label: 'Available', icon: 'Active.ico' },
  { value: 'DoNotDisturb', label: 'Busy', icon: 'Dnd.ico' },
  { value: 'Idle', label: 'Away', icon: 'Idle.ico' },
  { value: 'Invisible', label: 'Appear offline', icon: 'Offline.ico' },
];

export const LoginApp: React.FC = () => {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Online');
  const [rememberMe, setRememberMe] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        statusMenuRef.current?.contains(target) ||
        statusTriggerRef.current?.contains(target)
      ) return;
      setStatusDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);

  useIPCEvent('event:loginStatus', (status: unknown) => {
    const s = status as string;
    if (s === 'connecting') {
      setConnectionStatus('Connecting...');
      setLoggingIn(true);
    } else {
      setLoggingIn(false);
      setConnectionStatus(null);
      setError(getErrorMessage(s as LoginStatus));
    }
  });

  const getErrorMessage = (status: LoginStatus): string => {
    switch (status) {
      case 'unauthorized':
        return 'The Discord token you entered is incorrect.';
      case 'badRequest':
        return 'The request was malformed. This is an Aerocord bug.';
      case 'serverError':
        return 'Could not connect to Discord servers. Check your internet connection.';
      default:
        return 'An unknown error occurred. Please try again.';
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!token.trim()) {
      setError('Please enter your Discord token.');
      return;
    }

    setLoggingIn(true);
    setError(null);

    const cleanToken = token.replace(/Authorization:/gi, '').replace(/\n|\r/g, '').trim();
    const result = await window.aerocord.auth.login(cleanToken, rememberMe, status) as LoginStatus;

    if (result !== 'success') {
      setLoggingIn(false);
      setError(getErrorMessage(result));
    }
  }, [token, rememberMe, status]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSignIn();
  };

  const selectedStatus = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  const defaultProfilePic = assetUrl('images', 'login', 'defaultprofilepic.png');
  const defaultSceneBg = assetUrl('scenes', 'default.png');

  return (
    <div
      className="wlm-window login-window"
      style={{ '--login-scene-color': DEFAULT_SCENE_COLOR } as React.CSSProperties}
    >
      {/* Top: scene banner with profile portrait, blends into white */}
      <div className="login-scene-banner">
        <img
          className="login-scene-bg"
          src={defaultSceneBg}
          alt=""
          draggable={false}
        />
        <div className="login-scene-gradient" />
        <div className="login-profile-wrap">
          <StatusAvatar
            src={defaultProfilePic}
            status="Offline"
            size="xl"
          />
        </div>
      </div>

      <div className="login-body">
        <h2 className="login-sign-in-title">Sign in</h2>

        <div className="login-form-box no-drag">
          {error && <div className="login-error">{error}</div>}
          {connectionStatus && <div className="login-connecting">{connectionStatus}</div>}

          <div className="login-form-group">
            <input
              ref={tokenRef}
              id="token"
              type="password"
              className="wlm-input login-token-input no-drag"
              placeholder="Paste your Discord token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loggingIn}
              autoFocus
            />
          </div>

          <div className="login-form-group login-sign-in-as-row">
            <span className="login-form-label login-sign-in-as-label">Sign in as</span>
            <div className="wlm-dropdown no-drag login-status-dropdown">
              <button
                ref={statusTriggerRef}
                type="button"
                className="wlm-dropdown-trigger login-status-trigger"
                onClick={() => {
                  if (!statusDropdownOpen && statusTriggerRef.current) {
                    const rect = statusTriggerRef.current.getBoundingClientRect();
                    setStatusMenuPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
                  }
                  setStatusDropdownOpen(!statusDropdownOpen);
                }}
                disabled={loggingIn}
              >
                <img
                  className="login-status-icon"
                  src={assetUrl('images', 'tray', selectedStatus.icon)}
                  alt=""
                  draggable={false}
                />
                <span>{selectedStatus.label}</span>
                <span className="dropdown-arrow">&#x25BC;</span>
              </button>
              {statusDropdownOpen &&
                ReactDOM.createPortal(
                  <>
                    <div className="login-status-dropdown-backdrop" aria-hidden />
                    <div
                      ref={statusMenuRef}
                      className="wlm-dropdown-menu login-status-dropdown-menu-portal"
                      style={{
                        position: 'fixed',
                        top: statusMenuPos.top,
                        left: statusMenuPos.left,
                        minWidth: statusMenuPos.width,
                        right: 'auto',
                      }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <div
                          key={opt.value}
                          className="wlm-dropdown-item"
                          onClick={() => {
                            setStatus(opt.value);
                            setStatusDropdownOpen(false);
                          }}
                        >
                          <img
                            className="login-status-icon"
                            src={assetUrl('images', 'tray', opt.icon)}
                            alt=""
                            draggable={false}
                          />
                          <span>{opt.label}</span>
                        </div>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
            </div>
          </div>

          <div className="login-form-group login-remember-row">
            <label className="login-remember-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loggingIn}
              />
              Remember me
            </label>
          </div>
        </div>

        <button
          className="wlm-button primary login-sign-in-btn no-drag"
          onClick={handleSignIn}
          disabled={loggingIn || !token.trim()}
        >
          {loggingIn ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="login-warning">
          Using a custom Discord client is against Discord&apos;s rules.
          By continuing, you accept the risk.
        </p>
      </div>
    </div>
  );
};
