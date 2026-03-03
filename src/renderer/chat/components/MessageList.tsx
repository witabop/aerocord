import React, { useState, useCallback, useRef, useEffect } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import { getEmojiFileForCode } from '../../shared/emojiCodes';
import { contentToMarkdownHtml } from '../../shared/markdown';
import type { MessageVM, FavoriteGifEntry } from '../../shared/types';
import { isGifUrl, isEmbedGifLink, isDirectGifUrl, EMBED_GIF_HOSTS, getGifUrlHost } from '../../shared/gifUtils';
import { ImageLightbox } from './ImageLightbox';

const STAR_ICON_URL = assetUrl('images', 'emoji', 'Star.png');

interface MessageListProps {
  messages: MessageVM[];
  currentUserId?: string;
  onDelete: (messageId: string) => void;
  onReply: (message: MessageVM) => void;
  onEdit: (messageId: string, content: string) => void;
  onUserClick?: (userId: string, x: number, y: number) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onLoadMoreMessages?: () => void;
  isLoadingMore?: boolean;
  hasMoreMessages?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  highlightMessageId?: string | null;
  canPin?: boolean;
  pinnedMessageIds?: Set<string>;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onOpenPins?: () => void;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shouldShowHeader(msg: MessageVM, prevMsg: MessageVM | undefined): boolean {
  if (!prevMsg) return true;
  if (prevMsg.author.id !== msg.author.id) return true;
  if (prevMsg.special || msg.special) return true;
  const timeDiff = new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();
  return timeDiff > 5 * 60 * 1000;
}

function isImageAttachment(contentType?: string, filename?: string): boolean {
  if (contentType && contentType.startsWith('image/')) return true;
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
  }
  return false;
}

/** True only for GIFs (contentType image/gif or filename .gif). */
function isGifAttachment(contentType?: string, filename?: string): boolean {
  if (contentType && contentType.toLowerCase() === 'image/gif') return true;
  if (filename && filename.toLowerCase().endsWith('.gif')) return true;
  return false;
}

/** Display URL for an embed (image, video, or url for link-only GIF). */
function getEmbedDisplayUrl(embed: MessageVM['embeds'][0]): string {
  return embed.video?.url ?? embed.image?.url ?? embed.url ?? '';
}

/** Payload to add to favorites for an embed: link + displayUrl so we send the link but can show the media. */
function getEmbedFavoritePayload(embed: MessageVM['embeds'][0]): FavoriteGifEntry {
  const link = embed.url;
  const mediaUrl = embed.video?.url ?? embed.image?.url;
  if (link && isEmbedGifLink(link) && mediaUrl) return { link, displayUrl: mediaUrl };
  return (mediaUrl ?? link) as string;
}

/** Id used to match this embed in the favorites list (for isFav check and remove). */
function getEmbedFavoriteId(embed: MessageVM['embeds'][0]): string {
  if (embed.url && isEmbedGifLink(embed.url)) return embed.url;
  return embed.video?.url ?? embed.image?.url ?? embed.url ?? '';
}

function isUrlFavorited(id: string, list: FavoriteGifEntry[]): boolean {
  return list.some(
    (e) => e === id || (typeof e === 'object' && (e.link === id || e.displayUrl === id))
  );
}

function removeFavoriteEntry(list: FavoriteGifEntry[], id: string): FavoriteGifEntry[] {
  return list.filter(
    (e) => e !== id && (typeof e !== 'object' || (e.link !== id && e.displayUrl !== id))
  );
}

/** If message content is exactly a single URL, return it; otherwise null. */
function getSingleUrlFromContent(msg: MessageVM): string | null {
  const trimmed = msg.content?.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(https?:\/\/\S+)$/);
  return m?.[1] ?? null;
}

/** True when message content is only a single link that matches a media embed or is a direct GIF URL (hide link, show only embed). */
function contentIsOnlyEmbedLink(msg: MessageVM): boolean {
  const url = getSingleUrlFromContent(msg);
  if (!url) return false;
  if (isDirectGifUrl(url)) return true;
  if (msg.embeds.length === 0) return false;
  const hasMediaEmbed = msg.embeds.some((e) => e.image || e.video);
  if (!hasMediaEmbed) return false;
  const linkMatchesEmbed = msg.embeds.some(
    (e) => e.url && (e.url === url || url.startsWith(e.url) || e.url.startsWith(url))
  );
  if (linkMatchesEmbed) return true;
  const host = getGifUrlHost(url);
  return host !== null && (EMBED_GIF_HOSTS as readonly string[]).includes(host);
}

