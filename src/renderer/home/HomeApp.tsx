import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useIPCEvent } from '../shared/hooks/useIPC';
import { ContactList } from './components/ContactList';
import { UserProfile } from './components/UserProfile';
import { NewsTicker, type WhatsNewEntry } from './components/NewsTicker';
import { VersionBanner } from './components/VersionBanner';
import { ScenePicker } from './components/ScenePicker';
import { AddFriendPopup } from './components/AddFriendPopup';
import { assetUrl } from '../shared/hooks/useAssets';
import { playSound } from '../shared/utils/sounds';
import { computeTextColors } from '../shared/utils/colors';
import type { UserVM, HomeListCategoryVM, HomeListItemVM, SceneVM, SettingsData } from '../shared/types';
import './home.css';

/**
 * When we refetch private channels (e.g. after messageCreate), the API returns Offline
 * for users we just unfriended because Discord stops sending their presence. Merge
 * so we keep the previous non-Offline presence for DMs instead of overwriting with Offline.
 *
 * Also preserves conversations from prev that are missing in next. discord.py-self's
 * internal private_channels cache can drop DM channels after voice disconnects or
 * call lifecycle events; without this, those conversations silently vanish until a
 * new message arrives.
 */
function mergeConversationsPresence(
  prev: HomeListItemVM[],
  next: HomeListItemVM[],
): HomeListItemVM[] {
  const nextIds = new Set(next.map((n) => n.id));

  const merged = next.map((nextItem) => {
    if (!nextItem.recipientId) return nextItem;
    const newStatus = (nextItem.presence?.status ?? '').toString().toLowerCase();
    if (newStatus !== 'offline') return nextItem;
    const prevItem = prev.find((p) => p.id === nextItem.id);
    if (!prevItem?.presence?.status) return nextItem;
    const prevStatus = (prevItem.presence.status ?? '').toString().toLowerCase();
    if (prevStatus === 'offline') return nextItem;
    return { ...nextItem, presence: prevItem.presence };
  });

  for (const prevItem of prev) {
    if (!nextIds.has(prevItem.id)) {
      merged.push(prevItem);
    }
  }

  return merged;
}

