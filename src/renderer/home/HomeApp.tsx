import React, { useState, useEffect, useCallback } from 'react';
import { useIPCEvent } from '../shared/hooks/useIPC';
import { ContactList } from './components/ContactList';
import { UserProfile } from './components/UserProfile';
import { NewsTicker } from './components/NewsTicker';
import { ScenePicker } from './components/ScenePicker';
import { AddFriendPopup } from './components/AddFriendPopup';
import { assetUrl } from '../shared/hooks/useAssets';
import { playSound } from '../shared/utils/sounds';
import type { UserVM, HomeListCategoryVM, HomeListItemVM, SceneVM, SettingsData } from '../shared/types';
import './home.css';

function computeTextColors(hex: string): { textColor: string; shadowColor: string } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const isLight = r * 0.299 + g * 0.587 + b * 0.114 > 140;
  return {
    textColor: isLight ? '#1a1a1a' : '#ffffff',
    shadowColor: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
  };
}

export const HomeApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserVM | null>(null);
  const [conversations, setConversations] = useState<HomeListItemVM[]>([]);
  const [serverCategories, setServerCategories] = useState<HomeListCategoryVM[]>([]);
  const [scene, setScene] = useState<SceneVM | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<HomeListItemVM[]>([]);
  const [notifiedChannels, setNotifiedChannels] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [user, channels, guilds, currentScene, appSettings, favIds, pending] = await Promise.all([
      window.aerocord.user.getCurrent(),
      window.aerocord.contacts.getPrivateChannels(),
      window.aerocord.contacts.getGuilds(),
      window.aerocord.theme.getCurrent(),
      window.aerocord.settings.get(),
      window.aerocord.contacts.getFavorites(),
      window.aerocord.contacts.getPendingRequests(),
    ]);
    setCurrentUser(user);
    setConversations(channels);
    setServerCategories(guilds);
    setScene(currentScene);
    setSettings(appSettings as SettingsData);
    setFavoriteIds(new Set(favIds));
    setPendingRequests(pending);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useIPCEvent('event:ready', () => { loadData(); });

  useIPCEvent('event:presenceUpdate', (data: unknown) => {
    const { userId, presence } = data as { userId: string; presence: any };
    setConversations(prev => prev.map(c => {
      if (c.recipientId === userId) return { ...c, presence };
      return c;
    }));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, presence } : prev);
    }
  });

  useIPCEvent('event:messageCreate', (data: unknown) => {
    const msg = data as { channelId?: string; author?: { id?: string } };
    if (msg.channelId && msg.author?.id !== currentUser?.id) {
      setNotifiedChannels(prev => new Set(prev).add(msg.channelId!));
    }
    window.aerocord.contacts.getPrivateChannels().then(setConversations);
    window.aerocord.contacts.getPendingRequests().then(setPendingRequests);
  });

  useIPCEvent('event:channelCreate', () => {
    window.aerocord.contacts.getPrivateChannels().then(setConversations);
  });

  useIPCEvent('event:channelDelete', () => {
    window.aerocord.contacts.getPrivateChannels().then(setConversations);
  });

  useIPCEvent('play-sound', (name: unknown) => {
    if (typeof name === 'string') playSound(name);
  });

  const handleOpenChat = useCallback((channelId: string) => {
    setNotifiedChannels(prev => {
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
    window.aerocord.windows.openChat(channelId);
  }, []);

  const handleStatusChange = useCallback(async (status: string) => {
    await window.aerocord.user.setStatus(status);
    const user = await window.aerocord.user.getCurrent();
    setCurrentUser(user);
  }, []);

  const handleCustomStatusChange = useCallback(async (text: string | null) => {
    await window.aerocord.user.setCustomStatus(text);
    const user = await window.aerocord.user.getCurrent();
    setCurrentUser(user);
  }, []);

  const handleSignOut = useCallback(async () => {
    await window.aerocord.auth.logout();
    window.aerocord.windows.close();
  }, []);

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const handleSceneChange = useCallback((newScene: SceneVM) => {
    setScene(newScene);
    setShowScenePicker(false);
  }, []);

  const handleToggleFavorite = useCallback(async (channelId: string, add: boolean) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (add) next.add(channelId);
      else next.delete(channelId);
      window.aerocord.contacts.setFavorites(Array.from(next));
      return next;
    });
  }, []);

  const allItems = [
    ...conversations,
    ...serverCategories.flatMap(c => c.items),
  ];

  const favoriteItems = allItems.filter(i => favoriteIds.has(i.id));

  const filteredConversations = searchText
    ? conversations.filter(c =>
        c.name.toLowerCase().includes(searchText.toLowerCase())
      )
    : conversations;

  const filteredServers = searchText
    ? serverCategories.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          item.name.toLowerCase().includes(searchText.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : serverCategories;

  const computed = scene ? computeTextColors(scene.color) : { textColor: '#1a1a1a', shadowColor: 'rgba(255,255,255,0.7)' };
  const sceneStyle: React.CSSProperties = scene ? {
    '--scene-color': scene.color,
    '--scene-text-color': computed.textColor,
    '--scene-shadow-color': computed.shadowColor,
  } as React.CSSProperties : {};

  const showNews = settings?.displayHomeNews ?? true;

  const sceneBgUrl = scene?.file ? assetUrl('scenes', scene.file) : '';

  return (
    <div className="wlm-window home-window" style={sceneStyle}>
      <div className="home-scene-area">
        {sceneBgUrl && (
          <img className="scene-bg-image" src={sceneBgUrl} alt="" draggable={false} />
        )}
        <UserProfile
          user={currentUser}
          scene={scene}
          onStatusChange={handleStatusChange}
          onCustomStatusChange={handleCustomStatusChange}
          onSignOut={handleSignOut}
          onOpenSettings={() => window.aerocord.windows.openSettings()}
        />
        <div className="home-scene-gradient">
          <div className="home-search no-drag">
            <div className="search-bar-wrapper">
              <input
                type="text"
                className="wlm-input search-input"
                placeholder="Search contacts or the web..."
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
              />
              <img
                className="search-icon"
                src={assetUrl('images', 'home', searchText ? 'SearchIconBlue.png' : 'SearchIconGray.png')}
                alt=""
                draggable={false}
              />
            </div>
            <div className="search-toolbar">
              <button className="search-toolbar-btn" title="Add a contact" onClick={() => setShowAddFriend(true)}>
                <img src={assetUrl('images', 'home', 'AddFriend.png')} alt="" draggable={false} />
              </button>
              <button className="search-toolbar-btn" title="Change display layout">
                <img src={assetUrl('images', 'home', 'ChangeLayout.png')} alt="" draggable={false} />
              </button>
              <button className="search-toolbar-btn" title="Show menu">
                <img src={assetUrl('images', 'home', 'ShowMenu.png')} alt="" draggable={false} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="home-contact-area">
        {favoriteItems.length > 0 && (
          <ContactList
            title="Favorites"
            items={favoriteItems}
            onDoubleClick={handleOpenChat}
            icon={assetUrl('images', 'home', 'favorites.png')}
            onToggleFavorite={handleToggleFavorite}
            favoriteIds={favoriteIds}
            notifiedIds={notifiedChannels}
          />
        )}

        {pendingRequests.length > 0 && (
          <ContactList
            title="Friend Requests"
            items={pendingRequests}
            onDoubleClick={handleOpenChat}
            icon={assetUrl('images', 'home', 'AddFriend.png')}
            hideFavOption
          />
        )}

        <ContactList
          title="Conversations"
          items={filteredConversations}
          onDoubleClick={handleOpenChat}
          onToggleFavorite={handleToggleFavorite}
          favoriteIds={favoriteIds}
          notifiedIds={notifiedChannels}
        />
        {filteredServers.map((cat, i) => (
          <ContactList
            key={`server-${i}`}
            title={cat.name}
            items={cat.items}
            onDoubleClick={handleOpenChat}
            defaultCollapsed={cat.collapsed}
            onToggleFavorite={handleToggleFavorite}
            favoriteIds={favoriteIds}
            notifiedIds={notifiedChannels}
          />
        ))}
      </div>

      <NewsTicker visible={showNews} />

      <div className="home-bottom-bar">
        <button className="wlm-toolbar-item no-drag" onClick={() => setShowScenePicker(true)}>
          Scene
        </button>
        <button className="wlm-toolbar-item no-drag" onClick={() => window.aerocord.windows.openSettings()}>
          Options
        </button>
        <div style={{ flex: 1 }} />
        <button className="wlm-toolbar-item no-drag" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      <ScenePicker
        visible={showScenePicker}
        onClose={() => setShowScenePicker(false)}
        onSceneChange={handleSceneChange}
      />

      <AddFriendPopup
        visible={showAddFriend}
        onClose={() => setShowAddFriend(false)}
      />
    </div>
  );
};
