/**
 * ChordFlow parsing engine.
 *
 * Supports:
 *  - Ultimate Guitar plaintext (two-line chord-over-lyric blocks, [ch]/[tab] tags)
 *  - ChordPro (inline [G]brackets, {directives}, {define: ...})
 *  - Custom voicing glossaries: "G* = 320033", "[ch]Em7*[/ch]: 022033", "D/F#*  2-x-0-2-3-2",
 *    ChordPro {define}, and vertical ASCII neck blocks (e|---3---, B|---3---, ...).
 */
import type { ChordVoicing, LyricChordToken, ParsedSong, SongLine } from '@/types/chord';
import { resolveVoicing } from './chordLibrary';
import { CHORD_SOURCE, isChord, normalizeKey } from './music';
import { buildVoicing, parseFretString } from './voicing';

// ---------------------------------------------------------------------------------------------
// Line-level patterns
// ---------------------------------------------------------------------------------------------

const FRET_TOKEN = '(?:[xXnN]|1[0-9]|2[0-4]|[0-9])';
const FRETS_SOURCE = `(?:[xXnN0-9]{6}|${FRET_TOKEN}(?:[\\s\\-,.]+${FRET_TOKEN}){5})`;

/** Header voicing definition, e.g. `G* = 320033`, `Em7*: 0 2 2 0 3 3`, `D/F#* 2-x-0-2-3-2 (thumb)`. */
export const VOICING_DEF_RE = new RegExp(
  `^\\s*(${CHORD_SOURCE})\\s*(?:[:=]|->|→|-)?\\s*(${FRETS_SOURCE})\\s*(?:\\(.*\\)|\\[.*\\])?\\s*$`,
);

/** A tablature string line, e.g. `e|---3---|` or `B:--1--`. */
const STRING_LINE_RE = /^\s*([A-Ga-g][#b]?)\s*[|:]/;

const DIRECTIVE_RE = /^\s*\{\s*([a-zA-Z_-]+)\s*(?::\s*([^}]*?))?\s*\}\s*$/;
const DEFINE_RE = /^\s*\{\s*define\s*:?\s*(\S+)\s+(.*?)\s*\}\s*$/i;

const SECTION_NAMES =
  'intro|verse|chorus|pre-?chorus|post-?chorus|bridge|outro|tag|interlude|instrumental|ending|refrain|coda|hook|turnaround|vamp|solo|break|riff|end';
const SECTION_PLAIN_RE = new RegExp(
  `^\\s*((?:${SECTION_NAMES})(?:\\s*\\d+)?(?:\\s*\\([^)]*\\))?(?:\\s*x\\s*\\d+)?)\\s*:?\\s*$`,
  'i',
);

/** Tokens allowed on a chord line that are not chords (bar lines, repeat marks, N.C., ...). */
const IGNORABLE_RE = /^(?:\|+:?|:?\|+|x\d+|\d+x|\(x?\d+x?\)|\(|\)|-+|\/+|N\.?C\.?|%|\.+|~+|>+|→|\[|\]|\*)$/i;

const INLINE_CHORD_RE = /\[[^\]]+\]/;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function expandTabs(line: string, tabSize = 4): string {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tabSize - (out.length % tabSize));
    else out += ch;
  }
  return out;
}

/** Normalises newlines, strips UG [ch]/[tab] markup, expands tabs and trims trailing spaces. */
export function preprocess(input: string): string[] {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?(?:ch|tab)\]/gi, '')
    .split('\n')
    .map((l) => expandTabs(l).replace(/\s+$/, ''));
}

export interface ChordPosition {
  chord: string;
  col: number;
}

