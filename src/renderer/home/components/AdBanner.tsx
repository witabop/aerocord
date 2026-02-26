import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Ad {
  image: string;
  url: string;
  name: string;
}

const FALLBACK_ADS: Ad[] = [
  { image: '', url: 'https://github.com/not-nullptr/Aerochat', name: 'Aerochat', },
];

interface AdBannerProps {
  visible: boolean;
}

export const AdBanner: React.FC<AdBannerProps> = ({ visible }) => {
  const [ads] = useState<Ad[]>(FALLBACK_ADS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || ads.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % ads.length);
    }, 20000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, ads.length]);

  const handleClick = useCallback(() => {
    const ad = ads[currentIndex];
    if (ad?.url) {
      window.open(ad.url, '_blank');
    }
  }, [ads, currentIndex]);

  const handleSkip = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex(prev => (prev + 1) % ads.length);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % ads.length);
      }, 20000);
    }
  }, [ads.length]);

  if (!visible) return null;

  const currentAd = ads[currentIndex];
  if (!currentAd) return null;

  return (
    <div className="ad-banner no-drag" onClick={handleClick} onContextMenu={handleSkip}>
      {currentAd.image ? (
        <img className="ad-image" src={currentAd.image} alt={currentAd.name} draggable={false} />
      ) : (
        <div className="ad-placeholder">
          <span className="ad-text">Aerocord - Discord reimagined</span>
        </div>
      )}
    </div>
  );
};