/** If message content is only a direct GIF URL and no embed shows it, return that URL to render as a synthetic embed. */
function getSyntheticGifEmbedUrl(msg: MessageVM): string | null {
  const url = getSingleUrlFromContent(msg);
  if (!url || !isDirectGifUrl(url)) return null;
  const alreadyShown = msg.embeds.some(
    (e) => e.image?.url === url || e.url === url || (e.video?.url === url)
  );
  return alreadyShown ? null : url;
}

/** Embeds to display: real embeds plus optionally one synthetic for a standalone direct GIF URL in content. */
function getEmbedsToShow(msg: MessageVM): MessageVM['embeds'] {
  const syntheticUrl = getSyntheticGifEmbedUrl(msg);
  if (!syntheticUrl) return msg.embeds;
  const synthetic: MessageVM['embeds'][0] = { url: syntheticUrl, image: { url: syntheticUrl }, fields: [] };
  return [synthetic, ...msg.embeds];
}

interface ContextMenu {
  x: number;
  y: number;
  msg: MessageVM;
  isOwn: boolean;
  /** true when opened by holding Shift over message; close on Shift release */
  openedByShift?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  onDelete,
  onReply,
  onEdit,
  onUserClick,
  messagesEndRef,
  scrollContainerRef: forwardedScrollRef,
  onLoadMoreMessages,
  isLoadingMore,
  hasMoreMessages,
  onScrollToMessage,
  highlightMessageId,
  canPin,
  pinnedMessageIds = new Set(),
  onPin,
  onUnpin,
  onOpenPins,
}) => {
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const [favoriteGifUrls, setFavoriteGifUrls] = useState<FavoriteGifEntry[]>([]);

  const loadFavorites = useCallback(async () => {
    const s = await window.aerocord.settings.get();
    setFavoriteGifUrls(s.favoriteGifUrls ?? []);
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleGifFavorite = useCallback(
    async (id: string, entryToAdd?: FavoriteGifEntry) => {
      const s = await window.aerocord.settings.get();
      const list = s.favoriteGifUrls ?? [];
      const isFav = isUrlFavorited(id, list);
      const next = isFav ? removeFavoriteEntry(list, id) : [...list, entryToAdd ?? id];
      await window.aerocord.settings.update({ favoriteGifUrls: next });
      setFavoriteGifUrls(next);
    },
    []
  );

  const gifStarVisibility = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, visible: boolean) => {
      const star = e.currentTarget.querySelector<HTMLElement>('.chat-message-gif-fav-star');
      if (visible) star?.classList.add('visible');
      else star?.classList.remove('visible');
    },
    []
  );

  const openLightbox = useCallback((url: string, isVideo: boolean) => {
    setLightboxUrl(url);
    setLightboxIsVideo(isVideo);
  }, []);
  const closeLightbox = useCallback(() => {
    setLightboxUrl(null);
    setLightboxIsVideo(false);
  }, []);

  const getEmojiImageUrl = useCallback((code: string) => {
    const file = getEmojiFileForCode(code);
    return file ? assetUrl('images', 'emoji', file) : '';
  }, []);

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, onUserClick?: (userId: string, x: number, y: number) => void) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const mention = t.closest('.chat-mention-badge[data-user-id]');
      if (mention) {
        e.preventDefault();
        const userId = mention.getAttribute('data-user-id');
        if (userId) onUserClick?.(userId, e.clientX, e.clientY);
        return;
      }
      const link = t.closest('a[href]');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('http')) {
          e.preventDefault();
          window.aerocord?.shell?.openExternal(href);
        }
      }
    },
    []
  );
  const editRef = useRef<HTMLTextAreaElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = forwardedScrollRef ?? internalScrollRef;
  const hoveredMessageRef = useRef<{ msg: MessageVM; isOwn: boolean } | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!ctxMenu || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const onScroll = () => setCtxMenu(null);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [ctxMenu]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !onLoadMoreMessages) return;
    const onScroll = () => {
      if (el.scrollTop < 80 && hasMoreMessages && !isLoadingMore) {
        onLoadMoreMessages();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [onLoadMoreMessages, isLoadingMore, hasMoreMessages]);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: MessageVM, isOwn: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, msg, isOwn, openedByShift: false });
  }, []);

  const handleShiftHover = useCallback((e: React.MouseEvent, msg: MessageVM, isOwn: boolean) => {
    hoveredMessageRef.current = { msg, isOwn };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    if (e.shiftKey) {
      setCtxMenu({ x: e.clientX, y: e.clientY, msg, isOwn, openedByShift: true });
    }
  }, []);

  const handleMessageMouseLeave = useCallback(() => {
    hoveredMessageRef.current = null;
  }, []);

  const handleMessagesMouseMove = useCallback((e: React.MouseEvent) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && hoveredMessageRef.current) {
        const { msg, isOwn } = hoveredMessageRef.current;
        const { x, y } = lastMouseRef.current;
        setCtxMenu({ x, y, msg, isOwn, openedByShift: true });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && ctxMenu?.openedByShift) {
        setCtxMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [ctxMenu]);


  const handleReply = useCallback(() => {
    if (ctxMenu) { onReply(ctxMenu.msg); setCtxMenu(null); }
  }, [ctxMenu, onReply]);

  const handleStartEdit = useCallback(() => {
    if (ctxMenu) {
      setEditingId(ctxMenu.msg.id);
      setEditText(ctxMenu.msg.content);
      setCtxMenu(null);
    }
  }, [ctxMenu]);

  const handleConfirmEdit = useCallback(() => {
    if (editingId && editText.trim()) {
      onEdit(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmEdit(); }
    if (e.key === 'Escape') handleCancelEdit();
  }, [handleConfirmEdit, handleCancelEdit]);

  const handleDeleteCtx = useCallback(() => {
    if (ctxMenu) { onDelete(ctxMenu.msg.id); setCtxMenu(null); }
  }, [ctxMenu, onDelete]);

  const handlePinCtx = useCallback(() => {
    if (ctxMenu && onPin) { onPin(ctxMenu.msg.id); setCtxMenu(null); }
  }, [ctxMenu, onPin]);

  const handleUnpinCtx = useCallback(() => {
    if (ctxMenu && onUnpin) { onUnpin(ctxMenu.msg.id); setCtxMenu(null); }
  }, [ctxMenu, onUnpin]);

  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      (internalScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (forwardedScrollRef) (forwardedScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [forwardedScrollRef],
  );

  return (
    <div className="chat-messages" ref={setScrollRef} onMouseMove={handleMessagesMouseMove}>
      {isLoadingMore && (
        <div className="chat-messages-loading">Loading older messages...</div>
      )}
      {messages.map((msg, i) => {
        const showHeader = shouldShowHeader(msg, messages[i - 1]);
        const isOwn = msg.author.id === currentUserId;

        if (msg.special) {
          if (msg.type === 'CHANNEL_PINNED_MESSAGE') {
            return (
              <div key={msg.id} className="chat-message">
                <div className="chat-message-special chat-message-pin">
                  <span className="chat-message-pin-author">{msg.author.name}</span>
                  {' pinned '}
                  {msg.pinnedMessageId && onScrollToMessage ? (
                    <button
                      type="button"
                      className="chat-message-pin-link"
                      onClick={() => onScrollToMessage(msg.pinnedMessageId!)}
                    >
                      a message
                    </button>
                  ) : (
                    'a message'
                  )}
                  {' to this channel. See all '}
                  {onOpenPins ? (
                    <button
                      type="button"
                      className="chat-message-pin-link"
                      onClick={onOpenPins}
                    >
                      pinned messages
                    </button>
                  ) : (
                    'pinned messages'
                  )}
                  .
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="chat-message">
              <div className="chat-message-special">{msg.content}</div>
            </div>
          );
        }

        const replyClasses = msg.isReply && msg.replyMessage
          ? msg.replyMessage.author.id === currentUserId
            ? 'chat-message-is-reply chat-message-reply-to-client'
            : 'chat-message-is-reply'
          : '';
        return (
          <div
            key={msg.id}
            data-message-id={msg.id}
            className={`chat-message ${replyClasses} ${msg.mentionsSelf ? 'chat-message-mention' : ''} ${highlightMessageId === msg.id ? 'chat-message-highlight' : ''}`}
            onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
            onMouseEnter={(e) => handleShiftHover(e, msg, isOwn)}
            onMouseLeave={handleMessageMouseLeave}
          >
            {msg.isReply && msg.replyMessage && (
              <div
                className="chat-message-reply chat-message-reply-clickable"
                role="button"
                tabIndex={0}
                onClick={() => onScrollToMessage?.(msg.replyMessage!.id)}
                onKeyDown={(e) => e.key === 'Enter' && onScrollToMessage?.(msg.replyMessage!.id)}
                title="Jump to message"
              >
                <img
                  className="chat-message-reply-icon"
                  src={assetUrl('images', 'message', msg.replyMessage.author.id === currentUserId ? 'replyclient.png' : 'reply.png')}
                  alt=""
                  draggable={false}
                />
                <span className="chat-message-reply-author">{msg.replyMessage.author.name}: </span>
                <span className="chat-message-reply-content">
                  {msg.replyMessage.content.trim()
                    ? (msg.replyMessage.content.length > 100
                      ? `${msg.replyMessage.content.substring(0, 100)}...`
                      : msg.replyMessage.content)
                    : (msg.replyMessage.attachments?.length ? 'attachment' : '')}
                </span>
              </div>
            )}

            {showHeader && (
              <div className="chat-message-header">
                <span
                  className="chat-message-author clickable-name"
                  style={{ color: msg.author.color || '#525252' }}
                  onClick={(e) => onUserClick?.(msg.author.id, e.clientX, e.clientY)}
                >
                  {msg.author.name}
                </span>
                <span className="chat-message-timestamp">
                  ({formatTime(msg.timestamp)})
                </span>
              </div>
            )}

            {editingId === msg.id ? (
              <div className="chat-message-editing">
                <textarea
                  ref={editRef}
                  className="chat-edit-textarea"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  rows={1}
                />
                <div className="chat-edit-actions">
                  <span className="chat-edit-hint">Enter to save, Escape to cancel</span>
                </div>
              </div>
            ) : (
              msg.content && !contentIsOnlyEmbedLink(msg) && (
                <div className="chat-message-content-wrap">
                  <div
                    className="chat-message-content chat-message-content-markdown"
                    onClick={(e) => handleContentClick(e, onUserClick)}
                    role="textbox"
                    dangerouslySetInnerHTML={{
                      __html: contentToMarkdownHtml(msg.content, {
                        mentions: msg.mentions,
                        mentionRoles: msg.mentionRoles,
                        getEmojiImageUrl,
                      }),
                    }}
                  />
                  {msg.edited && <span className="chat-message-edited"> (edited)</span>}
                </div>
              )
            )}

            {msg.attachments.length > 0 && (
              <div className="chat-message-attachments">
                {msg.attachments.map(att => (
                  isImageAttachment(att.contentType, att.filename) ? (
                    isGifAttachment(att.contentType, att.filename) ? (
                      <div
                        key={att.id}
                        className="chat-message-attachment-image-wrap"
                        onMouseEnter={(e) => gifStarVisibility(e, true)}
                        onMouseLeave={(e) => gifStarVisibility(e, false)}
                      >
                        <img
                          className="chat-message-attachment-image"
                          src={att.url}
                          alt={att.filename}
                          onClick={() => openLightbox(att.url, false)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && openLightbox(att.url, false)}
                        />
                        <button
                          type="button"
                          className={'chat-message-gif-fav-star' + (isUrlFavorited(att.url, favoriteGifUrls) ? ' chat-message-gif-fav-star-on' : '')}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleGifFavorite(att.url);
                          }}
                          aria-label={isUrlFavorited(att.url, favoriteGifUrls) ? 'Remove from favorites' : 'Add to favorites'}
                          title={isUrlFavorited(att.url, favoriteGifUrls) ? 'Remove from GIF favorites' : 'Add to GIF favorites'}
                        >
                          <img src={STAR_ICON_URL} alt="" />
                        </button>
                      </div>
                    ) : (
                      <img
                        key={att.id}
                        className="chat-message-attachment-image"
                        src={att.url}
                        alt={att.filename}
                        onClick={() => openLightbox(att.url, false)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openLightbox(att.url, false)}
                      />
                    )
                  ) : (
                    <a
                      key={att.id}
                      className="chat-message-attachment-file"
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {att.filename} ({(att.size / 1024).toFixed(1)} KB)
                    </a>
                  )
                ))}
              </div>
            )}

            {getEmbedsToShow(msg).map((embed, ei) => {
              const displayUrl = getEmbedDisplayUrl(embed);
              const hasImageOrGifUrl = embed.image || (embed.url && isGifUrl(embed.url));
              const isImageGif = hasImageOrGifUrl && isGifUrl(displayUrl);
              const favId = getEmbedFavoriteId(embed);
              const isFav = isUrlFavorited(favId, favoriteGifUrls);
              const embedIsUrlGif = embed.url && isGifUrl(embed.url);

              return (
                <div
                  key={ei}
                  className="chat-embed"
                  style={embed.color ? { borderLeftColor: embed.color } : undefined}
                >
                  {embed.title && (
                    <div className="chat-embed-title">
                      {embed.url ? <a href={embed.url} target="_blank" rel="noreferrer">{embed.title}</a> : embed.title}
                    </div>
                  )}
                  {embed.description && (
                    <div className="chat-embed-description">{embed.description}</div>
                  )}
                  {hasImageOrGifUrl && (
                    isImageGif ? (
                      <div
                        className="chat-message-attachment-image-wrap"
                        onMouseEnter={(e) => gifStarVisibility(e, true)}
                        onMouseLeave={(e) => gifStarVisibility(e, false)}
                      >
                        <img
                          className="chat-embed-image chat-embed-image-clickable"
                          src={displayUrl}
                          alt=""
                          onClick={() => openLightbox(displayUrl, false)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && openLightbox(displayUrl, false)}
                        />
                        <button
                          type="button"
                          className={'chat-message-gif-fav-star' + (isFav ? ' chat-message-gif-fav-star-on' : '')}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleGifFavorite(favId, getEmbedFavoritePayload(embed));
                          }}
                          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                          title={isFav ? 'Remove from GIF favorites' : 'Add to GIF favorites'}
                        >
                          <img src={STAR_ICON_URL} alt="" />
                        </button>
                      </div>
                    ) : (
                      <img
                        className="chat-embed-image chat-embed-image-clickable"
                        src={displayUrl}
                        alt=""
                        onClick={() => openLightbox(displayUrl, false)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openLightbox(displayUrl, false)}
                      />
                    )
                  )}
                  {embed.video && !embed.image && !embedIsUrlGif && (
                    <div
                      className="chat-message-attachment-image-wrap"
                      onMouseEnter={(e) => gifStarVisibility(e, true)}
                      onMouseLeave={(e) => gifStarVisibility(e, false)}
                    >
                      <video
                        className="chat-embed-image chat-embed-image-clickable"
                        src={embed.video.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        onClick={() => openLightbox(embed.video!.url, true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && embed.video && openLightbox(embed.video!.url, true)}
                      />
                      <button
                        type="button"
                        className={'chat-message-gif-fav-star' + (isFav ? ' chat-message-gif-fav-star-on' : '')}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleGifFavorite(favId, getEmbedFavoritePayload(embed));
                        }}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        title={isFav ? 'Remove from GIF favorites' : 'Add to GIF favorites'}
                      >
                        <img src={STAR_ICON_URL} alt="" />
                      </button>
                    </div>
                  )}
                  {embed.thumbnail && !embed.image && !embed.video && !embedIsUrlGif && (
                    <img
                      className="chat-embed-image chat-embed-image-clickable"
                      src={embed.thumbnail.url}
                      alt=""
                      onClick={() => openLightbox(embed.thumbnail!.url, false)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && embed.thumbnail && openLightbox(embed.thumbnail!.url, false)}
                    />
                  )}
                </div>
              );
            })}

            {msg.edited && (!msg.content || contentIsOnlyEmbedLink(msg)) && (
              <span className="chat-message-edited"> (edited)</span>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />

      {ctxMenu && (
        <div
          className="msg-context-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="msg-ctx-item" onClick={handleReply}>Reply</button>
          {canPin && !pinnedMessageIds.has(ctxMenu.msg.id) && (
            <button className="msg-ctx-item" onClick={handlePinCtx}>Pin</button>
          )}
          {canPin && pinnedMessageIds.has(ctxMenu.msg.id) && (
            <button className="msg-ctx-item" onClick={handleUnpinCtx}>Unpin</button>
          )}
          {ctxMenu.isOwn && (
            <>
              <button className="msg-ctx-item" onClick={handleStartEdit}>Edit</button>
              <button className="msg-ctx-item danger" onClick={handleDeleteCtx}>Delete</button>
            </>
          )}
        </div>
      )}

      {lightboxUrl && (
        <ImageLightbox imageUrl={lightboxUrl} isVideo={lightboxIsVideo} onClose={closeLightbox} />
      )}
    </div>
  );
};
