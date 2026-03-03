/**
 * Renders chat message content as sanitized Markdown (marked + DOMPurify),
 * with Discord-style mentions and emoji placeholders preserved and restored.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { EMOJI_CODE_TO_FILE } from './emojiCodes';

const MENTION_USER_PREFIX = '\uE000M';
const MENTION_USER_SUFFIX = '\uE001';
const MENTION_ROLE_PREFIX = '\uE000R';
const MENTION_ROLE_SUFFIX = '\uE001';
const EMOJI_PREFIX = '\uE000E';
const EMOJI_SUFFIX = '\uE001';

function makeMentionUserPlaceholder(id: string): string {
  return `${MENTION_USER_PREFIX}${id}${MENTION_USER_SUFFIX}`;
}

function makeMentionRolePlaceholder(id: string): string {
  return `${MENTION_ROLE_PREFIX}${id}${MENTION_ROLE_SUFFIX}`;
}

function makeEmojiPlaceholder(code: string): string {
  return `${EMOJI_PREFIX}${code}${EMOJI_SUFFIX}`;
}

/** Escape special regex characters in a string for use in RegExp */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MarkdownOptions {
  mentions?: { id: string; name: string }[];
  mentionRoles?: { id: string; name: string }[];
  /** Return URL for emoji image, or empty string to leave code as text */
  getEmojiImageUrl?: (code: string) => string;
}

/**
 * Convert message content to sanitized HTML: markdown (marked) + DOMPurify,
 * with mentions and emoji restored. Use in a div with dangerouslySetInnerHTML
 * and handle link/mention clicks via delegation.
 */
export function contentToMarkdownHtml(
  content: string,
  options: MarkdownOptions = {}
): string {
  const { mentions = [], mentionRoles = [], getEmojiImageUrl } = options;
  let text = content;

  // 1) Replace Discord mentions with placeholders (so markdown doesn't alter them)
  for (const m of mentions) {
    const placeholder = makeMentionUserPlaceholder(m.id);
    const escapedName = escapeRe(m.name);
    text = text.replace(new RegExp(`<@!?${escapeRe(m.id)}>`, 'g'), placeholder);
    text = text.replace(new RegExp(`@${escapedName}\\b`, 'g'), placeholder);
  }
  for (const r of mentionRoles) {
    const placeholder = makeMentionRolePlaceholder(r.id);
    const escapedName = escapeRe(r.name);
    text = text.replace(new RegExp(`<@&${escapeRe(r.id)}>`, 'g'), placeholder);
    text = text.replace(new RegExp(`@${escapedName}\\b`, 'g'), placeholder);
  }

  // 2) Replace emoji codes with placeholders (so markdown doesn't alter them)
  const emojiCodes = Object.keys(EMOJI_CODE_TO_FILE);
  for (const code of emojiCodes) {
    text = text.replace(new RegExp(escapeRe(code), 'g'), makeEmojiPlaceholder(code));
  }

  // 3) Markdown to HTML
  marked.setOptions({ gfm: true, breaks: true });
  const rawHtml = marked(text, { async: false });
  let html = typeof rawHtml === 'string' ? rawHtml : '';

  // 4) Sanitize (allow only safe tags/attrs; allow data-user-id/data-role-id for mentions)
  html = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'ul', 'ol', 'li',
      'a', 'span', 'img', 'blockquote', 'h1', 'h2', 'h3',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class', 'src', 'alt', 'title',
      'data-user-id', 'data-role-id', 'draggable',
    ],
    ADD_ATTR: ['target', 'rel'],
  });

  // Force external links to open in new tab (marked doesn't add target/rel)
  html = html.replace(/<a href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');

  // 5) Restore mention placeholders as safe HTML
  const userPlaceholderRe = new RegExp(
    `${escapeRe(MENTION_USER_PREFIX)}(\\d+)${escapeRe(MENTION_USER_SUFFIX)}`,
    'g'
  );
  html = html.replace(userPlaceholderRe, (_, id: string) => {
    const name = mentions.find((m) => m.id === id)?.name ?? 'Unknown';
    return `<span class="chat-mention-badge" data-user-id="${escapeHtml(id)}">@${escapeHtml(name)}</span>`;
  });
  const rolePlaceholderRe = new RegExp(
    `${escapeRe(MENTION_ROLE_PREFIX)}(\\d+)${escapeRe(MENTION_ROLE_SUFFIX)}`,
    'g'
  );
  html = html.replace(rolePlaceholderRe, (_, id: string) => {
    const name = mentionRoles.find((r) => r.id === id)?.name ?? 'Unknown';
    return `<span class="chat-mention-badge" data-role-id="${escapeHtml(id)}">@${escapeHtml(name)}</span>`;
  });

  // 6) Restore emoji placeholders as img or plain text
  const emojiPlaceholderRe = new RegExp(
    `${escapeRe(EMOJI_PREFIX)}([^\uE001]+)${escapeRe(EMOJI_SUFFIX)}`,
    'g'
  );
  html = html.replace(emojiPlaceholderRe, (_, code: string) => {
    const fullCode = code; // already e.g. ':smile:' from placeholder
    const url = getEmojiImageUrl?.(fullCode) ?? '';
    if (url) {
      return `<img class="chat-message-emoji" src="${escapeHtml(url)}" alt="${escapeHtml(fullCode)}" title="${escapeHtml(fullCode)}" draggable="false" />`;
    }
    return escapeHtml(fullCode);
  });

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