/** Returns chord names + character columns if every token on the line is a chord (or ignorable). */
export function extractChordPositions(line: string): ChordPosition[] | null {
  const out: ChordPosition[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const tok = m[0];
    if (IGNORABLE_RE.test(tok)) continue;
    const lead = /^[|(\[]*/.exec(tok)![0].length;
    const core = tok.slice(lead).replace(/[|)\],]+$/, '');
    if (core && isChord(core)) {
      out.push({ chord: core, col: m.index + lead });
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

export function detectSection(line: string): string | null {
  const bracket = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (bracket) {
    const inner = bracket[1].trim();
    return isChord(inner) ? null : inner;
  }
  const plain = SECTION_PLAIN_RE.exec(line);
  return plain ? plain[1].trim().replace(/^\w/, (c) => c.toUpperCase()) : null;
}

interface Directive {
  name: string;
  value: string;
}

function parseDirective(line: string): Directive | null {
  if (DEFINE_RE.test(line)) return { name: 'define', value: '' };
  const m = DIRECTIVE_RE.exec(line);
  if (!m) return null;
  return { name: m[1].toLowerCase(), value: (m[2] ?? '').trim() };
}

function isTabLine(line: string): boolean {
  return STRING_LINE_RE.test(line) && /[-–]{2,}/.test(line);
}

export interface SongMetadata {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tuning?: string;
}

function parseCapo(value: string): number | undefined {
  if (/no\s*capo|none|^\s*0\s*$/i.test(value)) return 0;
  const m = /(\d{1,2})/.exec(value);
  return m ? Math.min(11, parseInt(m[1], 10)) : undefined;
}

/**
 * Detects plaintext metadata lines (Title:, Artist:, Key:, Capo 3, Tuning: ...).
 * `allowByline` enables the UG page heading form "Song Chords by Artist" (first line only).
 */
export function detectMetadata(line: string, allowByline = false): SongMetadata | null {
  const labelled = /^\s*(title|song|artist|by|key|capo|tuning)\s*[:=]\s*(.+?)\s*$/i.exec(line);
  if (labelled) {
    const label = labelled[1].toLowerCase();
    const value = labelled[2];
    if (label === 'title' || label === 'song') return { title: value };
    if (label === 'artist' || label === 'by') return { artist: value };
    if (label === 'key') return { key: normalizeKey(value) ?? value };
    if (label === 'capo') return { capo: parseCapo(value) ?? 0 };
    return { tuning: value };
  }
  if (/^\s*no\s+capo\s*$/i.test(line)) return { capo: 0 };
  const capo = /^\s*capo\b(?:\s+on)?\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s+fret)?\s*$/i.exec(line);
  if (capo) return { capo: parseCapo(capo[1]) };
  if (allowByline) {
    const by = /^\s*(.+?)\s+(?:chords|tabs?|ukulele chords|guitar chords|lyrics)\s+by\s+(.+?)\s*$/i.exec(line);
    if (by) return { title: by[1], artist: by[2] };
  }
  return null;
}

function firstNonBlankIndex(lines: string[]): number {
  return lines.findIndex((l) => l.trim().length > 0);
}

// ---------------------------------------------------------------------------------------------
// Custom voicing extraction
// ---------------------------------------------------------------------------------------------

function parseDefineDirective(line: string): ChordVoicing | null {
  const m = DEFINE_RE.exec(line);
  if (!m) return null;
  const name = m[1];
  const body = m[2];
  const base = /base-fret\s+(\d+)/i.exec(body);
  const fretsMatch = /frets\s+((?:[xXnN\d]+\s*){6})/i.exec(body);
  if (!fretsMatch) return null;
  const rel = parseFretString(fretsMatch[1].trim().split(/\s+/).join(' '));
  if (!rel) return null;
  const baseFret = base ? Math.max(1, parseInt(base[1], 10)) : 1;
  const frets = rel.map((f) => (f > 0 ? f + baseFret - 1 : f));
  const fingersMatch = /fingers\s+((?:[\dxXnN-]+\s*){6})/i.exec(body);
  const fingers = fingersMatch
    ? fingersMatch[1].trim().split(/\s+/).map((f) => (/^\d$/.test(f) ? parseInt(f, 10) : 0))
    : undefined;
  return buildVoicing(name, frets, true, { fingers, baseFret: baseFret > 1 ? baseFret : undefined });
}

/**
 * Parses a vertical ASCII neck block: a chord-name line followed by 6 string lines (high e first).
 * Each chord owns the columns from its name's start up to the next chord name.
 */
function parseAsciiBlock(nameLine: string, block: string[]): ChordVoicing[] | null {
  const chords = extractChordPositions(nameLine);
  if (!chords || block.length !== 6) return null;
  const rows = block.map((line) => {
    const sep = line.search(/[|:]/);
    const toks: { v: string; col: number }[] = [];
    const re = /(\d{1,2}|[xX])/g;
    re.lastIndex = sep + 1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) toks.push({ v: m[1], col: m.index });
    return toks;
  });
  if (rows.every((r) => r.length === 0)) return null;
  // More notes than chord names means this is a riff, not a glossary.
  if (rows.some((r) => r.length > chords.length)) return null;

  const firstLabel = STRING_LINE_RE.exec(block[0])?.[1] ?? 'e';
  const lastLabel = STRING_LINE_RE.exec(block[5])?.[1] ?? 'E';
  const topIsLow = firstLabel === 'E' && lastLabel === 'e';

  const voicings: ChordVoicing[] = [];
  chords.forEach((c, ci) => {
    const lo = ci === 0 ? -Infinity : c.col - 1;
    const hi = ci === chords.length - 1 ? Infinity : chords[ci + 1].col - 1;
    const column = rows.map((r) => {
      const t = r.find((tok) => tok.col >= lo && tok.col < hi);
      if (!t) return -1;
      return t.v.toLowerCase() === 'x' ? -1 : parseInt(t.v, 10);
    });
    const frets = topIsLow ? column : column.reverse();
    const v = buildVoicing(c.chord, frets, true);
    if (v) voicings.push(v);
  });
  return voicings.length ? voicings : null;
}

export interface VoicingScan {
  voicings: Map<string, ChordVoicing>;
  /** Line indices consumed by glossary definitions (excluded from the song body). */
  consumed: Set<number>;
}

export function scanVoicings(lines: string[]): VoicingScan {
  const voicings = new Map<string, ChordVoicing>();
  const consumed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || consumed.has(i)) continue;

    const def = VOICING_DEF_RE.exec(line);
    if (def) {
      const frets = parseFretString(def[2]);
      const v = frets && buildVoicing(def[1], frets, true);
      if (v) {
        voicings.set(v.name, v);
        consumed.add(i);
        continue;
      }
    }

    if (DEFINE_RE.test(line)) {
      const v = parseDefineDirective(line);
      if (v) voicings.set(v.name, v);
      consumed.add(i);
      continue;
    }

    if (i + 6 < lines.length) {
      const block = lines.slice(i + 1, i + 7);
      if (block.length === 6 && block.every((l) => STRING_LINE_RE.test(l))) {
        const parsed = parseAsciiBlock(line, block);
        if (parsed) {
          for (const v of parsed) voicings.set(v.name, v);
          for (let k = i; k <= i + 6; k++) consumed.add(k);
          i += 6;
        }
      }
    }
  }
  return { voicings, consumed };
}

