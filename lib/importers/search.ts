import { GoogleGenAI } from '@google/genai';
import { decodeHtmlEntities, detectSupportedImportUrl } from './textCleaner';
import type { SongSearchResult } from './types';

interface WpPostItem {
  link?: string;
  title?: {
    rendered?: string;
  };
}

/**
 * Parses a WordPress REST API `/wp-json/wp/v2/posts` response array from PNW Chords
 * into normalized `SongSearchResult` items.
 */
export function parsePnwChordsWpSearchResults(posts: unknown): SongSearchResult[] {
  if (!Array.isArray(posts)) return [];
  const results: SongSearchResult[] = [];

  for (const item of posts as WpPostItem[]) {
    const rawLink = typeof item?.link === 'string' ? item.link.trim() : '';
    const detected = detectSupportedImportUrl(rawLink);
    if (!detected || detected.provider !== 'pnwchords') continue;

    const rawTitle = decodeHtmlEntities(
      (item?.title?.rendered ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s*[-–—|]\s*pnwchords(?:\.com)?\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    if (!rawTitle) continue;

    const parts = rawTitle.split(/\s+[–—-]\s+/);
    const title = parts[0]?.trim() || rawTitle;
    const artist = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : 'PNW Chords';

    results.push({
      title,
      artist,
      url: detected.url,
      provider: 'pnwchords',
    });
  }

  return results;
}

/**
 * Queries PNW Chords' WordPress REST API for matching worship/contemporary chord sheets.
 */
export async function searchPnwChords(query: string): Promise<SongSearchResult[]> {
  const endpoint = `https://pnwchords.com/wp-json/wp/v2/posts?search=${encodeURIComponent(
    query,
  )}&per_page=5&_fields=title,link`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  return parsePnwChordsWpSearchResults(json);
}

/**
 * Extracts `SongSearchResult` entries from YouTube search HTML (`ytInitialData` `videoRenderer` objects).
 */
export function parseYouTubeSearchResultsHtml(html: string, maxResults = 4): SongSearchResult[] {
  const results: SongSearchResult[] = [];
  const seenIds = new Set<string>();

  const videoRegex =
    /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{6,20})"[\s\S]*?"title":(?:\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"\}\]|\{"simpleText":"((?:\\.|[^"\\])*)"\})/g;
  let m: RegExpExecArray | null;
  while ((m = videoRegex.exec(html)) && results.length < maxResults) {
    const videoId = m[1];
    if (!videoId || seenIds.has(videoId)) continue;
    seenIds.add(videoId);

    const rawTitle = (m[2] ?? m[3] ?? '')
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, '&')
      .replace(/\\\\/g, '\\')
      .trim();
    if (!rawTitle) continue;

    // Look ahead briefly after the title match for ownerText / longBylineText channel name
    const snippet = html.slice(m.index, m.index + 1800);
    const channelMatch =
      /"(?:ownerText|longBylineText)":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"/.exec(snippet);
    const channel = channelMatch?.[1]
      ? channelMatch[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&').trim()
      : 'YouTube';

    results.push({
      title: decodeHtmlEntities(rawTitle),
      artist: decodeHtmlEntities(channel),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      provider: 'youtube',
      subtitle: 'YouTube Video (AI Chord Extraction)',
    });
  }

  return results;
}

/**
 * Searches YouTube for `<query> guitar chords`, using the YouTube Data API v3 when `YOUTUBE_API_KEY`
 * is configured, or falling back to parsing YouTube's search page `ytInitialData`.
 */
