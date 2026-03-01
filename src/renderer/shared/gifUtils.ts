/**
 * Shared GIF URL helpers and host lists for embed/direct-GIF detection.
 * Used by MessageList (chat embeds, favorites) and consistent with GifBoard/Klipy.
 */

/** Hosts that we treat as embed GIF links (Tenor, Giphy, Klipy). */
export const EMBED_GIF_HOSTS = [
  'tenor.com',
  'www.tenor.com',
  'giphy.com',
  'www.giphy.com',
  'media.giphy.com',
  'static.klipy.com',
  'klipy.com',
  'www.klipy.com',
] as const;

export function getGifUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True if URL path or query ends with .gif */
export function isGifUrl(url: string): boolean {
  return /\.gif(\?|$)/i.test(url);
}

/** True if URL is from a known embed GIF provider (Tenor, Giphy, Klipy). */
export function isEmbedGifLink(url: string | undefined): boolean {
  if (!url) return false;
  const host = getGifUrlHost(url);
  return host !== null && (EMBED_GIF_HOSTS as readonly string[]).includes(host);
}

/** True if URL is a direct GIF (.gif file) or Klipy static URL (embed as image-only, hide link). */
export function isDirectGifUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (isGifUrl(url)) return true;
  const host = getGifUrlHost(url);
  return host === 'static.klipy.com' || host === 'klipy.com' || host === 'www.klipy.com';
}
