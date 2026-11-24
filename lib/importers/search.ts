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
  generateContentWithGeminiFallback,
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
 * Searches canonical tracks via Spotify (or Apple Music / iTunes fallback) so users get
 * accurate Song Title + Artist autocomplete suggestions. Chords are resolved only once a
 * track is selected (see `resolveCatalogSongChordSheet`).
 */
export async function searchSongsAcrossProviders(query: string): Promise<SongSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const settled = await Promise.allSettled([searchCatalogTracks(clean, 8)]);

  const combined: SongSearchResult[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      combined.push(...res.value);
    }
  }

  return rankAndDedupeSearchResults(combined, clean);
}

/**
 * Strips catalog decorations such as "(Live)", "[Remastered]", "- Radio Edit", or "feat. X"
 * from a Spotify / Apple Music track title so it matches chord-site song names.
 */
export function cleanCatalogTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, ' ')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the primary artist from a catalog artist string ("A, B & C feat. D" -> "A"). */
export function primaryCatalogArtist(artist: string): string {
  return (
    artist
      .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\band\b|\/)\s*/i)[0]
      ?.trim() || artist.trim()
  );
}

export interface UltimateGuitarSearchCandidate {
  title: string;
  artist: string;
  url: string;
  type: string;
  votes: number;
  rating: number;
}

interface UgSearchResultItem {
  song_name?: string;
  artist_name?: string;
  type?: string;
  tab_url?: string;
  votes?: number;
  rating?: number;
  marketing_type?: string;
}

/**
 * Parses an Ultimate Guitar search page (`/search.php`) and returns all free, text-based
 * "Chords" results (excluding Official / Pro / Tabs entries that cannot be imported).
 */
export function parseUltimateGuitarSearchHtml(html: string): UltimateGuitarSearchCandidate[] {
  const storeMatch =
    /<div[^>]*class="[^"]*\bjs-store\b[^"]*"[^>]*data-content="([^"]+)"/i.exec(html) ??
    /<div[^>]*data-content="([^"]+)"[^>]*class="[^"]*\bjs-store\b[^"]*"/i.exec(html);
  if (!storeMatch?.[1]) return [];

  let results: UgSearchResultItem[] = [];
  try {
    const parsed = JSON.parse(decodeHtmlEntities(storeMatch[1])) as {
      store?: { page?: { data?: { results?: UgSearchResultItem[] } } };
    };
    results = parsed?.store?.page?.data?.results ?? [];
  } catch {
    return [];
  }
  if (!Array.isArray(results)) return [];

  const candidates: UltimateGuitarSearchCandidate[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (item?.type !== 'Chords' || item.marketing_type) continue;
    const url = typeof item.tab_url === 'string' ? item.tab_url.trim() : '';
    const detected = detectSupportedImportUrl(url);
    if (!detected || detected.provider !== 'ultimate-guitar' || seen.has(detected.url)) continue;
    seen.add(detected.url);
    candidates.push({
      title: (item.song_name ?? '').trim(),
      artist: (item.artist_name ?? '').trim(),
      url: detected.url,
      type: item.type,
      votes: typeof item.votes === 'number' ? item.votes : 0,
      rating: typeof item.rating === 'number' ? item.rating : 0,
    });
  }
  return candidates;
}

/**
 * Ranks Ultimate Guitar chord candidates for a catalog `title` + `artist`. Only candidates whose
 * song name matches the title are kept; artist matches and highly-voted/rated versions rank first.
 */
