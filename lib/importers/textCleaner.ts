import { guessKeyFromChord, isChord, normalizeKey, transposeKey } from '@/lib/music';
import { extractChordPositions } from '@/lib/parser';
import type { ImportedSongResponse, ImportProvider } from './types';

const ALLOWED_HOSTS: Record<string, ImportProvider> = {
  'pnwchords.com': 'pnwchords',
  'www.pnwchords.com': 'pnwchords',
  'ultimate-guitar.com': 'ultimate-guitar',
  'www.ultimate-guitar.com': 'ultimate-guitar',
  'tabs.ultimate-guitar.com': 'ultimate-guitar',
};

/** Checks whether a hostname belongs to a supported chord provider. */
export function getImportProviderForHost(hostname: string): ImportProvider | null {
  const host = hostname.toLowerCase().trim();
  return ALLOWED_HOSTS[host] ?? null;
}

/**
 * Validates and normalizes a single-line URL string if it points to PNW Chords or Ultimate Guitar.
 */
export function detectSupportedImportUrl(input: string): {
  url: string;
  provider: ImportProvider;
} | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const provider = getImportProviderForHost(parsed.hostname);
    if (!provider) return null;
    return { url: parsed.toString(), provider };
  } catch {
    return null;
  }
}

/** Decodes common named and numeric HTML entities. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;|&#0*160;/gi, ' ')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&');
}

const SECTION_KEYWORDS =
  'intro|verse|chorus|pre-?chorus|post-?chorus|bridge|outro|tag|interlude|instrumental|ending|refrain|coda|hook|turnaround|vamp|solo|break|riff|rap|end';

const SECTION_LINE_RE = new RegExp(
  `^\\s*\\[?\\s*(${SECTION_KEYWORDS})\\s*(\\d+)?(\\s*\\([^\\]\\n]*\\))?(\\s*x\\s*\\d+)?\\s*\\]?\\s*:?\\s*$`,
  'i',
);

function formatSectionWord(word: string): string {
  const lower = word.toLowerCase().replace(/\s+/g, '');
  if (lower === 'prechorus' || lower === 'pre-chorus') return 'Pre-Chorus';
  if (lower === 'postchorus' || lower === 'post-chorus') return 'Post-Chorus';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Normalizes section header lines such as `Verse1`, `Verse 1:`, `Bridge2`, `Prechorus`, or `[Chorus]`
 * into canonical `[Verse 1]`, `[Bridge 2]`, `[Pre-Chorus]`, `[Chorus]`.
 */
export function normalizeSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Reject single tokens that are actually valid chord names (e.g. "[G]" or "C")
  const bracketInner = /^\[([^\]]+)\]$/.exec(trimmed);
  if (bracketInner && isChord(bracketInner[1].trim())) return null;
  if (isChord(trimmed)) return null;

  const m = SECTION_LINE_RE.exec(trimmed);
  if (m) {
    const base = formatSectionWord(m[1]);
    const num = m[2] ? ` ${m[2]}` : '';
    const paren = m[3] ? ` ${m[3].trim()}` : '';
    const repeat = m[4] ? ` ${m[4].trim()}` : '';
    return `[${base}${num}${paren}${repeat}]`;
  }

  // Keep existing bracketed headers like `[Section A — Minor Turnaround]` or `[Verse 1 - Acoustic]`
  if (bracketInner && !bracketInner[1].includes('[') && bracketInner[1].trim().length <= 48) {
    const inner = bracketInner[1].trim();
    if (/^(?:ch|\/ch|tab|\/tab)$/i.test(inner)) return null;
    return `[${inner}]`;
  }

  return null;
}

