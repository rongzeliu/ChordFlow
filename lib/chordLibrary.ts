/**
 * Standard (non-custom) chord voicings: a curated open-position dictionary plus movable
 * E-shape / A-shape barre generators so any root + common quality resolves to a playable shape.
 */
import type { ChordVoicing } from '@/types/chord';
import { noteIndex, parseChordName, stripStars } from './music';
import { buildVoicing, parseFretString } from './voicing';

const OPEN_CHORDS: Record<string, string> = {
  C: 'x32010', Cmaj7: 'x32000', C7: 'x32310', Cadd9: 'x32030', Csus4: 'x33011', C6: 'x32210',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', Dmaj7: 'xx0222', Dsus2: 'xx0230',
  Dsus4: 'xx0233', D6: 'xx0202',
  E: '022100', Em: '022000', E7: '020100', Em7: '020000', Emaj7: '021100', Esus4: '022200',
  Eadd9: '024100',
  Fmaj7: 'xx3210',
  G: '320003', G7: '320001', Gmaj7: '320002', Gsus4: '3x0013', G6: '320000',
  A: 'x02220', Am: 'x02210', A7: 'x02020', Am7: 'x02010', Amaj7: 'x02120', Asus2: 'x02200',
  Asus4: 'x02230', A6: 'x02222', Aadd9: 'x02420',
  B7: 'x21202', Bm7: 'x20202',
  'D/F#': '200232', 'G/B': 'x20003', 'C/G': '332010', 'C/E': '032010', 'Am/G': '3x2210',
  'D/A': 'x00232', 'F/C': 'x33211',
};

/** Offsets relative to the root fret; -99 = muted. */
const X = -99;
const E_SHAPES: Record<string, number[]> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, X, 1, 1, 0, X],
  sus4: [0, 2, 2, 2, 0, 0],
  '6': [0, 2, 2, 1, 2, 0],
  '7sus4': [0, 2, 0, 2, 0, 0],
};
const A_SHAPES: Record<string, number[]> = {
  '': [X, 0, 2, 2, 2, 0],
  m: [X, 0, 2, 2, 1, 0],
  '7': [X, 0, 2, 0, 2, 0],
  m7: [X, 0, 2, 0, 1, 0],
  maj7: [X, 0, 2, 1, 2, 0],
  sus2: [X, 0, 2, 2, 0, 0],
  sus4: [X, 0, 2, 2, 3, 0],
  '7sus4': [X, 0, 2, 0, 3, 0],
  add9: [X, 0, 2, 4, 0, X],
  '9': [X, 0, -1, 0, 0, 0],
  m7b5: [X, 0, 1, 0, 1, X],
  dim7: [X, 0, 1, -1, 1, X],
  dim: [X, 0, 1, 2, 1, X],
  aug: [X, 0, -1, -2, -2, X],
};

function normalizeSuffix(suffix: string): string {
  let s = suffix;
  if (/^(maj|M)$/.test(s)) return '';
  if (s === 'Δ' || s === 'Δ7') return 'maj7';
  if (s === '°') return 'dim';
  if (s === '°7') return 'dim7';
  if (s === 'ø' || s === 'ø7') return 'm7b5';
  if (s === '+') return 'aug';
  if (s === 'sus') return 'sus4';
  s = s.replace(/^M(?=\d)/, 'maj').replace(/^min(?!or)/, 'm').replace(/^mi(?!n)/, 'm').replace(/^-/, 'm');
  return s;
}

/** Progressively simpler suffixes to try when an exact match is unavailable. */
function suffixFallbacks(suffix: string): string[] {
  const out = [suffix];
  const minor = /^m(?!aj)/.test(suffix);
  if (/^(m)?(9|11|13)$/.test(suffix)) out.push(minor ? 'm7' : '7');
  if (/^maj(9|11|13)$/.test(suffix)) out.push('maj7');
  if (/^7(sus4|sus2)$/.test(suffix)) out.push('sus4');
  out.push(minor ? 'm' : '');
  return [...new Set(out)];
}

const OPEN_BY_KEY = new Map<string, number[]>();
for (const [name, def] of Object.entries(OPEN_CHORDS)) {
  const parts = parseChordName(name);
  const frets = parseFretString(def);
  if (!parts || !frets) continue;
  OPEN_BY_KEY.set(libKey(noteIndex(parts.root), normalizeSuffix(parts.suffix), parts.bass), frets);
}

function libKey(rootIdx: number, suffix: string, bass?: string): string {
  return `${rootIdx}|${suffix}|${bass ? noteIndex(bass) : ''}`;
}

function movable(rootIdx: number, suffix: string): number[] | null {
  const candidates: number[][] = [];
  const tryShape = (shape: number[] | undefined, openStringIdx: number) => {
    if (!shape) return;
    let root = (rootIdx - openStringIdx + 12) % 12;
    const minOffset = Math.min(...shape.filter((o) => o !== X));
    if (root + minOffset < 0) root += 12;
    // Open-position shapes with a muted-in-the-middle pattern are awkward; prefer barres ≥ 1.
    if (root === 0 && shape.some((o) => o === X) && openStringIdx === 4) root += 12;
    candidates.push(shape.map((o) => (o === X ? -1 : root + o)));
  };
  tryShape(E_SHAPES[suffix], 4); // low E string
  tryShape(A_SHAPES[suffix], 9); // A string
  if (!candidates.length) return null;
  const maxFret = (f: number[]) => Math.max(...f);
  candidates.sort((a, b) => maxFret(a) - maxFret(b));
  return candidates[0];
}

function lookupFrets(rootIdx: number, suffix: string, bass?: string): number[] | null {
  if (bass) {
    const exact = OPEN_BY_KEY.get(libKey(rootIdx, suffix, bass));
    if (exact) return exact;
  }
  for (const s of suffixFallbacks(suffix)) {
    const open = OPEN_BY_KEY.get(libKey(rootIdx, s));
    if (open) return open;
    const mov = movable(rootIdx, s);
    if (mov) return mov;
  }
  return null;
}

/** Looks up a standard voicing for a chord name (asterisks ignored). */
export function lookupStandardVoicing(name: string): ChordVoicing | undefined {
  const bare = stripStars(name);
  const parts = parseChordName(bare);
  if (!parts) return undefined;
  const rootIdx = noteIndex(parts.root);
  const suffix = normalizeSuffix(parts.suffix);
  let frets = lookupFrets(rootIdx, suffix, parts.bass);
  if (!frets) return undefined;
  frets = [...frets];

  // Approximate unknown slash chords by placing the bass note on the low E string when it fits.
  if (parts.bass && !OPEN_BY_KEY.has(libKey(rootIdx, suffix, parts.bass))) {
    const bassFret = (noteIndex(parts.bass) - 4 + 12) % 12;
    const maxFret = Math.max(...frets);
    if (bassFret <= 3 && maxFret <= 4 && frets[1] !== bassFret) frets[0] = bassFret;
  }
  return buildVoicing(bare, frets, false) ?? undefined;
}

/**
 * Resolves the voicing for a chord token: custom definitions first (exact, then without
 * asterisk), then the standard library.
 */
export function resolveVoicing(
  chord: string,
  custom: Map<string, ChordVoicing>,
): ChordVoicing | undefined {
  const exact = custom.get(chord);
  if (exact) return exact;
  const bare = stripStars(chord);
  const bareMatch = custom.get(bare);
  if (bareMatch) return bareMatch;
  const lib = lookupStandardVoicing(bare);
  if (!lib) return undefined;
  return { ...lib, name: chord, isCustom: chord !== bare };
}
