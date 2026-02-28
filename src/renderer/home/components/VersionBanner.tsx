import React, { useState, useEffect, useCallback } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import './VersionBanner.css';

const GITHUB_REPO = 'witabop/aerocord';
const GITHUB_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Parse version string (e.g. "0.3", "v0.2.1") to [major, minor, patch]. */
function parseVersion(s: string): [number, number, number] {
  const cleaned = s.replace(/^v/i, '').trim();
  const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isLessThan(a: string, b: string): boolean {
  const [ma, mi, pa] = parseVersion(a);
  const [mb, mj, pb] = parseVersion(b);
  if (ma !== mb) return ma < mb;
  if (mi !== mj) return mi < mj;
  return pa < pb;
}

export const VersionBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');

  const checkVersion = useCallback(async () => {
    try {
      const current = await window.aerocord.app.getVersion();
      setCurrentVersion(current);

      const res = await fetch(GITHUB_LATEST_URL, { headers: { Accept: 'application/vnd.github.v3+json' } });
      if (!res.ok) return;
      const data = await res.json();
      const latest = (data.tag_name as string)?.replace(/^v/i, '') ?? '';
      setLatestVersion(latest);

      if (latest && isLessThan(current, latest)) {
        setVisible(true);
      }
    } catch {
      // Offline or API error — don't show banner
    }
  }, []);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  // if (!visible || dismissed) return null;

  return (
    <div className="version-banner">
      <span className="version-banner-text">
        A new version ({latestVersion || 'latest'}) is available. You're on {currentVersion}.
      </span>
      <button
        type="button"
        className="version-banner-close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <img src={assetUrl('images', 'notification', 'Close.png')} alt="" draggable={false} />
      </button>
    </div>
  );
};