/** Lines that belong to PNW Chords or Ultimate Guitar UI chrome rather than the song body. */
const NOISE_LINE_PATTERNS: RegExp[] = [
  /^\s*Font\s+Print\s+Dark/i,
  /^\s*view_module(?:Split\d*|None)?\s*$/i,
  /^\s*(?:Ab\s*A\s*A#\s*Bb|A\s*A#\s*B\s*C\s*C#)/i,
  /^\s*AbAA#BbBCC#DbDD#EbEFF#GbGG#\s*$/i,
  /^\s*(?:🎵\s*)?Simple\s*(?:🎶\s*)?Advanced\s*$/i,
  /^\s*Transpose\s+chord\s*\(to\s+next\s+higher\s+key\)\s*$/i,
  /^\s*(?:Chords|Lyrics)\s+Tab\s*$/i,
  /^\s*Copy\s+Link\s*$/i,
];

export function isUiNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return NOISE_LINE_PATTERNS.some((re) => re.test(t));
}

/**
 * Infers the primary shape key from the body lines and harmonizes with an external key/capo if given.
 * In ChordFlow, `Key:` in the document header represents the base shape key (so `Key: G` + `Capo: 3`
 * yields sounding concert key `Bb`).
 */
export function resolveShapeKey(
  bodyLines: string[],
  reportedKey?: string,
  capo = 0,
): string | undefined {
  let firstChord: string | undefined;
  for (const line of bodyLines) {
    const positions = extractChordPositions(line);
    if (positions && positions.length > 0) {
      firstChord = positions[0].chord;
      break;
    }
  }
  const guessedFromChords = guessKeyFromChord(firstChord);
  const normReported = reportedKey ? normalizeKey(reportedKey) : undefined;

  if (!normReported) return guessedFromChords;
  if (capo > 0 && guessedFromChords) {
    // If the provider reported the sounding concert key (e.g. UG reports "Db" for Capo 1 + C shapes),
    // use the chord shape key ("C") as `Key:` so ChordFlow computes `Capo 1: C Shapes / Concert Key: Db`.
    const transposedShape = transposeKey(guessedFromChords, capo);
    if (normalizeKey(transposedShape) === normReported) {
      return guessedFromChords;
    }
  }
  return normReported;
}

/**
 * Cleans and normalizes an array of song body lines:
 * - Strips `[tab]`/`[/tab]` and `[ch]`/`[/ch]` while preserving exact whitespace column alignment
 * - Normalizes section headers (`Verse1` -> `[Verse 1]`) with a single preceding blank line
 * - Collapses 3+ consecutive blank lines
 */
export function normalizeSongBodyLines(rawLines: string[]): string[] {
  const out: string[] = [];

  for (const raw of rawLines) {
    const line = raw
      .replace(/\[\/?tab\]/gi, '')
      .replace(/\[\/?ch\]/gi, '')
      .replace(/\s+$/, '');

    if (isUiNoiseLine(line)) continue;

    if (!line.trim()) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    const section = normalizeSectionHeader(line);
    if (section) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      out.push(section);
      continue;
    }

    out.push(line);
  }

  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * Formats metadata and cleaned body lines into ChordFlow's canonical plain-text schema.
 */
export function formatChordFlowDocument(
  meta: {
    title?: string;
    artist?: string;
    key?: string;
    capo?: number;
    tuning?: string;
  },
  bodyLines: string[],
): string {
  const title = (meta.title || 'Untitled Song').trim();
  const artist = (meta.artist || 'Unknown Artist').trim();
  const capo = typeof meta.capo === 'number' && meta.capo > 0 ? meta.capo : 0;
  const key = resolveShapeKey(bodyLines, meta.key, capo) || 'G';
  const tuning = (meta.tuning || 'E A D G B E').trim();

  const header = [
    `Title: ${title}`,
    `Artist: ${artist}`,
    `Key: ${key}`,
    `Capo: ${capo}`,
    `Tuning: ${tuning}`,
  ];

  const normalizedBody = normalizeSongBodyLines(bodyLines);
  return [...header, '', ...normalizedBody].join('\n');
}

/**
 * Detects whether the current Song Input text contains raw unformatted paste clutter
 * from PNW Chords or Ultimate Guitar (e.g. `[ch]`/`[tab]` tags, transpose strip, or duplicate tabs).
 */
