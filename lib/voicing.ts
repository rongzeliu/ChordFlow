import type { ChordVoicing } from '@/types/chord';
import { stripStars } from './music';

/** Number of fret spaces drawn in a diagram before it grows taller. */
export const DIAGRAM_FRETS = 4;

/**
 * Tokenizes a compact separator-free fret string (e.g. "320033", "101210111010", "x10121211x")
 * into 6 fret numbers (-1 for muted, 0..24 for frets).
 */
function parseCompactFretTokens(s: string): number[] | null {
  const result: number[] = [];

  function backtrack(idx: number): boolean {
    if (result.length === 6) {
      return idx === s.length;
    }
    if (idx >= s.length) return false;
    const remainingStrings = 6 - result.length;
    const remainingChars = s.length - idx;
    if (remainingChars < remainingStrings || remainingChars > remainingStrings * 2) {
      return false;
    }

    const ch = s[idx];
    if (/^[xXnN]$/.test(ch)) {
      result.push(-1);
      if (backtrack(idx + 1)) return true;
      result.pop();
      return false;
    }

    // Prefer 2-digit fret (10..24) when there are more characters than remaining strings
    if (idx + 1 < s.length) {
      const twoChar = s.slice(idx, idx + 2);
      if (/^(?:1[0-9]|2[0-4])$/.test(twoChar)) {
        result.push(parseInt(twoChar, 10));
        if (backtrack(idx + 2)) return true;
        result.pop();
      }
    }

    if (/^\d$/.test(ch)) {
      result.push(parseInt(ch, 10));
      if (backtrack(idx + 1)) return true;
      result.pop();
    }

    return false;
  }

  return backtrack(0) ? result : null;
}

/**
 * Parses a 6-string fret definition into absolute frets (low E → high e).
 * Accepts compact ("320033", "x32033", "101210111010") or separated ("x-3-2-0-3-3", "x 10 12 12 11 x") forms.
 */
export function parseFretString(input: string): number[] | null {
  const s = input.trim();
  if (!s) return null;
  if (/[\s\-,.]/.test(s)) {
    const tokens = s.split(/[\s\-,.]+/).filter(Boolean);
    if (tokens.length !== 6) return null;
    const frets: number[] = [];
    for (const t of tokens) {
      if (/^[xXnN]$/.test(t)) frets.push(-1);
      else if (/^\d{1,2}$/.test(t)) frets.push(parseInt(t, 10));
      else return null;
    }
    return frets;
  }
  return parseCompactFretTokens(s);
}

export function fretsToString(frets: number[]): string {
  return frets.map((f) => (f < 0 ? 'x' : String(f))).join('');
}

/** baseFret = 1 unless some fret exceeds the diagram window, then the lowest fretted note. */
export function computeBaseFret(frets: number[]): number {
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length) return 1;
  const max = Math.max(...fretted);
  return max > DIAGRAM_FRETS ? Math.min(...fretted) : 1;
}

/**
 * Heuristic barre detection: the lowest fretted fret appears on ≥ 2 strings spanning at least
 * 4 strings, and no string inside the span is open, muted or lower.
 */
export function detectBarre(frets: number[]): ChordVoicing['barre'] {
  const fretted = frets.filter((f) => f > 0);
  if (fretted.length < 4) return undefined;
  const min = Math.min(...fretted);
  const idx = frets.flatMap((f, i) => (f === min ? [i] : []));
  if (idx.length < 2) return undefined;
  const from = idx[0];
  const to = idx[idx.length - 1];
  if (to - from < 3) return undefined;
  for (let i = from; i <= to; i++) if (frets[i] < min) return undefined;
  return { fromString: from, toString: to, fret: min };
}

export function buildVoicing(
  name: string,
  frets: number[],
  isCustom: boolean,
  opts: { fingers?: number[]; baseFret?: number } = {},
): ChordVoicing | null {
  if (frets.length !== 6 || frets.every((f) => f < 0)) return null;
  const voicing: ChordVoicing = {
    name,
    rawName: stripStars(name),
    frets: [...frets],
    baseFret: opts.baseFret ?? computeBaseFret(frets),
    isCustom,
  };
  if (opts.fingers && opts.fingers.length === 6) voicing.fingers = [...opts.fingers];
  const barre = detectBarre(frets);
  if (barre) voicing.barre = barre;
  return voicing;
}