/** Extracts custom chord definitions (header glossaries, {define}, ASCII neck blocks). */
export function parseCustomVoicings(input: string): Map<string, ChordVoicing> {
  return scanVoicings(preprocess(input)).voicings;
}

// ---------------------------------------------------------------------------------------------
// Body tokenisation
// ---------------------------------------------------------------------------------------------

function chordToken(chord: string, text: string, voicings: Map<string, ChordVoicing>): LyricChordToken {
  return {
    type: text.trim() ? 'chord_with_lyric' : 'chord',
    chord,
    voicing: resolveVoicing(chord, voicings),
    text,
  };
}

/** Slices the lyric row at the exact character column of each chord above it. */
export function alignTwoLine(
  chords: ChordPosition[],
  lyric: string,
  voicings: Map<string, ChordVoicing>,
): LyricChordToken[] {
  const tokens: LyricChordToken[] = [];
  const lead = lyric.slice(0, chords[0].col);
  if (lead.trim()) tokens.push({ type: 'lyric', text: lead });
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].col : undefined;
    tokens.push(chordToken(c.chord, lyric.slice(c.col, end), voicings));
  });
  // The last slice runs to the end of the lyric, so a chord row shorter than the lyric loses nothing.
  return tokens;
}

/** Tokenises inline ChordPro brackets: `[G*]Amazing grace how [D/F#*]sweet`. */
export function tokenizeChordPro(line: string, voicings: Map<string, ChordVoicing>): LyricChordToken[] {
  const tokens: LyricChordToken[] = [];
  let pending: string | null = null;
  for (const part of line.split(/(\[[^\]]+\])/)) {
    const bracket = /^\[(.+)\]$/.exec(part);
    if (bracket && isChord(bracket[1].trim())) {
      if (pending !== null) tokens.push(chordToken(pending, '', voicings));
      pending = bracket[1].trim();
      continue;
    }
    if (pending !== null) {
      tokens.push(chordToken(pending, part, voicings));
      pending = null;
    } else if (part) {
      tokens.push({ type: 'lyric', text: part });
    }
  }
  if (pending !== null) tokens.push(chordToken(pending, '', voicings));
  return tokens;
}

const SECTION_DIRECTIVES: Record<string, string> = {
  soc: 'Chorus', start_of_chorus: 'Chorus',
  sov: 'Verse', start_of_verse: 'Verse',
  sob: 'Bridge', start_of_bridge: 'Bridge',
  sot: 'Tab', start_of_tab: 'Tab',
  start_of_intro: 'Intro', start_of_outro: 'Outro', start_of_prechorus: 'Pre-Chorus',
};
const COMMENT_DIRECTIVES = new Set(['c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight']);