export function hasRawPasteClutter(input: string): boolean {
  return (
    /\[\/?(?:ch|tab)\]/i.test(input) ||
    /view_module(?:Split|None)/i.test(input) ||
    /AbAA#BbBCC#DbDD#EbEFF#GbGG#/i.test(input) ||
    /Font\s+Print\s+Dark/i.test(input) ||
    /\b(?:Verse|Bridge|Chorus|Prechorus)\d+\b/.test(input)
  );
}

/**
 * Smart client/server raw-paste cleaner for when a user copies (`Cmd+A` / `Ctrl+A`) page text
 * from PNW Chords or Ultimate Guitar directly into the Song Input box.
 */
export function cleanRawPastedText(rawInput: string, sourceUrl = ''): ImportedSongResponse {
  const lines = decodeHtmlEntities(rawInput)
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let title = '';
  let artist = '';
  let key: string | undefined;
  let capo: number | undefined;
  let tuning = 'E A D G B E';
  let provider: ImportProvider = 'ultimate-guitar';

  // Detect PNW Chords markers
  if (
    rawInput.includes('pnwchords') ||
    /view_module/i.test(rawInput) ||
    /AbAA#BbBCC#DbDD#EbEFF#GbGG#/i.test(rawInput)
  ) {
    provider = 'pnwchords';
  }

  const bodyLines: string[] = [];
  let inSongBody = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Stop before PNW Chords footer / duplicate Lyrics-only tab
    if (
      /^(?:Leave a Reply|Related Posts|Post navigation|Copy Link|Share this:)/i.test(trimmed)
    ) {
      break;
    }

    // Parse "Song – Artist - pnwchords" title line if present
    if (!title && /-?\s*pnwchords/i.test(trimmed)) {
      const cleaned = trimmed.replace(/\s*[-–—|]\s*pnwchords.*$/i, '').trim();
      const parts = cleaned.split(/\s+[–—-]\s+/);
      if (parts.length >= 2) {
        title = parts[0].trim();
        artist = parts.slice(1).join(' - ').trim();
      } else {
        title = cleaned;
      }
      continue;
    }

    // Parse Ultimate Guitar "Song Chords by Artist" line
    if (!title) {
      const ugByline = /^(.+?)\s+(?:Chords|Tabs?|Ukulele Chords)\s+by\s+(.+?)$/i.exec(trimmed);
      if (ugByline) {
        title = ugByline[1].trim();
        artist = ugByline[2].trim();
        continue;
      }
    }

    // Parse explicit metadata lines
    const metaMatch = /^(Title|Song|Artist|Key|Capo|Tuning)\s*[:=]\s*(.+)$/i.exec(trimmed);
    if (metaMatch && !inSongBody) {
      const label = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (label === 'title' || label === 'song') title = val;
      else if (label === 'artist') artist = val;
      else if (label === 'key') key = normalizeKey(val) ?? val;
      else if (label === 'capo') {
        const m = /(\d+)/.exec(val);
        capo = m ? parseInt(m[1], 10) : 0;
      } else if (label === 'tuning') tuning = val;
      continue;
    }

    if (isUiNoiseLine(rawLine)) continue;

    // Detect start of song body
    if (!inSongBody) {
      const cleanCheck = rawLine.replace(/\[\/?(?:ch|tab)\]/gi, '');
      if (
        normalizeSectionHeader(cleanCheck) ||
        extractChordPositions(cleanCheck) ||
        /^\[ch\]/i.test(trimmed)
      ) {
        inSongBody = true;
      }
    }

    bodyLines.push(rawLine);
  }

  const normalizedBody = normalizeSongBodyLines(bodyLines);
  const resolvedKey = resolveShapeKey(normalizedBody, key, capo ?? 0) || 'G';
  const formattedText = formatChordFlowDocument(
    {
      title: title || 'Untitled Song',
      artist: artist || 'Unknown Artist',
      key: resolvedKey,
      capo: capo ?? 0,
      tuning,
    },
    normalizedBody,
  );

  return {
    title: title || 'Untitled Song',
    artist: artist || 'Unknown Artist',
    key: resolvedKey,
    capo: capo ?? 0,
    tuning,
    formattedText,
    provider,
    sourceUrl,
  };
}
