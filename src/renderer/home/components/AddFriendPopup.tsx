import React, { useState, useCallback } from 'react';

interface AddFriendPopupProps {
  visible: boolean;
  onClose: () => void;
}

export const AddFriendPopup: React.FC<AddFriendPopupProps> = ({ visible, onClose }) => {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!username.trim() || sending) return;
    setSending(true);
    setStatus(null);
    const result = await window.aerocord.contacts.sendFriendRequest(username.trim());
    setSending(false);
    if (result.success) {
      setStatus('Friend request sent!');
      setUsername('');
    } else {
      setStatus(result.error || 'Failed to send request');
    }
  }, [username, sending]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
    if (e.key === 'Escape') onClose();
  }, [handleSend, onClose]);

  if (!visible) return null;

  return (
    <div className="add-friend-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-friend-popup">
        <div className="add-friend-title">Add a Contact</div>
        <div className="add-friend-body">
          <label className="add-friend-label">Enter their username:</label>
          <input
            type="text"
            className="add-friend-input"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {status && (
            <div className={`add-friend-status ${status.includes('sent') ? 'success' : 'error'}`}>
              {status}
            </div>
          )}
        </div>
        <div className="add-friend-actions">
          <button className="add-friend-btn send" onClick={handleSend} disabled={sending || !username.trim()}>
            {sending ? 'Sending...' : 'Send Friend Request'}
          </button>
          <button className="add-friend-btn cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
