import { normalizeKey } from '@/lib/music';
import {
  decodeHtmlEntities,
  formatChordFlowDocument,
  normalizeSongBodyLines,
  resolveShapeKey,
} from './textCleaner';
import type { ImportedSongResponse } from './types';

function extractWorshipTogetherMeta(html: string): {
  title: string;
  artist: string;
  key?: string;
  capo: number;
} {
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  const rawHeading = decodeHtmlEntities(
    (h1Match?.[1] || titleTagMatch?.[1] || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .replace(/\s*[-–—|]\s*Worship\s*Together.*$/i, '')
    .trim();

  let title = rawHeading || 'Untitled Song';
  let artist = 'Unknown Artist';

  // Split "Title - Artist" or "Title by Artist" if present in heading
  const dashSplit = title.split(/\s+[–—-]\s+/);
  if (dashSplit.length >= 2) {
    title = dashSplit[0].trim();
    artist = dashSplit.slice(1).join(' - ').trim();
  }

  // Also check explicit Artist / Writer metadata labels on WorshipTogether pages
  const artistMatch =
    /(?:Artist|Writer|By)s?\s*:\s*<\/strong>\s*([\s\S]*?)<\/(?:div|p|li|span)>/i.exec(html) ??
    /<div[^>]*class="[^"]*song-taxonomy[^"]*"[^>]*>[\s\S]*?Artist[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(
      html,
    );
  if (artistMatch?.[1] && artist === 'Unknown Artist') {
    const cleanedArtist = decodeHtmlEntities(
      artistMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    );
    if (cleanedArtist) artist = cleanedArtist;
  }

  const keyMatch =
    /(?:Original\s+Key|Key|Recommended\s+Key)\s*:\s*(?:<[^>]+>\s*)*([A-G][#b]?\s*(?:m|min|maj)?)\b/i.exec(
      html,
    ) ?? /data-key\s*=\s*["']([^"']+)["']/i.exec(html);
  const key = keyMatch?.[1] ? normalizeKey(keyMatch[1].trim()) : undefined;

  const capoMatch = /\bCapo\s*[:=]?\s*(\d{1,2})\b/i.exec(html);
  const capo = capoMatch ? Math.min(11, parseInt(capoMatch[1], 10)) : 0;

  return { title, artist, key, capo };
}

/**
 * Converts WorshipTogether `.chord-pro-line` / `.chord-pro-segment` DOM blocks (where each segment
 * pairs `.chord-pro-note` above `.chord-pro-lyric`) into inline `[Chord]lyric` lines.
 */
function extractChordProDomLines(html: string): string[] {
  const lines: string[] = [];
  const segLines = html.split(/<div[^>]*class="[^"]*\bchord-pro-line\b[^"]*"[^>]*>/i).slice(1);
  for (const rawLine of segLines) {
    const segRegex =
      /<div[^>]*class="[^"]*\bchord-pro-segment\b[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*\bchord-pro-note\b[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*class="[^"]*\bchord-pro-lyric\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let segMatch: RegExpExecArray | null;
    let built = '';
    let foundSegment = false;
    while ((segMatch = segRegex.exec(rawLine))) {
      foundSegment = true;
      const chord = decodeHtmlEntities(segMatch[1].replace(/<[^>]+>/g, '').trim());
      const lyric = decodeHtmlEntities(segMatch[2].replace(/<[^>]+>/g, ''));
      if (chord) {
        built += `[${chord}]${lyric}`;
      } else {
        built += lyric;
      }
    }
    if (foundSegment && built.trim()) {
      lines.push(built.trimEnd());
    }
  }
  return lines;
}

/**
 * Parses a WorshipTogether (`worshiptogether.com`) HTML document into ChordFlow's plain-text format.
 */
export function parseWorshipTogetherHtml(html: string, sourceUrl: string): ImportedSongResponse {
  const meta = extractWorshipTogetherMeta(html);
  let rawLines: string[] = [];

  // 1. Try ChordPro DOM segments (`.chord-pro-line` / `.chord-pro-segment`)
  const chordProDomLines = extractChordProDomLines(html);
  if (chordProDomLines.length > 0) {
    rawLines = chordProDomLines;
  } else {
    // 2. Fallback to <pre> or .chord-chart / .song-lyrics container
    const preMatch =
      /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html) ??
      /<div[^>]*class="[^"]*(?:chord-chart|song-chart|lyrics-chords)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
        html,
      );
    if (!preMatch?.[1]) {
      throw new Error(
        'Could not locate a public chord sheet on this WorshipTogether page (it may require a WorshipTogether account login).',
      );
    }
    const plain = decodeHtmlEntities(
      preMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
    rawLines = plain.replace(/\r\n?/g, '\n').split('\n');
  }

  const bodyLines = normalizeSongBodyLines(rawLines);
  if (bodyLines.length === 0) {
    throw new Error('The WorshipTogether chord sheet appeared to be empty.');
  }

  const resolvedKey = resolveShapeKey(bodyLines, meta.key, meta.capo) || 'G';
  const formattedText = formatChordFlowDocument(
    {
      title: meta.title,
      artist: meta.artist,
      key: resolvedKey,
      capo: meta.capo,
      tuning: 'E A D G B E',
    },
    bodyLines,
  );

  return {
    title: meta.title,
    artist: meta.artist,
    key: resolvedKey,
    capo: meta.capo,
    tuning: 'E A D G B E',
    formattedText,
    provider: 'worshiptogether',
    sourceUrl,
  };
}
