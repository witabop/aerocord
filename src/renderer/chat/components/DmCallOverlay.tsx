import React, { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import { StatusAvatar } from '../../shared/components/StatusAvatar';
import type { UserVM, DmCallState } from '../../shared/types';

interface DmCallOverlayProps {
  callState: DmCallState;
  recipient: UserVM | undefined;
  currentUser: UserVM | null;
  speakingUsers: Set<string>;
  selfMuted: boolean;
  selfDeafened: boolean;
  onHangup: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

interface VolumeSliderProps {
  value: number;
  onChange: (v: number) => void;
}

const VolumeSlider: React.FC<VolumeSliderProps> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);

  const updateFromY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round(pct * 200) / 100);
  }, [onChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => updateFromY(e.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, updateFromY]);

  const pct = Math.max(0, Math.min(1, value / 2));
  const knobImg = dragging
    ? assetUrl('images', 'call', 'volhandle_pressed.png')
    : hovering
      ? assetUrl('images', 'call', 'volhandle_hover.png')
      : assetUrl('images', 'call', 'volhandle.png');

  return (
    <div className="call-vol-wrapper">
      <div
        className="call-vol-track"
        ref={trackRef}
        onMouseDown={(e) => { setDragging(true); updateFromY(e.clientY); }}
      >
        <div className="call-vol-fill" style={{ height: `${pct * 100}%` }} />
        <div
          className="call-vol-knob"
          style={{ bottom: `${pct * 100}%` }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <img src={knobImg} alt="" draggable={false} />
        </div>
      </div>
      <img
        className="call-vol-icon"
        src={assetUrl('images', 'message', 'voicechannel.png')}
        alt="Volume"
        draggable={false}
      />
    </div>
  );
};

export const DmCallOverlay: React.FC<DmCallOverlayProps> = ({
  callState,
  recipient,
  currentUser,
  speakingUsers,
  selfMuted,
  selfDeafened,
  onHangup,
  onAccept,
  onDecline,
  onToggleMute,
  onToggleDeafen,
}) => {
  const [recipientVol, setRecipientVol] = useState(1.0);
  const [inputVol, setInputVol] = useState(1.0);

  useEffect(() => {
    if (recipient) {
      window.aerocord.voice.getUserVolume(recipient.id).then(setRecipientVol).catch(() => {});
    }
    window.aerocord.voice.getInputVolume().then(setInputVol).catch(() => {});
  }, [recipient]);

  const handleRecipientVol = useCallback((v: number) => {
    setRecipientVol(v);
    if (recipient) window.aerocord.voice.setUserVolume(recipient.id, v);
  }, [recipient]);

  const handleInputVol = useCallback((v: number) => {
    setInputVol(v);
    window.aerocord.voice.setInputVolume(v);
  }, []);

  const recipientSpeaking = recipient ? speakingUsers.has(recipient.id) : false;
  const clientSpeaking = currentUser ? speakingUsers.has(currentUser.id) : false;
  const isOutgoing = callState === 'outgoing';
  const isIncoming = callState === 'incoming';

  return (
    <div className="dm-call-overlay">
      <div className="dm-call-portraits">
        {/* Recipient portrait -- dimmed when outgoing */}
        <div className="dm-call-portrait-group">
          <VolumeSlider value={recipientVol} onChange={handleRecipientVol} />
          <div className={`dm-call-portrait ${isOutgoing ? 'pending' : ''}`}>
            <div className={`dm-call-portrait-inner ${recipientSpeaking ? 'speaking' : ''}`}>
              {recipient && (
                <StatusAvatar
                  src={recipient.avatar}
                  status={recipient.presence?.status || 'Offline'}
                  size="xl"
                />
              )}
            </div>
          </div>
        </div>

        {/* Center controls */}
        <div className="dm-call-center">
          {isIncoming ? (
            <div className="dm-call-incoming-btns">
              <button className="dm-call-accept-btn" onClick={onAccept} title="Answer">
                <img
                  src={assetUrl('images', 'call', 'answer-call.ico')}
                  alt="Answer"
                  draggable={false}
                />
              </button>
              <button className="dm-call-hangup-btn" onClick={onDecline} title="Decline">
                <img
                  src={assetUrl('images', 'LeaveCall.png')}
                  alt="Decline"
                  draggable={false}
                />
              </button>
            </div>
          ) : (
            <div className="dm-call-control-btns">
              <button
                className={`voice-ctrl-btn ${selfMuted ? 'active' : ''}`}
                onClick={onToggleMute}
                title={selfMuted ? 'Unmute' : 'Mute'}
              >
                <img
                  src={assetUrl('images', 'message', selfMuted ? 'mutedtrue.png' : 'mutedfalse.png')}
                  alt={selfMuted ? 'Muted' : 'Unmuted'}
                  draggable={false}
                  className="voice-ctrl-icon"
                />
              </button>
              <button
                className={`voice-ctrl-btn ${selfDeafened ? 'active' : ''}`}
                onClick={onToggleDeafen}
                title={selfDeafened ? 'Undeafen' : 'Deafen'}
              >
                <img
                  src={assetUrl('images', 'message', selfDeafened ? 'deafentrue.png' : 'deafenfalse.png')}
                  alt={selfDeafened ? 'Deafened' : 'Undeafened'}
                  draggable={false}
                  className="voice-ctrl-icon"
                />
              </button>
              <button className="dm-call-hangup-btn" onClick={onHangup} title="Hang up">
                <img
                  src={assetUrl('images', 'LeaveCall.png')}
                  alt="Hang up"
                  draggable={false}
                />
              </button>
            </div>
          )}
        </div>

        {/* Client portrait -- dimmed when incoming */}
        <div className="dm-call-portrait-group">
          <VolumeSlider value={inputVol} onChange={handleInputVol} />
          <div className={`dm-call-portrait ${isIncoming ? 'pending' : ''}`}>
            <div className={`dm-call-portrait-inner ${clientSpeaking ? 'speaking' : ''}`}>
              {currentUser && (
                <StatusAvatar
                  src={currentUser.avatar}
                  status={currentUser.presence?.status || 'Online'}
                  size="xl"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
