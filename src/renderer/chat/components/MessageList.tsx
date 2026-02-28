import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import { splitByEmojiCodes, getEmojiFileForCode } from '../../shared/emojiCodes';
import type { MessageVM } from '../../shared/types';
import { ImageLightbox } from './ImageLightbox';

interface MessageListProps {
  messages: MessageVM[];
  currentUserId?: string;
  onDelete: (messageId: string) => void;
  onReply: (message: MessageVM) => void;
  onEdit: (messageId: string, content: string) => void;
  onUserClick?: (userId: string, x: number, y: number) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
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

/** Matches http(s) URLs for linkification. */
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

function splitByUrls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    parts.push({ type: 'url', value: m[1] });
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts.length ? parts : [{ type: 'text', value: text }];
}

function renderContentWithMentions(
  content: string,
  onUserClick?: (userId: string, x: number, y: number) => void,
  mentions?: { id: string; name: string }[],
  mentionRoles?: { id: string; name: string }[],
): React.ReactNode {
  const userMentions = mentions ?? [];
  const roleMentions = mentionRoles ?? [];
  const allMentionNames = [
    ...userMentions.map(m => `@${m.name}`),
    ...roleMentions.map(r => `@${r.name}`),
  ];
  if (allMentionNames.length === 0) return content;

  const userMentionMap = new Map(userMentions.map(m => [`@${m.name}`, m.id]));
  const roleMentionSet = new Set(roleMentions.map(r => `@${r.name}`));

  const escaped = allMentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'g');

  const parts = content.split(regex);
  return parts.map((part, i) => {
    const userId = userMentionMap.get(part);
    if (userId) {
      return (
        <span
          key={i}
          className="chat-mention-badge"
          onClick={(e) => onUserClick?.(userId, e.clientX, e.clientY)}
        >
          {part}
        </span>
      );
    }
    if (roleMentionSet.has(part)) {
      return (
        <span key={i} className="chat-mention-badge">
          {part}
        </span>
      );
    }
    return part;
  });
}

function renderMessageContent(
  content: string,
  onUserClick?: (userId: string, x: number, y: number) => void,
  mentions?: { id: string; name: string }[],
  mentionRoles?: { id: string; name: string }[],
): React.ReactNode {
  const segments = splitByEmojiCodes(content);
  return segments.map((seg, i) => {
    if (seg.type === 'emoji') {
      const file = getEmojiFileForCode(seg.value);
      if (file) {
        return (
          <img
            key={i}
            className="chat-message-emoji"
            src={assetUrl('images', 'emoji', file)}
            alt={seg.value}
            title={seg.value}
            draggable={false}
          />
        );
      }
    }
    const urlParts = splitByUrls(seg.value);
    return (
      <React.Fragment key={i}>
        {urlParts.map((part, j) =>
          part.type === 'url' ? (
            <a
              key={j}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-message-link"
              onClick={(e) => {
                e.preventDefault();
                window.aerocord?.shell?.openExternal(part.value);
              }}
            >
              {part.value}
            </a>
          ) : (
            <React.Fragment key={j}>{renderContentWithMentions(part.value, onUserClick, mentions, mentionRoles)}</React.Fragment>
          ),
        )}
      </React.Fragment>
    );
  });
}

interface ContextMenu {
  x: number;
  y: number;
  msg: MessageVM;
  isOwn: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  onDelete,
  onReply,
  onEdit,
  onUserClick,
  messagesEndRef,
}) => {
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: MessageVM, isOwn: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, msg, isOwn });
  }, []);

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

  return (
    <div className="chat-messages" ref={scrollContainerRef}>
      {messages.map((msg, i) => {
        const showHeader = shouldShowHeader(msg, messages[i - 1]);
        const isOwn = msg.author.id === currentUserId;

        if (msg.special) {
          return (
            <div key={msg.id} className="chat-message">
              <div className="chat-message-special">{msg.content}</div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`chat-message ${msg.mentionsSelf ? 'chat-message-mention' : ''}`}
            onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
          >
            {msg.isReply && msg.replyMessage && (
              <div className="chat-message-reply">
                <span className="chat-message-reply-author">{msg.replyMessage.author.name}: </span>
                {msg.replyMessage.content.substring(0, 100)}
                {msg.replyMessage.content.length > 100 ? '...' : ''}
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
              msg.content && <div className="chat-message-content">{renderMessageContent(msg.content, onUserClick, msg.mentions, msg.mentionRoles)}</div>
            )}

            {msg.attachments.length > 0 && (
              <div className="chat-message-attachments">
                {msg.attachments.map(att => (
                  isImageAttachment(att.contentType, att.filename) ? (
                    <img
                      key={att.id}
                      className="chat-message-attachment-image"
                      src={att.url}
                      alt={att.filename}
                      onClick={() => setLightboxUrl(att.url)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setLightboxUrl(att.url)}
                    />
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

            {msg.embeds.map((embed, ei) => (
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
                {embed.image && (
                  <img
                    className="chat-embed-image chat-embed-image-clickable"
                    src={embed.image.url}
                    alt=""
                    onClick={() => setLightboxUrl(embed.image!.url)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && embed.image && setLightboxUrl(embed.image.url)}
                  />
                )}
                {embed.thumbnail && !embed.image && (
                  <img
                    className="chat-embed-image chat-embed-image-clickable"
                    src={embed.thumbnail.url}
                    alt=""
                    onClick={() => setLightboxUrl(embed.thumbnail!.url)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && embed.thumbnail && setLightboxUrl(embed.thumbnail.url)}
                  />
                )}
              </div>
            ))}
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
          {ctxMenu.isOwn && (
            <>
              <button className="msg-ctx-item" onClick={handleStartEdit}>Edit</button>
              <button className="msg-ctx-item danger" onClick={handleDeleteCtx}>Delete</button>
            </>
          )}
        </div>
      )}

      {lightboxUrl && (
        <ImageLightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
};
