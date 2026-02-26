import React, { useState, useEffect, useCallback } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';

interface GifBoardProps {
  visible: boolean;
  onClose: () => void;
  onSelectGif: (filename: string) => void;
}

/** Placeholder for future: favorite gifs (including external URLs e.g. from chat). Not implemented yet. */
const FAVORITES_PLACEHOLDER = true;

export const GifBoard: React.FC<GifBoardProps> = ({ visible, onClose, onSelectGif }) => {
  const [gifList, setGifList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredFilename, setHoveredFilename] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    window.aerocord.assets
      .listGifs()
      .then((names) => {
        if (!cancelled) setGifList(names);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSelect = useCallback(
    (filename: string) => {
      onSelectGif(filename);
      onClose();
    },
    [onSelectGif, onClose]
  );

  if (!visible) return null;

  return (
    <>
      <div className="gif-board-overlay" onClick={onClose} />
      <div className="gif-board">
        <div className="gif-board-header">
          <span className="gif-board-title">GIFs</span>
        </div>

        {FAVORITES_PLACEHOLDER && (
          <div className="gif-board-favorites">
            <span className="gif-board-favorites-label">Favorites</span>
            <div className="gif-board-favorites-placeholder">
              {/* Room for future: e.g. right‑click a gif in chat to add here; supports external URLs. */}
            </div>
          </div>
        )}

        <div className="gif-board-grid">
          {loading ? (
            <div className="gif-board-loading">Loading…</div>
          ) : (
            gifList.map((filename) => (
              <button
                key={filename}
                type="button"
                className="gif-board-item"
                onClick={() => handleSelect(filename)}
                onMouseEnter={() => setHoveredFilename(filename)}
                onMouseLeave={() => setHoveredFilename(null)}
                title={filename}
              >
                <img
                  src={assetUrl('gifs', filename)}
                  alt=""
                  draggable={false}
                />
              </button>
            ))
          )}
        </div>
        <div className="gif-board-status">{hoveredFilename ?? '\u00A0'}</div>
      </div>
    </>
  );
};
