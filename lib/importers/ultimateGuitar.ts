import {
  decodeHtmlEntities,
  formatChordFlowDocument,
  normalizeSongBodyLines,
  resolveShapeKey,
} from './textCleaner';
import type { ImportedSongResponse } from './types';

interface UgStorePayload {
  store?: {
    page?: {
      data?: {
        tab?: {
          song_name?: string;
          artist_name?: string;
          tonality_name?: string;
        };
        tab_view?: {
          wiki_tab?: {
            content?: string;
          };
          meta?: {
            tonality?: string;
            capo?: number | string;
            tuning?: {
              name?: string;
              value?: string;
            };
          };
        };
      };
    };
  };
}

/**
 * Parses an Ultimate Guitar (`tabs.ultimate-guitar.com`) HTML document by extracting
 * `<div class="js-store" data-content="...">` and converting `wiki_tab.content` into
 * ChordFlow's plain-text format.
 */
export function parseUltimateGuitarHtml(html: string, sourceUrl: string): ImportedSongResponse {
  const storeMatch =
    /<div[^>]*class="[^"]*\bjs-store\b[^"]*"[^>]*data-content="([^"]+)"/i.exec(html) ??
    /<div[^>]*data-content="([^"]+)"[^>]*class="[^"]*\bjs-store\b[^"]*"/i.exec(html);

  if (!storeMatch?.[1]) {
    throw new Error(
      'Could not locate Ultimate Guitar tab data (.js-store) on this page. Make sure the link points directly to a chord or tab page.',
    );
  }

  const decodedJson = decodeHtmlEntities(storeMatch[1]);
  let parsed: UgStorePayload;
  try {
    parsed = JSON.parse(decodedJson) as UgStorePayload;
  } catch {
    throw new Error('Failed to parse Ultimate Guitar page store JSON.');
  }

  const pageData = parsed?.store?.page?.data;
  const rawContent = pageData?.tab_view?.wiki_tab?.content;

  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error(
      'This Ultimate Guitar URL does not contain a text chord/tab sheet (Official/Pro tabs cannot be imported without a plain chord version).',
    );
  }

  const title = (pageData?.tab?.song_name || 'Untitled Song').trim();
  const artist = (pageData?.tab?.artist_name || 'Unknown Artist').trim();
  const rawTonality =
    pageData?.tab?.tonality_name || pageData?.tab_view?.meta?.tonality || undefined;

  const rawCapo = pageData?.tab_view?.meta?.capo;
  const parsedCapo =
    typeof rawCapo === 'number'
      ? rawCapo
      : typeof rawCapo === 'string' && /^\d+$/.test(rawCapo.trim())
        ? parseInt(rawCapo.trim(), 10)
        : 0;
  const capo = Math.max(0, Math.min(11, parsedCapo));

  const tuning = (pageData?.tab_view?.meta?.tuning?.value || 'E A D G B E').trim();

  // Normalize line endings, strip [tab]/[/tab] and [ch]/[/ch] while preserving exact column alignment
  const rawLines = rawContent
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?tab\]/gi, '')
    .split('\n')
    .map((line) => line.replace(/\[\/?ch\]/gi, '').replace(/\s+$/, ''));

  const bodyLines = normalizeSongBodyLines(rawLines);
  const shapeKey = resolveShapeKey(bodyLines, rawTonality, capo) || 'G';

  const formattedText = formatChordFlowDocument(
    {
      title,
      artist,
      key: shapeKey,
      capo,
      tuning,
    },
    bodyLines,
  );

  return {
    title,
    artist,
    key: shapeKey,
    capo,
    tuning,
    formattedText,
    provider: 'ultimate-guitar',
    sourceUrl,
  };
}
