import React from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';

interface VoiceControlsProps {
  channelName: string;
  selfMuted: boolean;
  selfDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  channelName,
  selfMuted,
  selfDeafened,
  onToggleMute,
  onToggleDeafen,
  onLeave,
}) => {
  return (
    <div className="voice-controls-panel">
      <div className="voice-controls-channel">
        <img className="voice-controls-icon" src={assetUrl('images', 'message', 'voicechannel.png')} alt="" draggable={false} />
        <span className="voice-controls-name">{channelName}</span>
      </div>
      <div className="voice-controls-buttons">
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
        <button
          className="voice-ctrl-btn leave"
          onClick={onLeave}
          title="Disconnect"
        >
          <img
            src={assetUrl('images', 'LeaveCall.png')}
            alt="Disconnect"
            draggable={false}
            className="leave-call-icon"
          />
        </button>
      </div>
    </div>
  );
};
