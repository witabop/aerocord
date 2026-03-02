import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';
import type { MessageVM, UserVM } from '../../shared/types';
import { EmojiBoard } from './EmojiBoard';
import { GifBoard } from './GifBoard';

function trayIconForStatus(status: string): string {
  switch (status) {
    case 'Online': return 'Active.ico';
    case 'Idle': return 'Idle.ico';
    case 'DoNotDisturb': return 'Dnd.ico';
    case 'Invisible':
    case 'Offline':
    default: return 'Offline.ico';
  }
}

/** Segment for the input: plain text or a mention (stored as <@id> when sending). */
type InputSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; userId: string; displayName: string };

function segmentsToRaw(segments: InputSegment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.value : `<@${s.userId}>`))
    .join('');
}

function rawToSegments(raw: string, nameLookup: Map<string, string>): InputSegment[] {
  if (!raw) return [{ type: 'text', value: '' }];
  const parts = raw.split(/(<@\d+>)/g);
  const segments: InputSegment[] = [];
  for (const p of parts) {
    const m = p.match(/^<@(\d+)>$/);
    if (m) {
      const userId = m[1];
      segments.push({
        type: 'mention',
        userId,
        displayName: nameLookup.get(userId) ?? 'Unknown',
      });
    } else if (p.length) {
      segments.push({ type: 'text', value: p });
    }
  }
  if (segments.length === 0) return [{ type: 'text', value: '' }];
  return segments;
}

/** Write segments to the contenteditable (no React). Use after programmatic insert only. */
function writeSegmentsToEditable(editable: HTMLDivElement, segments: InputSegment[]): void {
  editable.innerHTML = '';
  for (const s of segments) {
    if (s.type === 'text') {
      editable.appendChild(document.createTextNode(s.value));
    } else {
      const span = document.createElement('span');
      span.setAttribute('data-user-id', s.userId);
      span.setAttribute('data-display-name', s.displayName);
      span.className = 'chat-mention-badge';
      span.contentEditable = 'false';
      span.textContent = `@${s.displayName}`;
      editable.appendChild(span);
    }
  }
}

function getSegmentsFromEditable(editable: HTMLDivElement): InputSegment[] {
  const segments: InputSegment[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const v = node.textContent ?? '';
      if (v.length) segments.push({ type: 'text', value: v });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const userId = el.getAttribute?.('data-user-id');
    const displayName = el.getAttribute?.('data-display-name');
    if (userId != null && (el.classList?.contains('chat-mention-badge') || displayName != null)) {
      segments.push({
        type: 'mention',
        userId,
        displayName: displayName ?? el.textContent?.replace(/^@/, '') ?? 'Unknown',
      });
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  };
  for (let i = 0; i < editable.childNodes.length; i++) walk(editable.childNodes[i]);
  if (segments.length === 0) return [{ type: 'text', value: '' }];
  return segments;
}

function getTextBeforeCursor(editable: HTMLDivElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  if (!editable.contains(sel.anchorNode)) return '';
  const range = sel.getRangeAt(0).cloneRange();
  const endNode = range.startContainer;
  const endOffset = range.startOffset;
  range.setStart(editable, 0);
  range.setEnd(endNode, endOffset);
  return range.toString();
}

function nodeDisplayLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').length;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.getAttribute?.('data-user-id') != null) {
      return (el.textContent ?? '').length + 1;
    }
    let sum = 0;
    for (let i = 0; i < node.childNodes.length; i++) {
      sum += nodeDisplayLength(node.childNodes[i]);
    }
    return sum;
  }
  return 0;
}

