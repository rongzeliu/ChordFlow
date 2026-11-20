import { GoogleGenAI, Type } from '@google/genai';
import { parsePnwChordsHtml } from './pnwChords';
import { searchCatalogTracks } from './spotify';
import { decodeHtmlEntities, detectSupportedImportUrl } from './textCleaner';
import type { ImportedSongResponse, SongSearchResult } from './types';
import { parseUltimateGuitarHtml } from './ultimateGuitar';
import { parseWorshipTogetherHtml } from './worshipTogether';
import {
  extractYouTubeChordsWithGemini,
  formatGeminiYouTubeSheet,
  MissingGeminiApiKeyError,
  type GeminiYouTubeChordSheet,
} from './youtube';

interface WpPostItem {
  link?: string;
  title?: {
    rendered?: string;
  };
}

function normalizeComparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
    signal: AbortSignal.timeout(5000),
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
 * Deduplicates `SongSearchResult` items (merging catalog album artwork with direct chord sheets
 * when they represent the same song) and ranks them by relevance to `query`.
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

  const byKey = new Map<string, SongSearchResult>();

  for (const item of items) {
    const detected = detectSupportedImportUrl(item.url);
    const isCatalog = item.provider === 'spotify' || item.provider === 'itunes';
    if (!detected && !isCatalog) continue;

    const normalizedItem: SongSearchResult = detected
      ? { ...item, url: detected.url, provider: detected.provider }
      : item;

    const songKey = `${normalizeComparable(normalizedItem.title)}::${normalizeComparable(
      normalizedItem.artist,
    )}`;
    const dedupeKey = isCatalog ? songKey : normalizedItem.url;

    const existingBySong = byKey.get(songKey);
    if (existingBySong && !isCatalog && normalizedItem.provider === 'pnwchords') {
      // Upgrade a catalog entry with direct PNW Chords URL while keeping album artwork
      byKey.set(songKey, {
        ...normalizedItem,
        album: existingBySong.album,
        artworkUrl: existingBySong.artworkUrl,
      });
      continue;
    }

    if (!byKey.has(dedupeKey)) {
      byKey.set(dedupeKey, normalizedItem);
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
    if (item.provider === 'pnwchords') score += 2;
    if (item.provider === 'spotify' || item.provider === 'itunes') score += 1.5;
    if (item.provider === 'ultimate-guitar' || item.provider === 'worshiptogether') score += 1;
    return score;
  };

  return Array.from(byKey.values())
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, 8);
}

/**
 * Searches canonical tracks via Spotify (or Apple iTunes fallback) plus PNW Chords in parallel
 * so users get instant, accurate Song Title + Artist autocomplete suggestions.
 */
export async function searchSongsAcrossProviders(query: string): Promise<SongSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const settled = await Promise.allSettled([
    searchCatalogTracks(clean, 6),
    searchPnwChords(clean),
  ]);

  const combined: SongSearchResult[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      combined.push(...res.value);
    }
  }

  return rankAndDedupeSearchResults(combined, clean);
}

/**
 * Generates an accurate guitar chord and lyric sheet for a canonical `title` + `artist`
 * using Gemini (`gemini-4.0-hydrogen`).
 */
export async function generateSongChordsWithGemini(
  title: string,
  artist: string,
  sourceUrl = '',
): Promise<ImportedSongResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingGeminiApiKeyError();
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are an expert guitarist and music transcriber for ChordFlow.
Provide a complete, accurate guitar chord and lyric sheet for the song "${title}" by "${artist}".

Follow these strict rules:
1. Identify the song's standard guitar Key (shape key), Capo fret (0 to 11), and Tuning (default "E A D G B E").
2. Organize the song into clear sections such as "Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro".
3. For each line in a section:
   - Provide standard guitar chord symbols in \`chords\` (e.g. G, D/F#, Em7, Cadd9, Amaj7, Gsus4, F#m7) padded with spaces so each chord sits above the exact word/syllable where the chord changes in \`lyrics\`.
   - For instrumental lines (such as Intro/Outro), provide the chord progression in \`chords\` (e.g. "G  D/F#  Em7  C") and leave \`lyrics\` empty.
   - Never put non-chord words on a chord line.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4.0-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          artist: { type: Type.STRING },
          key: { type: Type.STRING },
          capo: { type: Type.INTEGER },
          tuning: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                lines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      chords: { type: Type.STRING },
                      lyrics: { type: Type.STRING },
                    },
                  },
                },
              },
              required: ['label', 'lines'],
            },
          },
        },
        required: ['title', 'artist', 'sections'],
      },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error(`Gemini did not return a chord sheet for "${title}" by ${artist}.`);
  }

  const parsed = JSON.parse(text) as GeminiYouTubeChordSheet;
  const formatted = formatGeminiYouTubeSheet(
    {
      ...parsed,
      title: parsed.title || title,
      artist: parsed.artist || artist,
    },
    sourceUrl || `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
  );

  return {
    ...formatted,
    provider: 'gemini',
  };
}

async function fetchHtmlForImport(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Resolves a canonical catalog track (`title` + `artist`, and optional `url`) into a full
 * `ImportedSongResponse`:
 *  1. Checks for a direct or matching PNW Chords sheet first.
 *  2. Checks direct supported chord URLs (WorshipTogether / Ultimate Guitar / YouTube).
 *  3. Falls back to Gemini chord & lyric generation so selecting any song in the search bar succeeds.
 */
export async function resolveCatalogSongChordSheet(params: {
  title: string;
  artist: string;
  url?: string;
}): Promise<ImportedSongResponse> {
  const title = params.title.trim();
  const artist = params.artist.trim();
  const rawUrl = params.url?.trim() || '';
  const detected = rawUrl ? detectSupportedImportUrl(rawUrl) : null;

  // 1. Direct supported URL if provided
  if (detected) {
    if (detected.provider === 'youtube') {
      return extractYouTubeChordsWithGemini(detected.url);
    }
    const html = await fetchHtmlForImport(detected.url);
    if (html) {
      try {
        if (detected.provider === 'pnwchords') return parsePnwChordsHtml(html, detected.url);
        if (detected.provider === 'worshiptogether')
          return parseWorshipTogetherHtml(html, detected.url);
        if (detected.provider === 'ultimate-guitar')
          return parseUltimateGuitarHtml(html, detected.url);
      } catch {
        // Fall through to PNW Chords search / Gemini generation
      }
    }
  }

  // 2. Check PNW Chords for an exact title match
  try {
    const normTargetTitle = normalizeComparable(title);
    const pnwCandidates = await searchPnwChords(`${title} ${artist}`);
    const match =
      pnwCandidates.find((c) => normalizeComparable(c.title) === normTargetTitle) ??
      pnwCandidates.find(
        (c) =>
          normalizeComparable(c.title).includes(normTargetTitle) ||
          normTargetTitle.includes(normalizeComparable(c.title)),
      );
    if (match) {
      const html = await fetchHtmlForImport(match.url);
      if (html) {
        return parsePnwChordsHtml(html, match.url);
      }
    }
  } catch {
    // Fall through to Gemini generation
  }

  // 3. Generate complete chord & lyric sheet via Gemini
  return generateSongChordsWithGemini(title, artist, rawUrl);
}
