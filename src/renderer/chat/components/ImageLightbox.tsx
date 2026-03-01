import React, { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../shared/hooks/useAssets';
import './ImageLightbox.css';

interface ImageLightboxProps {
  imageUrl: string;
  isVideo?: boolean;
  onClose: () => void;
}

/** Returns true if the URL can be opened in the system browser (http/https). */
function isOpenableInBrowser(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, isVideo, onClose }) => {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleOpenInBrowser = useCallback(() => {
    if (!isOpenableInBrowser(imageUrl)) return;
    window.aerocord.shell.openExternal(imageUrl);
  }, [imageUrl]);

  const canOpenInBrowser = isOpenableInBrowser(imageUrl);
  const [closeHover, setCloseHover] = useState(false);
  const [closeActive, setCloseActive] = useState(false);
  const [openHover, setOpenHover] = useState(false);
  const [openActive, setOpenActive] = useState(false);

  const closeIcon = closeActive ? 'CaptionActive.png' : closeHover ? 'CaptionHover.png' : 'CaptionClose.png';
  const openIcon = openActive ? 'OpenActive.png' : openHover ? 'OpenHover.png' : 'Open.png';

  const lightboxContent = (
    <div className="image-lightbox-overlay" onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Image preview">
      <div className="image-lightbox-window">
        <button
          type="button"
          className="image-lightbox-close"
          onClick={onClose}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => { setCloseHover(false); setCloseActive(false); }}
          onMouseDown={() => setCloseActive(true)}
          onMouseUp={() => setCloseActive(false)}
          aria-label="Close"
          title="Close"
        >
          <img src={assetUrl('images', 'imagepreviewer', closeIcon)} alt="" width={28} height={17} draggable={false} />
        </button>
        <div className="image-lightbox-content">
          {isVideo ? (
            <video
              src={imageUrl}
              className="image-lightbox-img"
              autoPlay
              loop
              muted
              playsInline
              controls
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img src={imageUrl} alt="" className="image-lightbox-img" draggable={false} onClick={(e) => e.stopPropagation()} />
          )}
        </div>
        <div className="image-lightbox-bar">
          {canOpenInBrowser && (
            <button
              type="button"
              className="image-lightbox-open-browser"
              onClick={handleOpenInBrowser}
              onMouseEnter={() => setOpenHover(true)}
              onMouseLeave={() => { setOpenHover(false); setOpenActive(false); }}
              onMouseDown={() => setOpenActive(true)}
              onMouseUp={() => setOpenActive(false)}
              title="Open in browser"
              aria-label="Open in browser"
            >
              <img src={assetUrl('images', 'imagepreviewer', openIcon)} alt="" width={20} height={19} draggable={false} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return createPortal(lightboxContent, document.body);
};
