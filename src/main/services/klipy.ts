/**
 * Klipy GIF API client. Cycles between three API keys so no key is used back-to-back.
 * Keys are read from process.env (KLIPY_API_KEY_1, KLIPY_API_KEY_2, KLIPY_API_KEY_3).
 */

const KLIPY_BASE = 'https://api.klipy.com/api/v1';
const DEFAULT_LIMIT = 100;
const TRENDING_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

let trendingCache: { data: KlipyGifItem[]; timestamp: number } | null = null;

function getKeys(): string[] {
  const keys = [
    process.env.KLIPY_API_KEY_1,
    process.env.KLIPY_API_KEY_2,
    process.env.KLIPY_API_KEY_3,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
  return keys;
}

export function hasApiKeys(): boolean {
  return getKeys().length > 0;
}

let lastUsedKeyIndex = -1;

function getNextKey(): string | null {
  const keys = getKeys();
  if (keys.length === 0) {
    console.warn('[Klipy] No API keys found. Set KLIPY_API_KEY_1, KLIPY_API_KEY_2, KLIPY_API_KEY_3 in .env (project root).');
    return null;
  }
  lastUsedKeyIndex = (lastUsedKeyIndex + 1) % keys.length;
  return keys[lastUsedKeyIndex];
}

export interface KlipyGifItem {
  id: string;
  /** URL to display/embed (prefer tinygif or gif for size) */
  url: string;
  /** Full-size GIF URL for sending */
  fullUrl?: string;
}

/** Klipy API item: has id, file.{hd,md,sm,xs}.gif.url */
function normalizeResult(item: any): KlipyGifItem | null {
  if (!item?.id) return null;
  const file = item.file;
  if (!file || typeof file !== 'object') return null;
  const sm = file.sm?.gif?.url;
  const xs = file.xs?.gif?.url;
  const md = file.md?.gif?.url;
  const hd = file.hd?.gif?.url;
  const url = sm ?? xs ?? md ?? hd;
  const fullUrl = hd ?? md ?? url;
  if (!url) return null;
  return { id: String(item.id), url, fullUrl };
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

/** Klipy returns { result: true, data: { data: [...items], current_page, per_page, ... } } */
function parseResponse(data: any): KlipyGifItem[] {
  const list = data?.data?.data;
  const results = Array.isArray(list) ? list : toArray(data?.result ?? data?.results ?? data?.data ?? data);
  const out: KlipyGifItem[] = [];
  for (const item of results) {
    const n = normalizeResult(item);
    if (n) out.push(n);
  }
  return out;
}

export async function fetchTrendingGifs(limit: number = DEFAULT_LIMIT): Promise<KlipyGifItem[]> {
  if (trendingCache && Date.now() - trendingCache.timestamp < TRENDING_CACHE_MS) {
    return trendingCache.data;
  }
  const key = getNextKey();
  if (!key) return [];
  const page = 1;
  const per_page = limit;
  const locale = 'en';
  const url = `${KLIPY_BASE}/${key}/gifs/trending?page=${page}&per_page=${per_page}&locale=${locale}`;
  console.log('[Klipy] Fetching trending:', url.replace(key, '***'));
  try {
    const myHeaders = new Headers();
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };
    const res = await fetch(url, requestOptions);
    const resultText = await res.text();
    if (!res.ok) {
      console.warn('[Klipy] Trending failed:', res.status);
      return [];
    }
    const data = JSON.parse(resultText);
    const out = parseResponse(data);
    trendingCache = { data: out, timestamp: Date.now() };
    console.log('[Klipy] Trending result:', out.length, 'gifs (cached 24h)');
    return out;
  } catch (err) {
    console.log('[Klipy] error', err);
    return [];
  }
}

export async function searchGifs(q: string, limit: number = DEFAULT_LIMIT): Promise<KlipyGifItem[]> {
  const key = getNextKey();
  if (!key) return [];
  const encoded = encodeURIComponent(q.trim());
  if (!encoded) return [];
  const url = `${KLIPY_BASE}/${key}/gifs/search?q=${encoded}&page=1&per_page=${limit}`;
  console.log('[Klipy] Search:', q.trim(), '->', url.replace(key, '***'));
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[Klipy] Search failed:', res.status, data);
      return [];
    }
    const out = parseResponse(data);
    console.log('[Klipy] Search result:', out.length, 'gifs');
    return out;
  } catch (err) {
    console.warn('[Klipy] Search error:', err);
    return [];
  }
}