export async function searchYouTubeChords(query: string): Promise<SongSearchResult[]> {
  const ytApiKey = process.env.YOUTUBE_API_KEY?.trim();
  const searchTerm = `${query} guitar chords`;

  if (ytApiKey) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=4&q=${encodeURIComponent(
      searchTerm,
    )}&key=${encodeURIComponent(ytApiKey)}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as {
        items?: {
          id?: { videoId?: string };
          snippet?: { title?: string; channelTitle?: string };
        }[];
      };
      const items = data.items ?? [];
      const out: SongSearchResult[] = [];
      for (const item of items) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;
        out.push({
          title: decodeHtmlEntities(item.snippet?.title || query),
          artist: decodeHtmlEntities(item.snippet?.channelTitle || 'YouTube'),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          provider: 'youtube',
          subtitle: 'YouTube Video (AI Chord Extraction)',
        });
      }
      if (out.length > 0) return out;
    }
  }

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    searchTerm,
  )}&hl=en`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();
  return parseYouTubeSearchResultsHtml(html, 4);
}

/**
 * Uses Gemini with Google Search grounding (when `GEMINI_API_KEY` is configured) to discover
 * direct Ultimate Guitar (`tabs.ultimate-guitar.com/tab/...`) and WorshipTogether
 * (`worshiptogether.com/songs/...`) chord sheet links.
 */
export async function searchGroundedChordSites(query: string): Promise<SongSearchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Find direct guitar chord sheet URLs on tabs.ultimate-guitar.com, pnwchords.com, or worshiptogether.com for "${query}". Return a JSON array of objects with fields: title, artist, url.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const results: SongSearchResult[] = [];
  const seenUrls = new Set<string>();

  const addCandidate = (title: string, artist: string, rawUrl: string) => {
    const detected = detectSupportedImportUrl(rawUrl);
    if (!detected || seenUrls.has(detected.url)) return;
    seenUrls.add(detected.url);
    results.push({
      title: title.trim() || query,
      artist: artist.trim() || 'Chord Sheet',
      url: detected.url,
      provider: detected.provider,
    });
  };

  // 1. Inspect grounding chunks if present
  const chunks =
    (
      response.candidates?.[0]?.groundingMetadata as
        | { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
        | undefined
    )?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    const webTitle = chunk.web?.title || query;
    if (uri) {
      const cleaned = webTitle
        .replace(/\s*[-|]\s*(?:Ultimate[- ]Guitar|Worship\s*Together|pnwchords).*$/i, '')
        .trim();
      const parts = cleaned.split(/\s+(?:by|[-–—])\s+/i);
      addCandidate(parts[0] || cleaned, parts[1] || '', uri);
    }
  }

  // 2. Parse any JSON array or URLs in the text response
  const text = response.text ?? '';
  const jsonBlockMatch = /\[[\s\S]*\]/.exec(text);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[0]) as {
        title?: string;
        artist?: string;
        url?: string;
      }[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.url) {
            addCandidate(item.title || query, item.artist || '', item.url);
          }
        }
      }
    } catch {
      // Ignore malformed JSON snippet
    }
  }

  return results.slice(0, 5);
}

/**
 * Deduplicates `SongSearchResult` items by normalized URL and ranks them by relevance to `query`.
 */
export function rankAndDedupeSearchResults(
  items: SongSearchResult[],
  query: string,
): SongSearchResult[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  const byUrl = new Map<string, SongSearchResult>();
  for (const item of items) {
    const detected = detectSupportedImportUrl(item.url);
    if (!detected) continue;
    if (!byUrl.has(detected.url)) {
      byUrl.set(detected.url, { ...item, url: detected.url, provider: detected.provider });
    }
  }

  const scoreItem = (item: SongSearchResult): number => {
    const hayTitle = item.title.toLowerCase();
    const hayArtist = item.artist.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hayTitle.includes(tok)) score += 3;
      if (hayArtist.includes(tok)) score += 2;
    }
    // Prefer direct text chord sheets slightly ahead of video extraction when title matches equally
    if (item.provider === 'pnwchords') score += 1.5;
    if (item.provider === 'ultimate-guitar' || item.provider === 'worshiptogether') score += 1;
    return score;
  };

  return Array.from(byUrl.values())
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, 10);
}

/**
 * Searches across PNW Chords, YouTube, Ultimate Guitar, and WorshipTogether in parallel,
 * tolerating individual provider timeouts or errors gracefully.
 */
export async function searchSongsAcrossProviders(query: string): Promise<SongSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const settled = await Promise.allSettled([
    searchPnwChords(clean),
    searchYouTubeChords(clean),
    searchGroundedChordSites(clean),
  ]);

  const combined: SongSearchResult[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      combined.push(...res.value);
    }
  }

  return rankAndDedupeSearchResults(combined, clean);
}