export const HomeApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserVM | null>(null);
  const [conversations, setConversations] = useState<HomeListItemVM[]>([]);
  const [serverCategories, setServerCategories] = useState<HomeListCategoryVM[]>([]);
  const [scene, setScene] = useState<SceneVM | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  type CornerPhase = 'idle' | 'open' | 'closing';
  const [cornerPhase, setCornerPhase] = useState<CornerPhase>('idle');
  const [openHeld, setOpenHeld] = useState(false);
  const cornerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openHeldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<HomeListItemVM[]>([]);
  const [notifiedChannels, setNotifiedChannels] = useState<Set<string>>(new Set());
  const recentlyUnfriendedRef = useRef<Set<string>>(new Set());
  const previousPendingIdsRef = useRef<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [user, channels, guilds, currentScene, appSettings, favIds, friends, pending] = await Promise.all([
      window.aerocord.user.getCurrent(),
      window.aerocord.contacts.getPrivateChannels(),
      window.aerocord.contacts.getGuilds(),
      window.aerocord.theme.getCurrent(),
      window.aerocord.settings.get(),
      window.aerocord.contacts.getFavorites(),
      window.aerocord.contacts.getFriends(),
      window.aerocord.contacts.getPendingRequests(),
    ]);
    setCurrentUser(user);
    setConversations((prev) => mergeConversationsPresence(prev, channels));
    setServerCategories(guilds);
    setScene(currentScene);
    setSettings(appSettings as SettingsData);
    setFavoriteIds(new Set(favIds));
    setFriendIds(new Set(friends));
    setPendingRequests(pending);
    previousPendingIdsRef.current = new Set(pending.map((p) => p.id));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useIPCEvent('event:ready', () => { loadData(); });

  useIPCEvent('event:presenceUpdate', (data: unknown) => {
    const { userId, presence, name, avatar } = data as { userId: string; presence: any; name?: string; avatar?: string };
    const status = presence?.status;
    const isOffline = status === 'Offline' || status === 'offline';
    const justUnfriended = recentlyUnfriendedRef.current.has(userId);
    if (isOffline && justUnfriended) {
      return;
    }
    setConversations(prev => prev.map(c => {
      if (c.recipientId !== userId) return c;
      const updates: Partial<typeof c> = { presence };
      if (name) updates.name = name;
      if (avatar) updates.image = avatar;
      return { ...c, ...updates };
    }));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, presence } : prev);
    }
  });

  useIPCEvent('event:messageCreate', (data: unknown) => {
    const msg = data as { channelId?: string; author?: { id?: string }; mentionsSelf?: boolean; isDirectMessage?: boolean; notifyEntryId?: string; notifyEntryOpen?: boolean };
    const fromOther = msg.author?.id !== currentUser?.id;
    const entryId = msg.notifyEntryId ?? msg.channelId;
    const shouldNotify =
      fromOther &&
      entryId &&
      !msg.notifyEntryOpen &&
      (msg.mentionsSelf || msg.isDirectMessage);
    if (shouldNotify) {
      setNotifiedChannels(prev => new Set(prev).add(entryId!));
    }
    window.aerocord.contacts.getPrivateChannels().then((channels) =>
      setConversations((prev) => mergeConversationsPresence(prev, channels)),
    );
    window.aerocord.contacts.getPendingRequests().then(setPendingRequests);
  });

  useIPCEvent('event:chatOpened', (data: unknown) => {
    const { notifyEntryId } = data as { notifyEntryId?: string };
    if (notifyEntryId) {
      setNotifiedChannels(prev => {
        const next = new Set(prev);
        next.delete(notifyEntryId);
        return next;
      });
    }
  });

  useIPCEvent('event:channelCreate', () => {
    window.aerocord.contacts.getPrivateChannels().then((channels) =>
      setConversations((prev) => mergeConversationsPresence(prev, channels)),
    );
  });

  useIPCEvent('event:channelDelete', () => {
    window.aerocord.contacts.getPrivateChannels().then((channels) =>
      setConversations((prev) => mergeConversationsPresence(prev, channels)),
    );
  });

  useIPCEvent('event:relationshipChange', () => {
    window.aerocord.contacts.getPendingRequests().then((pending) => {
      const prevIds = previousPendingIdsRef.current;
      const currentIds = new Set(pending.map((p) => p.id));
      const newRequests = pending.filter((p) => !prevIds.has(p.id));
      previousPendingIdsRef.current = currentIds;
      setPendingRequests(pending);

      if (newRequests.length > 0) {
        playSound('newalert.wav');
        window.aerocord.theme.getCurrent().then((currentScene) => {
          const scene = currentScene ? { id: currentScene.id, file: currentScene.file, displayName: currentScene.displayName, color: currentScene.color, isDefault: currentScene.isDefault, textColor: currentScene.textColor, shadowColor: currentScene.shadowColor } : undefined;
          newRequests.forEach((item) => {
            window.aerocord.windows.openNotification({
              type: 'friendRequest',
              user: { id: item.id, name: item.name, username: item.name, avatar: item.image ?? '', presence: item.presence },
              scene,
            });
          });
        });
      }
    });
    window.aerocord.contacts.getFriends().then(friends => setFriendIds(new Set(friends)));
  });

  useIPCEvent('event:sceneChange', (data: unknown) => {
    setScene(data as SceneVM);
  });

  useIPCEvent('play-sound', (name: unknown) => {
    if (typeof name === 'string') playSound(name);
  });

  useIPCEvent('call:incoming', (data: unknown) => {
    const { channelId } = data as { channelId: string; callerId: string };
    window.aerocord.windows.openChat(channelId);
  });

  const handleOpenChat = useCallback((channelId: string, guildId?: string) => {
    if (guildId) {
      window.aerocord.settings.get().then((s) => {
        const sel = s.selectedChannels ?? {};
        const toOpen = sel[guildId] || channelId;
        setNotifiedChannels(prev => {
          const next = new Set(prev);
          next.delete(toOpen);
          return next;
        });
        window.aerocord.windows.openChat(toOpen);
      }).catch(() => {
        setNotifiedChannels(prev => { const next = new Set(prev); next.delete(channelId); return next; });
        window.aerocord.windows.openChat(channelId);
      });
      return;
    }
    setNotifiedChannels(prev => {
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
    window.aerocord.windows.openChat(channelId);
  }, []);

  /** For friend-request list: item.id is userId; create or get DM then open chat. */
  const handleOpenChatForUser = useCallback(async (userId: string) => {
    try {
      const channelId = await window.aerocord.channels.getOrCreateDM(userId);
      setNotifiedChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
      window.aerocord.windows.openChat(channelId);
    } catch {
      // e.g. Not connected or API error
    }
  }, []);

  const handleAcceptFriendRequest = useCallback(async (userId: string) => {
    const result = await window.aerocord.contacts.acceptFriendRequest(userId);
    if (result.success) {
      window.aerocord.contacts.getPendingRequests().then(setPendingRequests);
      window.aerocord.contacts.getPrivateChannels().then((channels) =>
        setConversations((prev) => mergeConversationsPresence(prev, channels)),
      );
    }
  }, []);

  const handleIgnoreFriendRequest = useCallback(async (userId: string) => {
    const result = await window.aerocord.contacts.ignoreFriendRequest(userId);
    if (result.success) {
      window.aerocord.contacts.getPendingRequests().then(setPendingRequests);
    }
  }, []);

  const handleStatusChange = useCallback(async (status: string) => {
    await window.aerocord.user.setStatus(status);
    // Do not call getCurrent() here: main already broadcasts event:presenceUpdate with the new status.
    // Calling getCurrent() can return stale presence from the bridge cache and overwrite the ring by one step.
  }, []);

  const handleCustomStatusChange = useCallback(async (text: string | null) => {
    await window.aerocord.user.setCustomStatus(text);
    // Optimistic update so status text is not delayed by one entry (getCurrent can return stale cache)
    setCurrentUser((prev) => (prev && prev.presence ? { ...prev, presence: { ...prev.presence, customStatus: text ?? undefined } } : prev));
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

  const handleCloseConversation = useCallback(async (channelId: string) => {
    const result = await window.aerocord.channels.closeConversation(channelId);
    if (result.success) {
      // Remove from state first so mergeConversationsPresence won't re-add it
      // from prev (the merge now preserves prev items missing in next).
      setConversations((prev) => prev.filter((c) => c.id !== channelId));
      window.aerocord.contacts.getPrivateChannels().then((channels) =>
        setConversations((prev) => mergeConversationsPresence(prev, channels)),
      );
      setFavoriteIds(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        window.aerocord.contacts.setFavorites(Array.from(next));
        return next;
      });
    }
  }, []);

  const handleRemoveFriend = useCallback(async (targetUserId: string) => {
    recentlyUnfriendedRef.current.add(targetUserId);
    const clearAt = setTimeout(() => {
      recentlyUnfriendedRef.current.delete(targetUserId);
    }, 8000);
    const result = await window.aerocord.contacts.removeFriend(targetUserId);
    if (result?.success) {
      window.aerocord.contacts.getFriends().then(friends => setFriendIds(new Set(friends)));
    } else {
      recentlyUnfriendedRef.current.delete(targetUserId);
      clearTimeout(clearAt);
    }
  }, []);

  const allItems = useMemo(() => [
    ...conversations,
    ...serverCategories.flatMap(c => c.items),
  ], [conversations, serverCategories]);

  const favoriteItems = useMemo(
    () => allItems.filter(i => favoriteIds.has(i.id)),
    [allItems, favoriteIds],
  );

  const searchLower = useMemo(() => searchText.toLowerCase(), [searchText]);

  const filteredConversations = useMemo(
    () => searchText
      ? conversations.filter(c => c.name.toLowerCase().includes(searchLower))
      : conversations,
    [conversations, searchText, searchLower],
  );

  const filteredServers = useMemo(
    () => searchText
      ? serverCategories
          .map(cat => ({
            ...cat,
            items: cat.items.filter(item => item.name.toLowerCase().includes(searchLower)),
          }))
          .filter(cat => cat.items.length > 0)
      : serverCategories,
    [serverCategories, searchText, searchLower],
  );

  const whatsNewEntries = useMemo((): WhatsNewEntry[] => {
    return conversations
      .filter(c => !c.isGroupChat && (c.presence?.presence || c.presence?.customStatus))
      .map(c => ({
        name: c.name,
        text: (c.presence!.customStatus || c.presence!.presence || '').trim() || `${c.presence?.status ?? 'Offline'}`,
      }));
  }, [conversations]);

  const sceneStyle = useMemo((): React.CSSProperties => {
    if (!scene) return {};
    const computed = computeTextColors(scene.color);
    return {
      '--scene-color': scene.color,
      '--scene-text-color': computed.textColor,
      '--scene-shadow-color': computed.shadowColor,
    } as React.CSSProperties;
  }, [scene]);

  const showNews = settings?.displayHomeNews ?? true;

  const sceneBgUrl = useMemo(
    () => scene?.file ? assetUrl('scenes', scene.file) : '',
    [scene?.file],
  );

  const PAGEOPEN_GIF_DURATION_MS = 1200;
  const PAGECLOSE_GIF_DURATION_MS = 1000;

  const handleCornerMouseEnter = useCallback(() => {
    if (cornerCloseTimerRef.current) {
      clearTimeout(cornerCloseTimerRef.current);
      cornerCloseTimerRef.current = null;
    }
    setOpenHeld(false);
    setCornerPhase('open');
    openHeldTimerRef.current = setTimeout(() => {
      setOpenHeld(true);
      openHeldTimerRef.current = null;
    }, PAGEOPEN_GIF_DURATION_MS);
  }, []);

  const handleCornerMouseLeave = useCallback(() => {
    if (openHeldTimerRef.current) {
      clearTimeout(openHeldTimerRef.current);
      openHeldTimerRef.current = null;
    }
    setOpenHeld(false);
    setCornerPhase('closing');
    cornerCloseTimerRef.current = setTimeout(() => {
      setCornerPhase('idle');
      cornerCloseTimerRef.current = null;
    }, PAGECLOSE_GIF_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (cornerCloseTimerRef.current) clearTimeout(cornerCloseTimerRef.current);
      if (openHeldTimerRef.current) clearTimeout(openHeldTimerRef.current);
    };
  }, []);

  const handleCornerClick = useCallback(() => {
    if (cornerPhase !== 'idle') setShowScenePicker(true);
  }, [cornerPhase]);

  return (
    <div className="wlm-window home-window" style={sceneStyle}>
      <div
        className="home-corner-hover-zone no-drag"
        onMouseEnter={handleCornerMouseEnter}
        onMouseLeave={handleCornerMouseLeave}
        onClick={handleCornerClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCornerClick()}
        aria-label="Open scene picker"
      >
        {cornerPhase !== 'idle' && (
          <img
            className="home-corner-gif"
            src={
              cornerPhase === 'open'
                ? (openHeld ? assetUrl('images', 'home', 'pageopen-last.png') : assetUrl('images', 'home', 'pageopen.gif'))
                : assetUrl('images', 'home', 'pageclose.gif')
            }
            alt=""
            draggable={false}
          />
        )}
      </div>
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
            <div className="home-search-separator" role="presentation">
              <img src={assetUrl('images', 'home', 'Separator.png')} alt="" draggable={false} />
            </div>
            <div className="home-search-row">
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
              <button className="search-toolbar-btn" title="Change display layout" onClick={() => window.aerocord.windows.openSettings()}>
                <img src={assetUrl('images', 'home', 'ChangeLayout.png')} alt="" draggable={false} />
              </button>
              <div className="search-toolbar-stack">
                <button className="search-toolbar-btn search-toolbar-btn-mail" title="Mail" onClick={() => {}}>
                  <img src={assetUrl('images', 'home', 'Home/Mail.png')} alt="" draggable={false} />
                </button>
                <button className="search-toolbar-btn" title="Show menu" onClick={() => window.aerocord.windows.openSettings()}>
                  <img src={assetUrl('images', 'home', 'ShowMenu.png')} alt="" draggable={false} />
                </button>
              </div>
            </div>
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
            onCloseConversation={handleCloseConversation}
            canCloseConversation={(item) => conversations.some(c => c.id === item.id)}
            onRemoveFriend={handleRemoveFriend}
            friendIds={friendIds}
          />
        )}

        {pendingRequests.length > 0 && (
          <ContactList
            title="Friend Requests"
            items={pendingRequests}
            onDoubleClick={handleOpenChatForUser}
            icon={assetUrl('images', 'home', 'AddFriend.png')}
            hideFavOption
            contextMenuMode="friendRequests"
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onIgnoreFriendRequest={handleIgnoreFriendRequest}
          />
        )}

        <ContactList
          title="Conversations"
          items={filteredConversations}
          onDoubleClick={handleOpenChat}
          onToggleFavorite={handleToggleFavorite}
          favoriteIds={favoriteIds}
          notifiedIds={notifiedChannels}
          onCloseConversation={handleCloseConversation}
          canCloseConversation={(item) => item.isGroupChat || item.recipientCount === 2}
          onRemoveFriend={handleRemoveFriend}
          friendIds={friendIds}
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

      <VersionBanner />
      <NewsTicker visible={showNews} whatsNewEntries={whatsNewEntries} />

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
