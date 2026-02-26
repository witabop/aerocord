import React, { useState, useCallback, useRef } from 'react';
import { useIPCEvent } from '../shared/hooks/useIPC';
import type { LoginStatus } from '../shared/types';
import './login.css';

const STATUS_OPTIONS = [
  { value: 'Online', label: 'Available', cssClass: 'online' },
  { value: 'DoNotDisturb', label: 'Busy', cssClass: 'dnd' },
  { value: 'Idle', label: 'Away', cssClass: 'idle' },
  { value: 'Invisible', label: 'Appear offline', cssClass: 'offline' },
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

  return (
    <div className="wlm-window login-window">
      <div className="login-body">
        <div className="login-header">
          <div className="login-logo">
            <div className="login-icon">&#x1F4AC;</div>
            <h1>Aerocord</h1>
          </div>
          <p className="login-subtitle">Discord, reimagined.</p>
        </div>

        <div className="login-form">
          {error && <div className="login-error">{error}</div>}
          {connectionStatus && <div className="login-connecting">{connectionStatus}</div>}

          <div className="form-group">
            <label htmlFor="token">Discord Token</label>
            <input
              ref={tokenRef}
              id="token"
              type="password"
              className="wlm-input no-drag"
              placeholder="Paste your Discord token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loggingIn}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Sign in as</label>
            <div className="wlm-dropdown no-drag">
              <button
                className="wlm-dropdown-trigger"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                disabled={loggingIn}
              >
                <span className={`status-dot ${selectedStatus.cssClass}`} />
                <span>{selectedStatus.label}</span>
                <span className="dropdown-arrow">&#x25BC;</span>
              </button>
              {statusDropdownOpen && (
                <div className="wlm-dropdown-menu">
                  {STATUS_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      className="wlm-dropdown-item"
                      onClick={() => {
                        setStatus(opt.value);
                        setStatusDropdownOpen(false);
                      }}
                    >
                      <span className={`status-dot ${opt.cssClass}`} />
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-group checkbox-group no-drag">
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loggingIn}
              />
              Remember me
            </label>
          </div>

          <button
            className="wlm-button primary sign-in-btn no-drag"
            onClick={handleSignIn}
            disabled={loggingIn || !token.trim()}
          >
            {loggingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

        <div className="login-footer">
          <span className="login-warning">
            Using a custom Discord client is against Discord&apos;s rules.
            By continuing, you accept the risk.
          </span>
        </div>
      </div>
    </div>
  );
};