/** Parses the song body into lines of tokens. Glossary/metadata lines are excluded. */
export function parseSongBody(
  input: string,
  voicings: Map<string, ChordVoicing> = new Map(),
): SongLine[] {
  const lines = preprocess(input);
  const { consumed } = scanVoicings(lines);
  const firstIdx = firstNonBlankIndex(lines);
  const out: SongLine[] = [];

  const pushBlank = () => {
    if (out.length && out[out.length - 1].type !== 'blank') {
      out.push({ type: 'blank', rawText: '', tokens: [] });
    }
  };

  const isPlainContent = (idx: number): boolean => {
    const l = lines[idx];
    if (l === undefined || !l.trim() || consumed.has(idx)) return false;
    return !(
      extractChordPositions(l) ||
      detectSection(l) ||
      parseDirective(l) ||
      detectMetadata(l, idx === firstIdx) ||
      isTabLine(l) ||
      /^\s*#/.test(l)
    );
  };

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    if (!line.trim()) {
      pushBlank();
      continue;
    }
    if (/^\s*#/.test(line)) continue; // ChordPro source comment

    const directive = parseDirective(line);
    if (directive) {
      const { name, value } = directive;
      if (name.startsWith('start_of_') || SECTION_DIRECTIVES[name]) {
        pushBlank();
        const fallback = SECTION_DIRECTIVES[name] ?? name.replace('start_of_', '').replace(/^\w/, (c) => c.toUpperCase());
        out.push({ type: 'section_header', rawText: line, label: value || fallback, tokens: [] });
      } else if (name.startsWith('end_of_') || ['eoc', 'eov', 'eob', 'eot'].includes(name)) {
        pushBlank();
      } else if (COMMENT_DIRECTIVES.has(name) && value) {
        out.push({ type: 'comment', rawText: value, tokens: [{ type: 'lyric', text: value }] });
      }
      continue; // metadata & unknown directives are not part of the body
    }

    if (detectMetadata(line, i === firstIdx)) continue;

    const section = detectSection(line);
    if (section) {
      pushBlank();
      out.push({ type: 'section_header', rawText: line, label: section, tokens: [] });
      continue;
    }

    if (isTabLine(line)) {
      out.push({ type: 'tab', rawText: line, tokens: [] });
      continue;
    }

    const chords = extractChordPositions(line);
    if (chords) {
      if (isPlainContent(i + 1) && !INLINE_CHORD_RE.test(lines[i + 1])) {
        const lyric = lines[i + 1];
        out.push({
          type: 'lyric_line',
          rawText: `${line}\n${lyric}`,
          tokens: alignTwoLine(chords, lyric, voicings),
        });
        i++;
      } else {
        out.push({
          type: 'lyric_line',
          rawText: line,
          tokens: chords.map((c) => chordToken(c.chord, '', voicings)),
        });
      }
      continue;
    }

    if (INLINE_CHORD_RE.test(line)) {
      const tokens = tokenizeChordPro(line, voicings);
      if (tokens.some((t) => t.chord)) {
        out.push({ type: 'lyric_line', rawText: line, tokens });
        continue;
      }
    }

    if (/^\s*\(.*\)\s*$/.test(line)) {
      out.push({ type: 'comment', rawText: line.trim(), tokens: [{ type: 'lyric', text: line.trim() }] });
      continue;
    }

    out.push({ type: 'lyric_line', rawText: line, tokens: [{ type: 'lyric', text: line.trim() }] });
  }

  while (out.length && out[0].type === 'blank') out.shift();
  while (out.length && out[out.length - 1].type === 'blank') out.pop();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Whole-song parse
// ---------------------------------------------------------------------------------------------

export function parseMetadata(lines: string[]): SongMetadata {
  const meta: SongMetadata = {};
  const merge = (m: SongMetadata) => {
    for (const [k, v] of Object.entries(m) as [keyof SongMetadata, never][]) {
      if (v !== undefined && meta[k] === undefined) meta[k] = v;
    }
  };
  const firstIdx = firstNonBlankIndex(lines);
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const d = parseDirective(line);
    if (d) {
      if (['title', 't'].includes(d.name)) merge({ title: d.value });
      else if (['artist', 'subtitle', 'st', 'composer'].includes(d.name)) merge({ artist: d.value });
      else if (d.name === 'key') merge({ key: normalizeKey(d.value) ?? d.value });
      else if (d.name === 'capo') merge({ capo: parseCapo(d.value) });
      else if (d.name === 'tuning') merge({ tuning: d.value });
      return;
    }
    const m = detectMetadata(line, idx === firstIdx);
    if (m) merge(m);
  });
  return meta;
}

export function parseSong(input: string): ParsedSong {
  const lines = preprocess(input);
  const meta = parseMetadata(lines);
  const { voicings } = scanVoicings(lines);
  const body = parseSongBody(input, voicings);
  return {
    title: meta.title?.trim() || 'Untitled Song',
    artist: meta.artist?.trim() ?? '',
    key: meta.key,
    capo: meta.capo,
    tuning: meta.tuning,
    customVoicings: voicings,
    lines: body,
  };
}
