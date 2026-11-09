/**
 * Renderer-agnostic fretboard geometry. Both the DOM <svg> component and the @react-pdf/renderer
 * <Svg> component consume these primitives, guaranteeing identical diagrams on screen and in print.
 *
 * Grid (viewBox units): 6 strings from x = 15 to x = 85 (dx = 14); fret lines from y = 25 to
 * y = 105. A double-thick nut is drawn at y = 25 for open-position voicings, otherwise a
 * "{baseFret}fr" label sits beside the first fret space. × / ○ markers sit at y = 15.
 */
import type { ChordVoicing, DiagramSize } from '@/types/chord';
import { DIAGRAM_FRETS } from './voicing';

export const GRID = {
  left: 15,
  right: 85,
  dx: 14,
  top: 25,
  bottom: 105,
  markerY: 15,
  /** viewBox starts left of 0 so multi-digit "12fr" labels are never clipped. */
  originX: -6,
  width: 106,
} as const;

/** Rendered diagram width in pt (PDF and on-screen paper preview), before the scale multiplier. */
export const DIAGRAM_WIDTH: Record<DiagramSize, number> = { compact: 28, standard: 44 };

export interface Line { x1: number; y1: number; x2: number; y2: number; width: number }
export interface Dot { cx: number; cy: number; r: number; finger?: number }
export interface Marker { x: number; y: number; kind: 'muted' | 'open'; size: number }
export interface Label { x: number; y: number; text: string; fontSize: number; anchor: 'start' | 'middle' | 'end' }

export interface FretboardGeometry {
  viewBox: string;
  width: number;
  height: number;
  strings: Line[];
  frets: Line[];
  nut?: { x: number; y: number; width: number; height: number };
  baseFretLabel?: Label;
  markers: Marker[];
  dots: Dot[];
  barre?: { x: number; y: number; width: number; height: number; rx: number };
  fingerLabels: Label[];
}

export const stringX = (i: number) => GRID.left + i * GRID.dx;

export function buildFretboardGeometry(voicing: ChordVoicing, size: DiagramSize = 'compact'): FretboardGeometry {
  const { frets, baseFret } = voicing;
  const rel = (f: number) => f - baseFret + 1;
  const maxRel = Math.max(0, ...frets.filter((f) => f > 0).map(rel));
  const numFrets = Math.max(DIAGRAM_FRETS, maxRel);
  const dy = (GRID.bottom - GRID.top) / numFrets;
  const fretY = (i: number) => GRID.top + i * dy;
  const r = Math.min(6, dy * 0.34);

  const showFingers = size === 'standard' && !!voicing.fingers?.some((f) => f > 0);
  const height = showFingers ? 122 : 112;

  const strings: Line[] = frets.map((_, i) => ({
    x1: stringX(i), y1: GRID.top, x2: stringX(i), y2: GRID.bottom, width: 1.2,
  }));
  const fretLines: Line[] = Array.from({ length: numFrets + 1 }, (_, j) => ({
    x1: GRID.left, y1: fretY(j), x2: GRID.right, y2: fretY(j), width: j === 0 && baseFret > 1 ? 1.6 : 1.2,
  }));

  const geometry: FretboardGeometry = {
    viewBox: `${GRID.originX} 0 ${GRID.width} ${height}`,
    width: GRID.width,
    height,
    strings,
    frets: fretLines,
    markers: [],
    dots: [],
    fingerLabels: [],
  };

  if (baseFret === 1) {
    geometry.nut = { x: GRID.left - 0.6, y: GRID.top - 5, width: GRID.right - GRID.left + 1.2, height: 5 };
  } else {
    geometry.baseFretLabel = {
      x: GRID.left - 2,
      y: fretY(0) + dy / 2 + 3.5,
      text: `${baseFret}fr`,
      fontSize: 9,
      anchor: "end",
    };
  }

  const barre = voicing.barre;
  frets.forEach((f, i) => {
    if (f < 0) geometry.markers.push({ x: stringX(i), y: GRID.markerY, kind: 'muted', size: 4 });
    else if (f === 0) geometry.markers.push({ x: stringX(i), y: GRID.markerY, kind: 'open', size: 4 });
    else {
      const coveredByBarre = barre && f === barre.fret && i >= barre.fromString && i <= barre.toString;
      if (coveredByBarre) return;
      geometry.dots.push({ cx: stringX(i), cy: fretY(rel(f)) - dy / 2, r, finger: voicing.fingers?.[i] || undefined });
    }
  });

  if (barre) {
    const cy = fretY(rel(barre.fret)) - dy / 2;
    const x1 = stringX(barre.fromString) - r;
    const x2 = stringX(barre.toString) + r;
    geometry.barre = { x: x1, y: cy - r, width: x2 - x1, height: 2 * r, rx: r };
  }

  if (showFingers) {
    voicing.fingers!.forEach((finger, i) => {
      if (finger > 0) {
        geometry.fingerLabels.push({ x: stringX(i), y: 118, text: String(finger), fontSize: 9, anchor: 'middle' });
      }
    });
  }

  return geometry;
}
