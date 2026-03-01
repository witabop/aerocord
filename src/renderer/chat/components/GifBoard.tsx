import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { FavoriteGifEntry } from '../../shared/types';

const LOCAL_PREFIX = 'local:';
const STAR_ICON = assetUrl('images', 'emoji', 'Star.png');

function getFavoriteSendId(entry: FavoriteGifEntry): string {
  return typeof entry === 'object' ? entry.link : entry;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || /media\.tenor\.com|media\.giphy\.com.*\.mp4/i.test(url);
}

function entryMatchesId(entry: FavoriteGifEntry, id: string): boolean {
  if (entry === id) return true;
  if (typeof entry === 'object') return entry.link === id || entry.displayUrl === id;
  return false;
}

interface GifBoardProps {
  visible: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** id is either "gifs/filename" (local) or a URL (web/favorites) */
  onSelectGif: (id: string) => void;
}

type Tab = 'local' | 'web' | 'favorites';

interface KlipyGif {
  id: string;
  url: string;
  fullUrl?: string;
}

export const GifBoard: React.FC<GifBoardProps> = ({ visible, anchorRef, onClose, onSelectGif }) => {
  const [tab, setTab] = useState<Tab>('local');
  const [gifList, setGifList] = useState<string[]>([]);
  const [webGifs, setWebGifs] = useState<KlipyGif[]>([]);
  const [webQuery, setWebQuery] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [favoriteUrls, setFavoriteUrls] = useState<FavoriteGifEntry[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [webHasKeys, setWebHasKeys] = useState<boolean>(true);
  const [position, setPosition] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });

  useLayoutEffect(() => {
    if (!visible || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      bottom: window.innerHeight - rect.top,
      left: rect.left,
    });
  }, [visible, anchorRef]);

  const loadSettings = useCallback(async () => {
    const s = await window.aerocord.settings.get();
    setFavoriteUrls(s.favoriteGifUrls ?? []);
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadSettings();
  }, [visible, loadSettings]);

  useEffect(() => {
    if (!visible || tab !== 'local') return;
    let cancelled = false;
    setLocalLoading(true);
    window.aerocord.assets
      .listGifs()
      .then((names) => {
        if (!cancelled) setGifList(names);
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tab]);

  useEffect(() => {
    if (!visible || tab !== 'web') return;
    let cancelled = false;
    window.aerocord.gifs.hasKeys().then((ok: boolean) => {
      if (!cancelled) setWebHasKeys(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tab]);

  useEffect(() => {
    if (!visible || tab !== 'web') return;
    let cancelled = false;
    setWebLoading(true);
    window.aerocord.gifs
      .fetchTrending(100)
      .then((list) => {
        if (!cancelled) setWebGifs(list);
      })
      .finally(() => {
        if (!cancelled) setWebLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tab]);

  const runWebSearch = useCallback(() => {
    const q = webQuery.trim();
    if (!q) return;
    let cancelled = false;
    setWebLoading(true);
    window.aerocord.gifs.search(q, 100).then((list) => {
      if (!cancelled) setWebGifs(list);
    }).finally(() => {
      if (!cancelled) setWebLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [webQuery]);

  const isFavorite = useCallback(
    (id: string) => favoriteUrls.some((e) => entryMatchesId(e, id)),
    [favoriteUrls]
  );

  const toggleFavorite = useCallback(
    async (id: string, e: React.MouseEvent, entryToAdd?: FavoriteGifEntry) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = favoriteUrls.findIndex((e) => entryMatchesId(e, id));
      const list = favoriteUrls.slice();
      if (idx >= 0) list.splice(idx, 1);
      else if (entryToAdd !== undefined) list.push(entryToAdd);
      else list.push(id);
      setFavoriteUrls(list);
      await window.aerocord.settings.update({ favoriteGifUrls: list });
    },
    [favoriteUrls]
  );

  const handleSelect = useCallback(
    (idOrEntry: string | FavoriteGifEntry) => {
      const sendId =
        typeof idOrEntry === 'object'
          ? idOrEntry.link
          : idOrEntry.startsWith(LOCAL_PREFIX)
            ? idOrEntry.slice(LOCAL_PREFIX.length)
            : idOrEntry;
      onSelectGif(sendId);
      onClose();
    },
    [onSelectGif, onClose]
  );

  if (!visible) return null;

  const favoritesList = favoriteUrls;

  const content = (
    <>
      <div className="gif-board-overlay gif-board-portal-layer" onClick={onClose} />
      <div className="gif-board-portal-anchor" style={{ bottom: position.bottom, left: position.left }}>
        <div className="gif-board">
        <div className="gif-board-header">
          <span className="gif-board-title">GIFs</span>
          <div className="gif-board-tabs">
            <button
              type="button"
              className={'gif-board-tab' + (tab === 'local' ? ' gif-board-tab-active' : '')}
              onClick={() => setTab('local')}
            >
              Local
            </button>
            <button
              type="button"
              className={'gif-board-tab' + (tab === 'web' ? ' gif-board-tab-active' : '')}
              onClick={() => setTab('web')}
            >
              Web
            </button>
            <button
              type="button"
              className={'gif-board-tab' + (tab === 'favorites' ? ' gif-board-tab-active' : '')}
              onClick={() => setTab('favorites')}
            >
              Favorites
            </button>
          </div>
        </div>

        {tab === 'web' && (
          <div className="gif-board-web-search">
            <input
              type="text"
              className="gif-board-search-input"
              placeholder="Search GIFs…"
              value={webQuery}
              onChange={(e) => setWebQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runWebSearch()}
            />
            <button type="button" className="gif-board-search-btn" onClick={runWebSearch}>
              Search
            </button>
          </div>
        )}

        <div className={'gif-board-grid' + (tab === 'favorites' ? ' gif-board-grid-favorites' : '')}>
          {tab === 'local' && (
            localLoading ? (
              <div className="gif-board-loading">Loading…</div>
            ) : (
              gifList.map((filename) => {
                const id = `${LOCAL_PREFIX}gifs/${filename}`;
                const isFav = isFavorite(id);
                return (
                  <div
                    key={id}
                    className="gif-board-item-wrap"
                    onMouseEnter={() => setHoveredId(id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      type="button"
                      className="gif-board-item"
                      onClick={() => handleSelect(id)}
                      title={filename}
                    >
                      <img src={assetUrl('gifs', filename)} alt="" draggable={false} />
                    </button>
                    <button
                      type="button"
                      className={'gif-board-fav-star' + (isFav ? ' gif-board-fav-star-on' : '')}
                      style={{ opacity: hoveredId === id ? 1 : 0 }}
                      onClick={(e) => toggleFavorite(id, e)}
                      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <img src={STAR_ICON} alt="" />
                    </button>
                  </div>
                );
              })
            )
          )}

          {tab === 'web' && (
            webLoading ? (
              <div className="gif-board-loading">Loading…</div>
            ) : !webHasKeys ? (
              <div className="gif-board-loading">
                Add KLIPY_API_KEY_1, KLIPY_API_KEY_2, KLIPY_API_KEY_3 to a .env file in the project root, then restart the app.
              </div>
            ) : (
              webGifs.map((g) => {
                const id = g.fullUrl ?? g.url;
                const isFav = isFavorite(id);
                return (
                  <div
                    key={g.id}
                    className="gif-board-item-wrap"
                    onMouseEnter={() => setHoveredId(id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      type="button"
                      className="gif-board-item"
                      onClick={() => handleSelect(id)}
                    >
                      <img src={g.url} alt="" draggable={false} />
                    </button>
                    <button
                      type="button"
                      className={'gif-board-fav-star' + (isFav ? ' gif-board-fav-star-on' : '')}
                      style={{ opacity: hoveredId === id ? 1 : 0 }}
                      onClick={(e) => toggleFavorite(id, e)}
                      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <img src={STAR_ICON} alt="" />
                    </button>
                  </div>
                );
              })
            )
          )}

          {tab === 'favorites' && (
            favoritesList.length === 0 ? (
              <div className="gif-board-loading">No favorites yet. Hover a GIF and click the star.</div>
            ) : (
              favoritesList.map((entry) => {
                const sendId = getFavoriteSendId(entry);
                const displayUrl = typeof entry === 'object' ? entry.displayUrl : entry;
                const isLocal = typeof entry === 'string' && entry.startsWith(LOCAL_PREFIX);
                const src = isLocal ? assetUrl(...(entry as string).slice(LOCAL_PREFIX.length).split('/')) : displayUrl;
                const isVideo = !isLocal && isVideoUrl(displayUrl);
                return (
                  <div
                    key={sendId}
                    className="gif-board-item-wrap"
                    onMouseEnter={() => setHoveredId(sendId)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      type="button"
                      className="gif-board-item"
                      onClick={() => handleSelect(entry)}
                    >
                      {isVideo ? (
                        <video src={src} autoPlay loop muted playsInline draggable={false} />
                      ) : (
                        <img src={src} alt="" draggable={false} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="gif-board-fav-star gif-board-fav-star-on"
                      style={{ opacity: hoveredId === sendId ? 1 : 0 }}
                      onClick={(e) => toggleFavorite(sendId, e)}
                      aria-label="Remove from favorites"
                    >
                      <img src={STAR_ICON} alt="" />
                    </button>
                  </div>
                );
              })
            )
          )}
        </div>
        <div className="gif-board-status">{hoveredId ?? '\u00A0'}</div>
      </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
};