function getCursorOffset(editable: HTMLDivElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const targetNode = sel.getRangeAt(0).startContainer;
  const targetOffset = sel.getRangeAt(0).startOffset;
  let count = 0;
  if (targetNode === editable) {
    for (let i = 0; i < targetOffset && i < editable.childNodes.length; i++) {
      count += nodeDisplayLength(editable.childNodes[i]);
    }
    return count;
  }
  const walk = (node: Node): boolean => {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        count += Math.min(targetOffset, (node.textContent ?? '').length);
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += (node.textContent ?? '').length;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.getAttribute?.('data-user-id') != null) {
        count += (el.textContent ?? '').length + 1;
        return false;
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  };
  for (let i = 0; i < editable.childNodes.length; i++) {
    if (walk(editable.childNodes[i])) break;
  }
  return count;
}

function setCursorOffset(editable: HTMLDivElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let count = 0;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (count + len >= offset) {
        const range = document.createRange();
        range.setStart(node, offset - count);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      count += len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.getAttribute?.('data-user-id') != null) {
        const len = (el.textContent ?? '').length + 1; // +1 for @
        if (count + len >= offset) {
          const range = document.createRange();
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
        count += len;
        return false;
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  };
  for (let i = 0; i < editable.childNodes.length; i++) {
    if (walk(editable.childNodes[i])) return;
  }
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function segmentDisplayLength(s: InputSegment): number {
  return s.type === 'text' ? s.value.length : s.displayName.length + 1;
}

function insertAtOffset(segments: InputSegment[], offset: number, item: InputSegment): InputSegment[] {
  let pos = 0;
  const out: InputSegment[] = [];
  for (const s of segments) {
    const len = segmentDisplayLength(s);
    if (pos + len >= offset && offset >= pos) {
      if (s.type === 'text') {
        const before = s.value.slice(0, offset - pos);
        const after = s.value.slice(offset - pos);
        if (before.length) out.push({ type: 'text', value: before });
        out.push(item);
        if (after.length) out.push({ type: 'text', value: after });
      } else {
        out.push(s);
        out.push(item);
      }
      pos += len;
      for (let i = segments.indexOf(s) + 1; i < segments.length; i++) out.push(segments[i]);
      return out;
    }
    pos += len;
    out.push(s);
  }
  out.push(item);
  return out;
}

function removeRange(segments: InputSegment[], from: number, to: number): InputSegment[] {
  let pos = 0;
  const out: InputSegment[] = [];
  for (const s of segments) {
    const len = segmentDisplayLength(s);
    if (to <= pos || from >= pos + len) {
      if (from >= pos + len) {
        out.push(s);
      } else if (to <= pos) {
        out.push(s);
      }
      pos += len;
      continue;
    }
    if (s.type === 'text') {
      const segStart = pos;
      const segEnd = pos + len;
      const cutStart = Math.max(0, from - segStart);
      const cutEnd = Math.min(len, to - segStart);
      const before = s.value.slice(0, cutStart);
      const after = s.value.slice(cutEnd);
      if (before.length) out.push({ type: 'text', value: before });
      if (after.length) out.push({ type: 'text', value: after });
    } else {
      if (from > pos || to < pos + len) out.push(s);
    }
    pos += len;
  }
  return out.length ? out : [{ type: 'text', value: '' }];
}

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
  channelId?: string;
}

interface MentionSuggestion {
  id: string;
  name: string;
  username: string;
  avatar: string;
  status?: string;
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
  channelId,
}) => {
  const [segments, setSegments] = useState<InputSegment[]>([{ type: 'text', value: '' }]);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const [emojiBoardOpen, setEmojiBoardOpen] = useState(false);
  const [gifBoardOpen, setGifBoardOpen] = useState(false);
  const [replyCancelHover, setReplyCancelHover] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  const pendingCursorRef = useRef<number | null>(null);
  const lastTypingRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameLookup = useMemo(() => {
    const m = new Map<string, string>();
    members?.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [members]);

  const allMembers = useMemo(() => {
    if (!members) return [];
    return members.map(m => ({
      id: m.id,
      name: m.name,
      username: m.username,
      avatar: m.avatar,
      status: m.presence?.status ?? 'Offline',
    }));
  }, [members]);

  const updateMentionQueryFromEditable = useCallback(() => {
    const editable = editableRef.current;
    if (!editable) return;
    const sel = window.getSelection();
    if (!sel) {
      setMentionQuery(null);
      setSuggestions([]);
      return;
    }
    const segments = getSegmentsFromEditable(editable);
    const displayString = segments
      .map((s) => (s.type === 'text' ? s.value : `@${s.displayName}`))
      .join('');
    let cursorOffset = getCursorOffset(editable);
    if (!editable.contains(sel.anchorNode)) {
      if (document.activeElement === editable) {
        cursorOffset = displayString.length;
      } else {
        setMentionQuery(null);
        setSuggestions([]);
        return;
      }
    }
    const beforeCursor = displayString.substring(0, cursorOffset);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1) {
      setMentionQuery(null);
      setSuggestions([]);
      if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
      return;
    }
    const charBefore = atIndex > 0 ? beforeCursor[atIndex - 1] : '';
    const isAfterSpaceOrNewline = charBefore === ' ' || charBefore === '\n';
    const isAfterAt = charBefore === '@';
    const textBeforeThisAt = beforeCursor.substring(0, atIndex);
    const isRightAfterMention = /@\w+$/.test(textBeforeThisAt);
    const allowedBefore = charBefore === '' || isAfterSpaceOrNewline || isAfterAt || isRightAfterMention;
    if (!allowedBefore) {
      setMentionQuery(null);
      setSuggestions([]);
      if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
      return;
    }
    const query = beforeCursor.substring(atIndex + 1);
    if (query.includes(' ') && query.length > 20) {
      setMentionQuery(null);
      setSuggestions([]);
      if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
      return;
    }
    setMentionQuery({ start: atIndex, query });
    const lower = query.toLowerCase();
    const filtered = allMembers.filter(m =>
      m.name.toLowerCase().includes(lower) || m.username.toLowerCase().includes(lower)
    ).slice(0, 8);
    setSuggestions(filtered);
    setSelectedSuggestion(0);

    if (filtered.length === 0 && query.length >= 1 && channelId) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        window.aerocord.channels.searchMembers(channelId, query, 8).then((results) => {
          if (results.length > 0) {
            setSuggestions(results.map(m => ({
              id: m.id,
              name: m.name,
              username: m.username,
              avatar: m.avatar,
              status: m.presence?.status ?? 'Offline',
            })));
            setSelectedSuggestion(0);
          }
        }).catch(() => {});
      }, 300);
    } else if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, [allMembers, channelId]);

  const insertMention = useCallback((user: MentionSuggestion) => {
    const editable = editableRef.current;
    if (!mentionQuery || !editable) return;
    const currentSegments = getSegmentsFromEditable(editable);
    const deleteEnd = mentionQuery.start + 1 + mentionQuery.query.length;
    let newSegments = removeRange(currentSegments, mentionQuery.start, deleteEnd);
    newSegments = insertAtOffset(newSegments, mentionQuery.start, {
      type: 'mention',
      userId: user.id,
      displayName: user.name,
    });
    setSegments(newSegments);
    setSuggestions([]);
    setMentionQuery(null);
    pendingCursorRef.current = mentionQuery.start + 1 + user.name.length;
  }, [mentionQuery]);

  const handleEmojiSelect = useCallback((code: string) => {
    const editable = editableRef.current;
    if (!editable) return;
    const cursorOffset = getCursorOffset(editable);
    const space = cursorOffset > 0 ? ' ' : '';
    const trailingSpace = ' ';
    const toInsert = space + code + trailingSpace;
    const newSegments = insertAtOffset(segments, cursorOffset, { type: 'text', value: toInsert });
    setSegments(newSegments);
    setEmojiBoardOpen(false);
    pendingCursorRef.current = cursorOffset + toInsert.length;
  }, [segments]);

  const handleSend = useCallback(() => {
    const raw = segmentsToRaw(segments).trim();
    const paths = pendingAttachments.map((a) => a.path);
    if (!raw && paths.length === 0) return;
    onSend(raw || '\u200B', paths.length ? paths : undefined);
    setSegments([{ type: 'text', value: '' }]);
    setSuggestions([]);
    setMentionQuery(null);
    onClearAttachments?.();
    const editable = editableRef.current;
    if (editable) {
      writeSegmentsToEditable(editable, [{ type: 'text', value: '' }]);
      editable.style.height = 'auto';
    }
  }, [segments, pendingAttachments, onSend, onClearAttachments]);

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
    if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setTimeout(() => updateMentionQueryFromEditable(), 0);
    }
  }, [handleSend, suggestions, selectedSuggestion, insertMention, updateMentionQueryFromEditable]);

  const handleEditableInput = useCallback(() => {
    const editable = editableRef.current;
    if (!editable) return;
    const newSegments = getSegmentsFromEditable(editable);
    setSegments(newSegments);
    updateMentionQueryFromEditable();

    editable.style.height = 'auto';
    editable.style.height = Math.min(editable.scrollHeight, 80) + 'px';

    const now = Date.now();
    if (now - lastTypingRef.current > 5000) {
      lastTypingRef.current = now;
      onTyping();
    }
  }, [onTyping, updateMentionQueryFromEditable]);

  const handleEditableClick = useCallback(() => {
    setTimeout(updateMentionQueryFromEditable, 0);
  }, [updateMentionQueryFromEditable]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length && onAddAttachments && !disabled) {
        e.preventDefault();
        const maxSize = maxFileSizeBytes;
        const paths: string[] = [];
        (async () => {
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
          if (paths.length) onAddAttachments(paths);
        })();
        return;
      }
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text && editableRef.current) {
        const cursorOffset = getCursorOffset(editableRef.current);
        const newSegments = insertAtOffset(segments, cursorOffset, { type: 'text', value: text });
        setSegments(newSegments);
        pendingCursorRef.current = cursorOffset + text.length;
      }
    },
    [segments, onAddAttachments, onUploadError, disabled, maxFileSizeBytes]
  );

  useEffect(() => {
    if (replyTarget) {
      editableRef.current?.focus();
    }
  }, [replyTarget]);

  useEffect(() => {
    const pending = pendingCursorRef.current;
    const editable = editableRef.current;
    if (pending !== null && editable) {
      pendingCursorRef.current = null;
      writeSegmentsToEditable(editable, segments);
      setCursorOffset(editable, pending);
    }
  });

  const inputAreaRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={inputAreaRef} className="chat-input-area no-drag">
      {replyTarget && (
        <div className="chat-reply-bar">
          <span>Replying to <strong>{replyTarget.author.name}</strong></span>
          <button
            type="button"
            className="chat-reply-cancel"
            onClick={onCancelReply}
            onMouseEnter={() => setReplyCancelHover(true)}
            onMouseLeave={() => setReplyCancelHover(false)}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <img src={replyCancelHover ? closeIconHoverUrl : closeIconUrl} alt="" draggable={false} />
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
              <img
                className="mention-autocomplete-status"
                src={assetUrl('images', 'tray', trayIconForStatus(s.status ?? 'Offline'))}
                alt=""
                draggable={false}
              />
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
        <div
          ref={editableRef}
          className="chat-input-text chat-input-editable"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleEditableInput}
          onKeyDown={handleKeyDown}
          onClick={handleEditableClick}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
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
        anchorRef={inputAreaRef}
        onClose={() => setEmojiBoardOpen(false)}
        onSelect={handleEmojiSelect}
      />

      <GifBoard
        visible={gifBoardOpen}
        anchorRef={inputAreaRef}
        onClose={() => setGifBoardOpen(false)}
        onSelectGif={(filename) => {
          onSendGif?.(filename);
          setGifBoardOpen(false);
        }}
      />
    </div>
  );
};
