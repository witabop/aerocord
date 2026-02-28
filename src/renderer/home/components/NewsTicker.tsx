import React, { useState, useCallback, useEffect, useRef } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';

const ANNOUNCEMENTS = [
  { title: 'Aerocord v0.1:', body: 'Welcome to Aerocord! A Discord client inspired by Windows Live Messenger 2009.' },
  { title: 'Tip:', body: 'On a friends user profile popup, you can remove them as a friend by clicking the friend icon!' },
  { title: 'Scenes:', body: 'Customize your look with scenes! Click "Scene" in the bottom bar to change yours.' },
  { title: 'Favorites:', body: 'Right-click any conversation to add it to your Favorites for quick access.' },
];

const ENTRY_INTERVAL_MS = 4000;
const SECTION_SWAP_INTERVAL_MS = 20000;

type NavBtnState = 'default' | 'hover' | 'active';
type Section = 'announcements' | 'whatsnew' | 'banner';

export interface WhatsNewEntry {
  name: string;
  text: string;
}

interface NewsTickerProps {
  visible: boolean;
  /** Friend activity entries for "What's new" (games, status messages). */
  whatsNewEntries?: WhatsNewEntry[];
}

export const NewsTicker: React.FC<NewsTickerProps> = ({ visible, whatsNewEntries = [] }) => {
  const [section, setSection] = useState<Section>('announcements');
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [whatsNewIndex, setWhatsNewIndex] = useState(0);
  const [leftBtn, setLeftBtn] = useState<NavBtnState>('default');
  const [rightBtn, setRightBtn] = useState<NavBtnState>('default');
  const entryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const announcementsCount = ANNOUNCEMENTS.length;
  const whatsNewCount = whatsNewEntries.length > 0 ? whatsNewEntries.length : 1;
  const whatsNewDisplayEntries = whatsNewEntries.length > 0
    ? whatsNewEntries
    : [{ name: '', text: "No friend activity to show right now." }];

  const currentAnnouncement = ANNOUNCEMENTS[announcementIndex];
  const safeWhatsNewIndex = Math.min(whatsNewIndex, whatsNewDisplayEntries.length - 1);
  const currentWhatsNew = whatsNewDisplayEntries[safeWhatsNewIndex] ?? whatsNewDisplayEntries[0];

  // Keep whatsNewIndex in bounds when list length changes
  useEffect(() => {
    if (whatsNewIndex >= whatsNewDisplayEntries.length) {
      setWhatsNewIndex(0);
    }
  }, [whatsNewDisplayEntries.length, whatsNewIndex]);

  // Auto-scroll current section's entries every 4 seconds (skip when showing banner)
  useEffect(() => {
    if (!visible || section === 'banner') return;
    entryTimerRef.current = setInterval(() => {
      if (section === 'announcements') {
        setAnnouncementIndex(prev => (prev + 1) % announcementsCount);
      } else {
        setWhatsNewIndex(prev => (prev + 1) % whatsNewCount);
      }
    }, ENTRY_INTERVAL_MS);
    return () => {
      if (entryTimerRef.current) clearInterval(entryTimerRef.current);
      entryTimerRef.current = null;
    };
  }, [visible, section, announcementsCount, whatsNewCount]);

  // Rotate sections: Announcements -> What's new -> Banner -> Announcements every 20 seconds
  useEffect(() => {
    if (!visible) return;
    sectionTimerRef.current = setInterval(() => {
      setSection(prev => (
        prev === 'announcements' ? 'whatsnew' : prev === 'whatsnew' ? 'banner' : 'announcements'
      ));
    }, SECTION_SWAP_INTERVAL_MS);
    return () => {
      if (sectionTimerRef.current) clearInterval(sectionTimerRef.current);
      sectionTimerRef.current = null;
    };
  }, [visible]);

  const handlePrev = useCallback(() => {
    if (section === 'banner') return;
    if (section === 'announcements') {
      setAnnouncementIndex(prev => (prev - 1 + announcementsCount) % announcementsCount);
    } else {
      setWhatsNewIndex(prev => (prev - 1 + whatsNewCount) % whatsNewCount);
    }
  }, [section, announcementsCount, whatsNewCount]);

  const handleNext = useCallback(() => {
    if (section === 'banner') return;
    if (section === 'announcements') {
      setAnnouncementIndex(prev => (prev + 1) % announcementsCount);
    } else {
      setWhatsNewIndex(prev => (prev + 1) % whatsNewCount);
    }
  }, [section, announcementsCount, whatsNewCount]);

  const leftSrc = leftBtn === 'active' ? 'LeftActive.png' : leftBtn === 'hover' ? 'LeftHover.png' : 'Left.png';
  const rightSrc = rightBtn === 'active' ? 'RightActive.png' : rightBtn === 'hover' ? 'RightHover.png' : 'Right.png';

  if (!visible) return null;

  const title = section === 'announcements' ? 'Announcements' : "What's new";
  const bodyContent = section === 'banner' ? (
    <div className="news-panel-banner-wrap">
      <img
        className="news-panel-banner"
        src={assetUrl('images', 'home', 'wlm09banner.png')}
        alt="Windows Live Messenger"
        draggable={false}
      />
    </div>
  ) : section === 'announcements' ? (
    <>
      <span className="news-item-title">{currentAnnouncement.title}</span>{' '}
      <span className="news-item-body">{currentAnnouncement.body}</span>
    </>
  ) : (
    <>
      {currentWhatsNew?.name && <span className="news-item-title">{currentWhatsNew.name}:</span>}{' '}
      <span className="news-item-body">{currentWhatsNew?.text ?? 'No friend activity to show right now.'}</span>
    </>
  );

  return (
    <div className="news-panel">
      {section !== 'banner' && (
        <div className="news-panel-header">
          <span className="news-panel-title">{title}</span>
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
      )}
      <div className="news-panel-body">
        {bodyContent}
      </div>
    </div>
  );
};
