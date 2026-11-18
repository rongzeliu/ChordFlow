import type { SongSearchResult } from './types';

interface SpotifyTrackItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  artists?: { name?: string }[];
  album?: {
    name?: string;
    images?: { url?: string; width?: number; height?: number }[];
  };
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchPayload {
  tracks?: {
    items?: SpotifyTrackItem[];
  };
}

interface ItunesTrackItem {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
}

interface ItunesSearchPayload {
  results?: ItunesTrackItem[];
}

let cachedSpotifyToken: { accessToken: string; expiresAtMs: number } | null = null;

/**
 * Normalizes a raw Spotify `/v1/search?type=track` JSON payload into canonical `SongSearchResult` items.
 */
export function parseSpotifyTracksResponse(data: unknown): SongSearchResult[] {
  const items = (data as SpotifySearchPayload | undefined)?.tracks?.items;
  if (!Array.isArray(items)) return [];

  const results: SongSearchResult[] = [];
  const seenKey = new Set<string>();

  for (const item of items) {
    const title = item?.name?.trim();
    const artist = (item?.artists ?? [])
      .map((a) => a?.name?.trim())
      .filter(Boolean)
      .join(', ');
    if (!title || !artist) continue;

    const dedupeKey = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);

    const images = item?.album?.images ?? [];
    const smallestThumb =
      images.find((img) => img.width && img.width <= 160)?.url ||
      images[images.length - 1]?.url ||
      images[0]?.url;

    results.push({
      id: item.id || dedupeKey,
      title,
      artist,
      album: item?.album?.name?.trim() || undefined,
      artworkUrl: smallestThumb || undefined,
      durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : undefined,
      url:
        item?.external_urls?.spotify ||
        `https://open.spotify.com/track/${encodeURIComponent(item.id || title)}`,
      provider: 'spotify',
    });
  }

  return results;
}

/**
 * Normalizes a raw Apple iTunes Search API (`/search?media=music&entity=song`) JSON payload
 * into canonical `SongSearchResult` items.
 */
export function parseItunesTracksResponse(data: unknown): SongSearchResult[] {
  const items = (data as ItunesSearchPayload | undefined)?.results;
  if (!Array.isArray(items)) return [];

  const results: SongSearchResult[] = [];
  const seenKey = new Set<string>();

  for (const item of items) {
    const title = item?.trackName?.trim();
    const artist = item?.artistName?.trim();
    if (!title || !artist) continue;

    const dedupeKey = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);

    results.push({
      id: item.trackId ? String(item.trackId) : dedupeKey,
      title,
      artist,
      album: item?.collectionName?.trim() || undefined,
      artworkUrl: item?.artworkUrl100 || item?.artworkUrl60 || undefined,
      durationMs: typeof item.trackTimeMillis === 'number' ? item.trackTimeMillis : undefined,
      url:
        item?.trackViewUrl ||
        `https://music.apple.com/us/search?term=${encodeURIComponent(`${title} ${artist}`)}`,
      provider: 'itunes',
    });
  }

  return results;
}

async function getSpotifyAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedSpotifyToken && cachedSpotifyToken.expiresAtMs > now + 30_000) {
    return cachedSpotifyToken.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed (HTTP ${res.status})`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('Spotify token response missing access_token');
  }

  const ttlMs = (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000;
  cachedSpotifyToken = {
    accessToken: json.access_token,
    expiresAtMs: now + ttlMs,
  };
  return json.access_token;
}

export async function searchSpotifyTracks(
  query: string,
  limit = 6,
): Promise<SongSearchResult[]> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return [];

  const token = await getSpotifyAccessToken(clientId, clientSecret);
  const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(
    query,
  )}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  return parseSpotifyTracksResponse(json);
}

export async function searchItunesTracks(
  query: string,
  limit = 6,
): Promise<SongSearchResult[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(
    query,
  )}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  return parseItunesTracksResponse(json);
}

/**
 * Searches canonical music tracks by song title and/or artist using Spotify Track Search
 * when `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are configured, falling back
 * automatically to the public Apple iTunes Search API.
 */
export async function searchCatalogTracks(
  query: string,
  limit = 6,
): Promise<SongSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  if (process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim()) {
    try {
      const spotifyResults = await searchSpotifyTracks(clean, limit);
      if (spotifyResults.length > 0) return spotifyResults;
    } catch {
      // Fall back to iTunes Search API below
    }
  }

  try {
    return await searchItunesTracks(clean, limit);
  } catch {
    return [];
  }
}
