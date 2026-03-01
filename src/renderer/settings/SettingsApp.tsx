import React, { useState, useEffect, useCallback } from 'react';
import type { SettingsData } from '../shared/types';
import './settings.css';

interface SettingDef {
  key: keyof SettingsData;
  category: string;
  label: string;
  type: 'boolean' | 'number' | 'select';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

const SETTING_DEFS: SettingDef[] = [
  { key: 'notifyFriendOnline', category: 'Alerts', label: 'Notify me when my friends come online', type: 'boolean' },
  { key: 'notifyDm', category: 'Alerts', label: 'Notify me when I receive a direct message', type: 'boolean' },
  { key: 'notifyMention', category: 'Alerts', label: 'Notify me when I am mentioned', type: 'boolean' },
  { key: 'notifyChat', category: 'Alerts', label: 'Play notification on new chat message', type: 'boolean' },
  { key: 'automaticallyOpenNotification', category: 'Alerts', label: 'Open new chat window on DM', type: 'boolean' },
  { key: 'playNotificationSounds', category: 'Alerts', label: 'Play notification sounds', type: 'boolean' },
  { key: 'enableMessageTts', category: 'Alerts', label: 'Allow TTS messages to be read aloud', type: 'boolean' },
  { key: 'nudgeIntensity', category: 'Alerts', label: 'Nudge intensity', type: 'number', min: 1, max: 30 },
  { key: 'nudgeLength', category: 'Alerts', label: 'Nudge length (seconds)', type: 'number', min: 1, max: 10 },
  { key: 'goIdleWithFullscreenProgram', category: 'Activity', label: 'Go "away" when fullscreen app is open', type: 'boolean' },
  { key: 'highlightMentions', category: 'Appearance', label: 'Highlight messages that mention you', type: 'boolean' },
  { key: 'displayDiscordServerLink', category: 'Appearance', label: 'Show Discord server link on home page', type: 'boolean' },
  { key: 'displayHomeNews', category: 'Appearance', label: 'Show news on the home page', type: 'boolean' },
  { key: 'displayAds', category: 'Appearance', label: 'Show community ads on the home page', type: 'boolean' },
  { key: 'displayAerochatAttribution', category: 'Appearance', label: 'Show Aerocord link on chat window', type: 'boolean' },
  { key: 'displayLinkPreviews', category: 'Appearance', label: 'Show link previews in chat', type: 'boolean' },
  { key: 'showMemberList', category: 'Appearance', label: 'Show user list in servers and group chats', type: 'boolean' },
  { key: 'selectedTimeFormat', category: 'Appearance', label: 'Time format', type: 'select', options: [{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }] },
  { key: 'discordDeveloperMode', category: 'Appearance', label: 'Enable developer mode', type: 'boolean' },
];

interface AudioDevice {
  deviceId: string;
  label: string;
}

export const SettingsApp: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [activeCategory, setActiveCategory] = useState('Alerts');
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    window.aerocord.settings.get().then((s: any) => setSettings(s));
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(
        devices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` }))
      );
      setOutputDevices(
        devices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker (${d.deviceId.slice(0, 8)})` }))
      );
    } catch {
      setInputDevices([{ deviceId: 'default', label: 'Default' }]);
      setOutputDevices([{ deviceId: 'default', label: 'Default' }]);
    }
  };

  const handleChange = useCallback(async (key: keyof SettingsData, value: unknown) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value } as SettingsData;
    setSettings(updated);
    await window.aerocord.settings.update({ [key]: value });
  }, [settings]);

  const allCategories = [...new Set(SETTING_DEFS.map(s => s.category)), 'Audio'];
  const filteredSettings = SETTING_DEFS.filter(s => s.category === activeCategory);

  if (!settings) return <div className="wlm-window settings-window"><div className="settings-loading">Loading...</div></div>;

  return (
    <div className="wlm-window settings-window">
      <div className="settings-body">
        <div className="settings-sidebar">
          {allCategories.map(cat => (
            <div
              key={cat}
              className={`settings-sidebar-item ${cat === activeCategory ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </div>
          ))}
        </div>
        <div className="settings-content">
          <h2 className="settings-category-title">{activeCategory}</h2>

          {activeCategory === 'Audio' ? (
            <>
              <div className="settings-row">
                <div className="settings-select-row">
                  <span>Input Device (Microphone)</span>
                  <select
                    className="wlm-input settings-select no-drag"
                    value={settings.audioInputDeviceId}
                    onChange={(e) => handleChange('audioInputDeviceId', e.target.value)}
                  >
                    {inputDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-select-row">
                  <span>Output Device (Speakers)</span>
                  <select
                    className="wlm-input settings-select no-drag"
                    value={settings.audioOutputDeviceId}
                    onChange={(e) => handleChange('audioOutputDeviceId', e.target.value)}
                  >
                    {outputDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-slider-row">
                  <span>Noise gate (dB)</span>
                  <div className="settings-slider-wrap">
                    <input
                      type="range"
                      className="settings-slider no-drag"
                      min={-60}
                      max={0}
                      step={1}
                      value={settings.noiseGateDb ?? -60}
                      style={{ '--slider-pct': `${((settings.noiseGateDb ?? -60) + 60) / 60 * 100}%` } as React.CSSProperties}
                      onChange={(e) => handleChange('noiseGateDb', parseFloat(e.target.value))}
                    />
                    <span className="settings-slider-label">
                      {(settings.noiseGateDb ?? -60) === -60 ? 'Off' : `${settings.noiseGateDb ?? -60} dB`}
                    </span>
                  </div>
                </div>
                <div className="settings-hint">Only transmit when audio is above this level. Off = allow all.</div>
              </div>
            </>
          ) : (
            filteredSettings.map(def => (
              <div key={def.key} className="settings-row">
                {def.type === 'boolean' && (
                  <label className="settings-checkbox-label no-drag">
                    <input
                      type="checkbox"
                      checked={settings[def.key] as boolean}
                      onChange={(e) => handleChange(def.key, e.target.checked)}
                    />
                    {def.label}
                  </label>
                )}
                {def.type === 'number' && (
                  <div className="settings-number-row">
                    <span>{def.label}</span>
                    <input
                      type="number"
                      className="wlm-input settings-number-input no-drag"
                      value={settings[def.key] as number}
                      min={def.min}
                      max={def.max}
                      onChange={(e) => handleChange(def.key, parseInt(e.target.value, 10))}
                    />
                  </div>
                )}
                {def.type === 'select' && (
                  <div className="settings-select-row">
                    <span>{def.label}</span>
                    <select
                      className="wlm-input settings-select no-drag"
                      value={settings[def.key] as string}
                      onChange={(e) => handleChange(def.key, e.target.value)}
                    >
                      {def.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
