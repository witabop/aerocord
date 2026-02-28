import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { MessageVM, UserVM } from '../../shared/types';
import { EmojiBoard } from './EmojiBoard';
import { GifBoard } from './GifBoard';

export interface PendingAttachment {
  id: string;
  path: string;
  name: string;
}

const closeIconUrl = assetUrl('images', 'notification', 'Close.png');
const closeIconHoverUrl = assetUrl('images', 'notification', 'CloseHover.png');

function AttachmentThumbnail({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [closeHover, setCloseHover] = useState(false);
  useEffect(() => {
    let cancelled = false;
    window.aerocord.files.getPreviewDataUrl(attachment.path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.path]);
  const isImage = !!previewUrl;
  return (
    <div className="chat-attachment-thumb">
      {isImage ? (
        <img src={previewUrl} alt="" className="chat-attachment-thumb-img" draggable={false} />
      ) : (
        <div className="chat-attachment-thumb-file">
          <span className="chat-attachment-thumb-file-icon">📎</span>
          <span className="chat-attachment-thumb-file-name" title={attachment.name}>{attachment.name}</span>
        </div>
      )}
      {!disabled && (
        <button
          type="button"
          className="chat-attachment-thumb-remove"
          onClick={onRemove}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          title="Remove"
          aria-label="Remove attachment"
        >
          <img src={closeHover ? closeIconHoverUrl : closeIconUrl} alt="" draggable={false} />
        </button>
      )}
    </div>
  );
}

export interface MessageInputProps {
  onSend: (content: string, attachmentPaths?: string[]) => void;
  onSendGif?: (filename: string) => void;
  pendingAttachments?: PendingAttachment[];
  onAddAttachments?: (filePaths: string[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments?: () => void;
  onUploadError?: (message: string) => void;
  maxFileSizeBytes?: number;
  onTyping: () => void;
  replyTarget: MessageVM | null;
  onCancelReply: () => void;
  disabled: boolean;
  members?: UserVM[];
}

interface MentionSuggestion {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onSendGif,
  pendingAttachments = [],
  onAddAttachments,
  onRemoveAttachment,
  onClearAttachments,
  onUploadError,
  maxFileSizeBytes = 8 * 1024 * 1024,
  onTyping,
  replyTarget,
  onCancelReply,
  disabled,
  members,
}) => {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const [emojiBoardOpen, setEmojiBoardOpen] = useState(false);
  const [gifBoardOpen, setGifBoardOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingRef = useRef(0);

  const allMembers = useMemo(() => {
    if (!members) return [];
    return members.map(m => ({
      id: m.id,
      name: m.name,
      username: m.username,
      avatar: m.avatar,
    }));
  }, [members]);

  const updateMentionQuery = useCallback((value: string, cursorPos: number) => {
    const beforeCursor = value.substring(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1 || (atIndex > 0 && beforeCursor[atIndex - 1] !== ' ' && beforeCursor[atIndex - 1] !== '\n')) {
      setMentionQuery(null);
      setSuggestions([]);
      return;
    }
    const query = beforeCursor.substring(atIndex + 1);
    if (query.includes(' ') && query.length > 20) {
      setMentionQuery(null);
      setSuggestions([]);
      return;
    }
    setMentionQuery({ start: atIndex, query });
    const lower = query.toLowerCase();
    const filtered = allMembers.filter(m =>
      m.name.toLowerCase().includes(lower) || m.username.toLowerCase().includes(lower)
    ).slice(0, 8);
    setSuggestions(filtered);
    setSelectedSuggestion(0);
  }, [allMembers]);

  const insertMention = useCallback((user: MentionSuggestion) => {
    if (!mentionQuery || !textareaRef.current) return;
    const before = text.substring(0, mentionQuery.start);
    const after = text.substring(mentionQuery.start + 1 + mentionQuery.query.length);
    const newText = `${before}<@${user.id}>${after}`;
    setText(newText);
    setSuggestions([]);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = before.length + `<@${user.id}>`.length;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [text, mentionQuery]);

  const handleEmojiSelect = useCallback((code: string) => {
    const cursorPos = textareaRef.current?.selectionStart ?? text.length;
    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);
    const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const trailingSpace = after.length > 0 && !after.startsWith(' ') ? ' ' : '';
    const newText = `${before}${space}${code}${trailingSpace}${after}`;
    setText(newText);
    setEmojiBoardOpen(false);
    setTimeout(() => {
      const pos = before.length + space.length + code.length + trailingSpace.length;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    const paths = pendingAttachments.map((a) => a.path);
    if (!trimmed && paths.length === 0) return;
    onSend(trimmed || '\u200B', paths.length ? paths : undefined);
    setText('');
    setSuggestions([]);
    setMentionQuery(null);
    onClearAttachments?.();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, pendingAttachments, onSend, onClearAttachments]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertMention(suggestions[selectedSuggestion]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, suggestions, selectedSuggestion, insertMention]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateMentionQuery(value, e.target.selectionStart ?? value.length);

    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';

    const now = Date.now();
    if (now - lastTypingRef.current > 5000) {
      lastTypingRef.current = now;
      onTyping();
    }
  }, [onTyping, updateMentionQuery]);

  const handleClick = useCallback(() => {
    if (textareaRef.current) {
      updateMentionQuery(text, textareaRef.current.selectionStart ?? text.length);
    }
  }, [text, updateMentionQuery]);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files?.length || !onAddAttachments || disabled) return;
      const maxSize = maxFileSizeBytes;
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > maxSize) {
          onUploadError?.('Files must be 8MB or smaller.');
          return;
        }
        const pathProp = (file as File & { path?: string }).path;
        if (pathProp) {
          paths.push(pathProp);
        } else {
          try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            const base64 = btoa(binary);
            const ext = file.name?.split('.').pop() || (file.type?.startsWith('image/') ? 'png' : 'bin');
            const tempPath = await window.aerocord.files.writeTemp(base64, ext);
            paths.push(tempPath);
          } catch {
            onUploadError?.('Failed to paste file.');
            return;
          }
        }
      }
      if (paths.length) {
        e.preventDefault();
        onAddAttachments(paths);
      }
    },
    [onAddAttachments, onUploadError, disabled, maxFileSizeBytes]
  );

  useEffect(() => {
    if (replyTarget) {
      textareaRef.current?.focus();
    }
  }, [replyTarget]);

  return (
    <div className="chat-input-area no-drag">
      {replyTarget && (
        <div className="chat-reply-bar">
          <span>Replying to <strong>{replyTarget.author.name}</strong></span>
          <button className="chat-reply-cancel" onClick={onCancelReply} title="Cancel reply">
            &#x2715;
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mention-autocomplete">
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              className={`mention-autocomplete-item ${i === selectedSuggestion ? 'selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
              onMouseEnter={() => setSelectedSuggestion(i)}
            >
              <img className="mention-autocomplete-avatar" src={s.avatar} alt="" draggable={false} />
              <span className="mention-autocomplete-name">{s.name}</span>
              <span className="mention-autocomplete-username">{s.username}</span>
            </div>
          ))}
        </div>
      )}

      {pendingAttachments.length > 0 && (
        <div className="chat-attachment-strip">
          {pendingAttachments.map((att) => (
            <AttachmentThumbnail
              key={att.id}
              attachment={att}
              onRemove={() => onRemoveAttachment?.(att.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      <div className="chat-input-box-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input-text"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onPaste={handlePaste}
          disabled={disabled}
          rows={1}
        />
      </div>
      <div className="chat-input-toolbar">
        <div className="chat-input-toolbar-inner">
          <img
            className="chat-input-tool-icon clickable"
            src={assetUrl('images', 'emoji', 'Smile.png')}
            alt="Emoticons"
            draggable={false}
            title="Emoticons"
            onClick={() => setEmojiBoardOpen(prev => !prev)}
          />
        </div>
        <div className="chat-input-toolbar-spacer" />
        <div className="chat-input-toolbar-right">
          <img
            className="chat-input-tool-icon clickable"
            src={assetUrl('images', 'message', 'Pen.png')}
            alt="GIFs"
            draggable={false}
            title="GIFs"
            onClick={() => setGifBoardOpen((prev) => !prev)}
          />
          <img className="chat-input-tool-icon" src={assetUrl('images', 'message', 'Text.png')} alt="Text" draggable={false} title="Font" />
        </div>
      </div>

      <EmojiBoard
        visible={emojiBoardOpen}
        onClose={() => setEmojiBoardOpen(false)}
        onSelect={handleEmojiSelect}
      />

      <GifBoard
        visible={gifBoardOpen}
        onClose={() => setGifBoardOpen(false)}
        onSelectGif={(filename) => {
          onSendGif?.(filename);
          setGifBoardOpen(false);
        }}
      />
    </div>
  );
};