export function rankUltimateGuitarCandidates(
  candidates: UltimateGuitarSearchCandidate[],
  title: string,
  artist: string,
): UltimateGuitarSearchCandidate[] {
  const normTitle = normalizeComparable(cleanCatalogTitle(title));
  const normArtist = normalizeComparable(primaryCatalogArtist(artist));
  const normFullArtist = normalizeComparable(artist);
  if (!normTitle) return [];

  const scored = candidates
    .map((c) => {
      const cTitle = normalizeComparable(c.title);
      const cArtist = normalizeComparable(c.artist);
      let score = 0;
      if (cTitle === normTitle) score += 100;
      else if (cTitle.includes(normTitle) || normTitle.includes(cTitle)) score += 50;
      else return null;

      if (normArtist && cArtist === normArtist) score += 60;
      else if (
        normArtist &&
        (cArtist.includes(normArtist) ||
          normArtist.includes(cArtist) ||
          normFullArtist.includes(cArtist))
      )
        score += 35;

      score += Math.log10(c.votes + 1) * 6 + c.rating;
      return { c, score };
    })
    .filter((x): x is { c: UltimateGuitarSearchCandidate; score: number } => x !== null);

  return scored.sort((a, b) => b.score - a.score).map((x) => x.c);
}

/** Searches Ultimate Guitar for free chord sheets matching a catalog track. */
export async function searchUltimateGuitarChords(
  title: string,
  artist: string,
): Promise<UltimateGuitarSearchCandidate[]> {
  const cleanTitle = cleanCatalogTitle(title) || title;
  const mainArtist = primaryCatalogArtist(artist);
  const queries = Array.from(new Set([`${cleanTitle} ${mainArtist}`.trim(), cleanTitle]));

  for (const q of queries) {
    const html = await fetchHtmlForImport(
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`,
    );
    if (!html) continue;
    const ranked = rankUltimateGuitarCandidates(parseUltimateGuitarSearchHtml(html), title, artist);
    if (ranked.length > 0) return ranked;
  }
  return [];
}

/** Searches YouTube for the best video of a catalog track (official audio / lyric video). */
export async function searchYouTubeForTrack(
  title: string,
  artist: string,
): Promise<SongSearchResult[]> {
  const q = `${cleanCatalogTitle(title) || title} ${primaryCatalogArtist(artist)}`.trim();
  const html = await fetchHtmlForImport(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  );
  if (!html) return [];
  return parseYouTubeSearchResultsHtml(html, 5);
}

/**
 * Generates an accurate guitar chord and lyric sheet for a canonical `title` + `artist`
 * using Gemini (`gemini-3.8-flash` by default, with automatic fallback).
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

  const response = await generateContentWithGeminiFallback(ai, {
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
 *  1. Imports a direct supported chord URL if one was provided.
 *  2. Searches Ultimate Guitar and imports the best-matching free "Chords" sheet (priority).
 *  3. Finds the track on YouTube and transcribes chords + lyrics from the video via Gemini.
 *  4. Last resort: generates a chord sheet from the title/artist via Gemini.
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
        // Fall through to Ultimate Guitar search / YouTube
      }
    }
  }

  // 2. Ultimate Guitar (priority): try the top-ranked free chord sheets
  try {
    const ugCandidates = await searchUltimateGuitarChords(title, artist);
    for (const candidate of ugCandidates.slice(0, 3)) {
      const html = await fetchHtmlForImport(candidate.url);
      if (!html) continue;
      try {
        return parseUltimateGuitarHtml(html, candidate.url);
      } catch {
        // Try the next candidate
      }
    }
  } catch {
    // Fall through to YouTube
  }

  // 3. YouTube: transcribe chords + lyrics from the best matching video
  let youtubeError: unknown = null;
  try {
    const videos = await searchYouTubeForTrack(title, artist);
    const normTitle = normalizeComparable(cleanCatalogTitle(title));
    const best =
      videos.find((v) => normalizeComparable(v.title).includes(normTitle)) ?? videos[0];
    if (best) {
      const imported = await extractYouTubeChordsWithGemini(best.url);
      return {
        ...imported,
        title: imported.title || title,
        artist: imported.artist || artist,
      };
    }
  } catch (err) {
    if (err instanceof MissingGeminiApiKeyError) throw err;
    youtubeError = err;
  }

  // 4. Last resort: generate from title + artist via Gemini
  try {
    return await generateSongChordsWithGemini(title, artist, rawUrl);
  } catch (err) {
    throw youtubeError ?? err;
  }
}
