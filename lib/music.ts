/**
 * Chord-name recognition and transposition helpers.
 */

const NOTE = '[A-G](?:#|b)?';
const QUALITY = '(?:maj|min|mi|m|M|dim|aug|sus|add|\\+|°|ø|-|Δ)?';
const EXT =
  '(?:\\d{1,2}|maj\\d{1,2}|M\\d{1,2}|sus(?:[b#]?\\d{1,2})?|add[b#]?\\d{1,2}|dim\\d?|aug|[b#]\\d{1,2}|no\\d{1,2}|\\+\\d?|\\/[b#]?\\d{1,2}(?![#b])|\\([^)\\s]+\\))*';

/** Un-anchored chord pattern (no capture groups) for embedding in other regexes. */
export const CHORD_SOURCE = `${NOTE}${QUALITY}${EXT}(?:\\/${NOTE})?\\*{0,2}`;

const CHORD_RE = new RegExp(`^(${NOTE})(${QUALITY}${EXT})(?:\\/(${NOTE}))?(\\*{0,2})$`);

export interface ChordParts {
  root: string;
  suffix: string;
  bass?: string;
  stars: string;
}

export function isChord(token: string): boolean {
  return CHORD_RE.test(token);
}

export function parseChordName(name: string): ChordParts | null {
  const m = CHORD_RE.exec(name);
  if (!m) return null;
  return { root: m[1], suffix: m[2] ?? '', bass: m[3], stars: m[4] ?? '' };
}

export function stripStars(name: string): string {
  return name.replace(/\*+$/, '');
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteIndex(note: string): number {
  const base = NATURAL[note[0]];
  if (base === undefined) return -1;
  let idx = base;
  for (const acc of note.slice(1)) {
    if (acc === '#') idx += 1;
    else if (acc === 'b') idx -= 1;
  }
  return ((idx % 12) + 12) % 12;
}

export function noteName(index: number, preferFlats: boolean): string {
  const i = ((index % 12) + 12) % 12;
  return (preferFlats ? FLATS : SHARPS)[i];
}

export function transposeNote(note: string, semitones: number, preferFlats: boolean): string {
  const idx = noteIndex(note);
  if (idx < 0) return note;
  return noteName(idx + semitones, preferFlats);
}

/** Transposes a chord name, preserving suffix, slash bass and asterisks. */
export function transposeChord(name: string, semitones: number, preferFlats = false): string {
  if (semitones % 12 === 0) return name;
  const parts = parseChordName(name);
  if (!parts) return name;
  const root = transposeNote(parts.root, semitones, preferFlats);
  const bass = parts.bass ? `/${transposeNote(parts.bass, semitones, preferFlats)}` : '';
  return `${root}${parts.suffix}${bass}${parts.stars}`;
}

export const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Returns the 12 canonical keys matching the mode (major/minor) of `referenceKey`. */
export function getKeyListForMode(referenceKey?: string): string[] {
  const norm = referenceKey ? normalizeKey(referenceKey) : undefined;
  const isMinor = norm ? norm.endsWith('m') : false;
  return isMinor ? MINOR_KEY_NAMES.map((n) => `${n}m`) : [...MAJOR_KEY_NAMES];
}

/**
 * Computes the capo fret (0..11) required to sound in `targetKey` when playing `shapeKey` shapes:
 * `(noteIndex(targetRoot) - noteIndex(shapeRoot) + 12) % 12`.
 */
export function calculateCapoForKey(shapeKey: string, targetKey: string): number {
  const s = normalizeKey(shapeKey);
  const t = normalizeKey(targetKey);
  if (!s || !t) return 0;
  const sRoot = s.endsWith('m') ? s.slice(0, -1) : s;
  const tRoot = t.endsWith('m') ? t.slice(0, -1) : t;
  const sIdx = noteIndex(sRoot);
  const tIdx = noteIndex(tRoot);
  if (sIdx < 0 || tIdx < 0) return 0;
  return ((tIdx - sIdx) % 12 + 12) % 12;
}

function isMinorSuffix(suffix: string): boolean {
  return /^(m(?!aj)|min|mi(?!n)|-)/.test(suffix);
}

/** Normalises free-form key text ("G major", "E minor", "Bbm") to a chord-style key ("G", "Em", "Bbm"). */
export function normalizeKey(raw: string): string | undefined {
  const m = /^\s*([A-G](?:#|b|♯|♭)?)\s*(m(?!aj)|min(?:or)?|maj(?:or)?|-)?/i.exec(raw);
  if (!m) return undefined;
  const root = m[1][0].toUpperCase() + m[1].slice(1).replace('♯', '#').replace('♭', 'b');
  const q = (m[2] ?? '').toLowerCase();
  const minor = q === 'm' || q.startsWith('min') || q === '-';
  return `${root}${minor ? 'm' : ''}`;
}

/** Conventional spelling for a key `semitones` above `key`. */
export function transposeKey(key: string, semitones: number): string {
  const k = normalizeKey(key);
  if (!k) return key;
  const minor = k.endsWith('m');
  const root = minor ? k.slice(0, -1) : k;
  const idx = (noteIndex(root) + semitones + 120) % 12;
  return minor ? `${MINOR_KEY_NAMES[idx]}m` : MAJOR_KEY_NAMES[idx];
}

/** Whether chords in this key are conventionally spelled with flats. */
export function keyPrefersFlats(key: string | undefined): boolean {
  if (!key) return false;
  const k = normalizeKey(key);
  if (!k) return false;
  const minor = k.endsWith('m');
  const root = minor ? k.slice(0, -1) : k;
  if (root.includes('b')) return true;
  if (root.includes('#')) return false;
  return minor ? ['D', 'G', 'C', 'F'].includes(root) : root === 'F';
}

/** Best-effort key guess from the first chord of the song. */
export function guessKeyFromChord(chord: string | undefined): string | undefined {
  if (!chord) return undefined;
  const parts = parseChordName(stripStars(chord));
  if (!parts) return undefined;
  return `${parts.root}${isMinorSuffix(parts.suffix) ? 'm' : ''}`;
}

/**
 * Pretty-prints accidentals for on-screen display: "Bbm7" → "B♭m7", "F#" → "F♯".
 * Only apply to chord labels / key strings, never to lyrics.
 */
export function prettyAccidentals(text: string): string {
  return text.replace(/\b([A-G])b/g, '$1♭').replace(/\b([A-G])#/g, '$1♯');
}
