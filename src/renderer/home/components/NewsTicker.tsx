import React, { useState, useCallback } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';

const NEWS_ITEMS = [
  { title: 'Aerocord v1.0:', body: 'Welcome to Aerocord! A Discord client inspired by Windows Live Messenger 2009.' },
  { title: 'Tip:', body: 'Double-click a contact to open a chat window. Type [nudge] to send a nudge!' },
  { title: 'Voice Chat:', body: 'Voice chat is available in server voice channels. Join from the channel sidebar.' },
  { title: 'Scenes:', body: 'Customize your look with scenes! Click "Scene" in the bottom bar to change yours.' },
  { title: 'Favorites:', body: 'Right-click any conversation to add it to your Favorites for quick access.' },
];

type NavBtnState = 'default' | 'hover' | 'active';

interface NewsTickerProps {
  visible: boolean;
}

export const NewsTicker: React.FC<NewsTickerProps> = ({ visible }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [leftBtn, setLeftBtn] = useState<NavBtnState>('default');
  const [rightBtn, setRightBtn] = useState<NavBtnState>('default');

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + NEWS_ITEMS.length) % NEWS_ITEMS.length);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % NEWS_ITEMS.length);
  }, []);

  const leftSrc = leftBtn === 'active' ? 'LeftActive.png' : leftBtn === 'hover' ? 'LeftHover.png' : 'Left.png';
  const rightSrc = rightBtn === 'active' ? 'RightActive.png' : rightBtn === 'hover' ? 'RightHover.png' : 'Right.png';

  if (!visible) return null;

  const item = NEWS_ITEMS[currentIndex];

  return (
    <div className="news-panel">
      <div className="news-panel-header">
        <span className="news-panel-title">What's new</span>
        <div className="news-panel-nav">
          <button
            className="news-nav-btn news-nav-btn-img"
            onClick={handlePrev}
            onMouseEnter={() => setLeftBtn('hover')}
            onMouseLeave={() => setLeftBtn('default')}
            onMouseDown={() => setLeftBtn('active')}
            onMouseUp={() => setLeftBtn('hover')}
          >
            <img src={assetUrl('images', 'home', leftSrc)} alt="Previous" draggable={false} />
          </button>
          <button
            className="news-nav-btn news-nav-btn-img"
            onClick={handleNext}
            onMouseEnter={() => setRightBtn('hover')}
            onMouseLeave={() => setRightBtn('default')}
            onMouseDown={() => setRightBtn('active')}
            onMouseUp={() => setRightBtn('hover')}
          >
            <img src={assetUrl('images', 'home', rightSrc)} alt="Next" draggable={false} />
          </button>
        </div>
      </div>
      <div className="news-panel-body">
        <span className="news-item-title">{item.title}</span>{' '}
        <span className="news-item-body">{item.body}</span>
      </div>
    </div>
  );
};
