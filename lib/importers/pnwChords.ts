import { normalizeKey } from '@/lib/music';
import {
  decodeHtmlEntities,
  formatChordFlowDocument,
  normalizeSongBodyLines,
  resolveShapeKey,
} from './textCleaner';
import type { ImportedSongResponse } from './types';

function extractTitleAndArtist(html: string): { title: string; artist: string } {
  const h1Match =
    /<h1[^>]*class="[^"]*(?:entry-title|page-title|post-title)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(
      html,
    ) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  const rawHeading = decodeHtmlEntities(
    (h1Match?.[1] || titleTagMatch?.[1] || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  // Strip trailing "- pnwchords" or "| pnwchords"
  const withoutSite = rawHeading
    .replace(/\s*[-–—|]\s*pnwchords(?:\.com)?\s*$/i, '')
    .trim();

  if (!withoutSite) {
    return { title: 'Untitled Song', artist: 'Unknown Artist' };
  }

  // Split "<Song Title> – <Artist>" or "<Song Title> - <Artist>"
  const parts = withoutSite.split(/\s+[–—-]\s+/);
  if (parts.length >= 2) {
    return {
      title: parts[0].trim(),
      artist: parts.slice(1).join(' - ').trim(),
    };
  }

  return { title: withoutSite, artist: 'Unknown Artist' };
}

/**
 * Parses a PNW Chords (`pnwchords.com`) HTML document into ChordFlow's plain-text format.
 */
export function parsePnwChordsHtml(html: string, sourceUrl: string): ImportedSongResponse {
  const { title, artist } = extractTitleAndArtist(html);

  // Isolate the primary Chords <pre> block (commonly <pre data-key="D">...</pre>)
  // and ignore any secondary Lyrics-only tab or footer widgets.
  const preMatches = [...html.matchAll(/<pre([^>]*)>([\s\S]*?)<\/pre>/gi)];
  if (preMatches.length === 0) {
    throw new Error('Could not find a chord sheet (<pre> block) on this PNW Chords page.');
  }

  // Prefer the <pre> block that carries `data-key` or chord lines
  const primaryPre =
    preMatches.find((m) => /data-key=/i.test(m[1])) ?? preMatches[0];

  const preAttrs = primaryPre[1] || '';
  const rawPreHtml = primaryPre[2] || '';

  const dataKeyMatch = /data-key\s*=\s*["']([^"']+)["']/i.exec(preAttrs);
  let extractedKey = dataKeyMatch ? normalizeKey(dataKeyMatch[1].trim()) : undefined;
  let extractedCapo = 0;

  // Look for explicit Capo mention near the pre block if any
  const capoMatch = /\bCapo\s*(?:on\s*)?(\d{1,2})\b/i.exec(rawPreHtml.slice(0, 300));
  if (capoMatch) {
    extractedCapo = Math.min(11, parseInt(capoMatch[1], 10));
  }

  // Convert <br> tags to newlines and strip inline tags (<span>, <b>, <a>) without shifting character columns
  const plainPreText = decodeHtmlEntities(
    rawPreHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:span|b|strong|em|i|a|font)[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ''),
  );

  const rawLines = plainPreText.replace(/\r\n?/g, '\n').split('\n');
  const bodyLines = normalizeSongBodyLines(rawLines);

  if (bodyLines.length === 0) {
    throw new Error('The PNW Chords sheet appeared to be empty.');
  }

  extractedKey = resolveShapeKey(bodyLines, extractedKey, extractedCapo) || 'G';
  const tuning = 'E A D G B E';

  const formattedText = formatChordFlowDocument(
    {
      title,
      artist,
      key: extractedKey,
      capo: extractedCapo,
      tuning,
    },
    bodyLines,
  );

  return {
    title,
    artist,
    key: extractedKey,
    capo: extractedCapo,
    tuning,
    formattedText,
    provider: 'pnwchords',
    sourceUrl,
  };
}
