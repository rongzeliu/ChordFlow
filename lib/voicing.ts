import type { ChordVoicing } from '@/types/chord';
import { stripStars } from './music';

/** Number of fret spaces drawn in a diagram before it grows taller. */
export const DIAGRAM_FRETS = 4;

/**
 * Parses a 6-string fret definition into absolute frets (low E → high e).
 * Accepts compact ("320033", "x32033") or separated ("x-3-2-0-3-3", "x 10 12 12 11 x") forms.
 */
export function parseFretString(input: string): number[] | null {
  const s = input.trim();
  const tokens = /[\s\-,.]/.test(s) ? s.split(/[\s\-,.]+/).filter(Boolean) : s.split('');
  if (tokens.length !== 6) return null;
  const frets: number[] = [];
  for (const t of tokens) {
    if (/^[xXnN]$/.test(t)) frets.push(-1);
    else if (/^\d{1,2}$/.test(t)) frets.push(parseInt(t, 10));
    else return null;
  }
  return frets;
}

export function fretsToString(frets: number[]): string {
  const parts = frets.map((f) => (f < 0 ? 'x' : String(f)));
  return frets.some((f) => f > 9) ? parts.join('-') : parts.join('');
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
