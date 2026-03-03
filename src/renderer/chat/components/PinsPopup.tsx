import React, { useState, useEffect, useCallback, useRef } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import { getEmojiFileForCode } from '../../shared/emojiCodes';
import { contentToMarkdownHtml } from '../../shared/markdown';
import { isGifUrl } from '../../shared/gifUtils';
import type { MessageVM, EmbedVM } from '../../shared/types';
import './PinsPopup.css';

const JUMP_ERROR_MSG = 'Unable to jump to that message (it\'s more than 600 messages back).';

function hasTextSelection(): boolean {
  return typeof window.getSelection === 'function' && !!window.getSelection()?.toString().trim();
}

function isImageAttachment(contentType?: string, filename?: string): boolean {
  if (contentType && contentType.startsWith('image/')) return true;
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
  }
  return false;
}

function isGifAttachment(contentType?: string, filename?: string): boolean {
  if (contentType && contentType.toLowerCase() === 'image/gif') return true;
  if (filename && filename.toLowerCase().endsWith('.gif')) return true;
  return false;
}

function getEmbedDisplayUrl(embed: EmbedVM): string {
  return embed.video?.url ?? embed.image?.url ?? embed.url ?? '';
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface PinsPopupProps {
  channelId: string;
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => Promise<boolean>;
  onPinsLoaded?: (messages: MessageVM[]) => void;
}

export const PinsPopup: React.FC<PinsPopupProps> = ({
  channelId,
  isOpen,
  onClose,
  onJumpToMessage,
  onPinsLoaded,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<MessageVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [jumpError, setJumpError] = useState<string | null>(null);
  const onPinsLoadedRef = useRef(onPinsLoaded);
  onPinsLoadedRef.current = onPinsLoaded;

  const loadPins = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const pins = await window.aerocord.messages.getPinned(channelId);
      setPinnedMessages(pins);
      onPinsLoadedRef.current?.(pins);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (isOpen && channelId) loadPins();
  }, [isOpen, channelId, loadPins]);

  const handleClose = useCallback(() => {
    setJumpError(null);
    onClose();
  }, [onClose]);

  const handleClickMessage = useCallback(
    async (messageId: string) => {
      if (hasTextSelection()) return;
      setJumpError(null);
      const ok = await onJumpToMessage(messageId);
      if (!ok) {
        setJumpError(JUMP_ERROR_MSG);
      } else {
        onClose();
      }
    },
    [onJumpToMessage, onClose]
  );

  const getEmojiImageUrl = useCallback((code: string) => {
    const file = getEmojiFileForCode(code);
    return file ? assetUrl('images', 'emoji', file) : '';
  }, []);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const link = t.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href');
      if (href?.startsWith('http')) {
        e.preventDefault();
        e.stopPropagation();
        window.aerocord?.shell?.openExternal(href);
      }
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="pins-popup-overlay" onClick={handleClose} role="presentation">
      <div
        className="pins-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pinned messages"
      >
        <div className="pins-popup-header">
          <div className="pins-popup-header-left">
            <img
              className="pins-popup-header-icon"
              src={assetUrl('images', 'message', 'pin.ico')}
              alt=""
              draggable={false}
            />
            <h3 className="pins-popup-title">Pinned messages</h3>
          </div>
          <button type="button" className="pins-popup-close" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>
        {jumpError && (
          <div className="pins-popup-error" role="alert">
            {jumpError}
          </div>
        )}
        <div className="pins-popup-list">
          {loading ? (
            <div className="pins-popup-loading">Loading pins...</div>
          ) : pinnedMessages.length === 0 ? (
            <div className="pins-popup-empty">No pinned messages.</div>
          ) : (
            pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                className="pins-popup-message chat-message"
                role="button"
                tabIndex={0}
                onClick={() => handleClickMessage(msg.id)}
                onKeyDown={(e) => e.key === 'Enter' && !hasTextSelection() && handleClickMessage(msg.id)}
                title="Click to jump to message (text is selectable)"
              >
                <div className="chat-message-header">
                  <span className="chat-message-author" style={{ color: msg.author.color || '#525252' }}>
                    {msg.author.name}
                  </span>
                  <span className="chat-message-timestamp">({formatTime(msg.timestamp)})</span>
                </div>
                {msg.content && (
                  <div className="chat-message-content-wrap">
                    <div
                      className="chat-message-content chat-message-content-markdown"
                      onClick={handleContentClick}
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
                )}
                {msg.attachments.length > 0 && (
                  <div className="pins-popup-media">
                    {msg.attachments.map((att) =>
                      isImageAttachment(att.contentType, att.filename) ? (
                        isGifAttachment(att.contentType, att.filename) ? (
                          <div key={att.id} className="pins-popup-media-wrap">
                            <img
                              className="pins-popup-image"
                              src={att.url}
                              alt={att.filename}
                              onClick={(e) => e.stopPropagation()}
                              draggable={false}
                            />
                          </div>
                        ) : (
                          <img
                            key={att.id}
                            className="pins-popup-image"
                            src={att.url}
                            alt={att.filename}
                            onClick={(e) => e.stopPropagation()}
                            draggable={false}
                          />
                        )
                      ) : (
                        <span key={att.id} className="pins-popup-attachment-label">
                          📎 {att.filename}
                        </span>
                      )
                    )}
                  </div>
                )}
                {msg.embeds.length > 0 && (
                  <div className="pins-popup-media">
                    {msg.embeds.map((embed, ei) => {
                      const displayUrl = getEmbedDisplayUrl(embed);
                      const hasImageOrGif = embed.image || embed.video || (embed.url && isGifUrl(embed.url));
                      const isGif = hasImageOrGif && (embed.video?.url || isGifUrl(displayUrl));
                      if (!displayUrl) return null;
                      return (
                        <div key={ei} className="pins-popup-media-wrap">
                          {isGif && embed.video?.url ? (
                            <video
                              className="pins-popup-image"
                              src={embed.video.url}
                              autoPlay
                              loop
                              muted
                              playsInline
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <img
                              className="pins-popup-image"
                              src={displayUrl}
                              alt=""
                              onClick={(e) => e.stopPropagation()}
                              draggable={false}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
