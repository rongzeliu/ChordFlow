'use client';

import { useRef, useState } from 'react';
import type {
  DiagramScope,
  DiagramSize,
  DisplayMode,
  LayoutPreset,
  PageSize,
  ParsedSong,
} from '@/types/chord';
import { prettyAccidentals } from '@/lib/music';
import { planSheet } from '@/lib/sheet';
import { FretboardSvg } from './FretboardSvg';

interface SheetPreviewProps {
  song: ParsedSong;
  preset: LayoutPreset;
  diagramSize: DiagramSize;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  capo: number;
  scale: number;
  pageSize: PageSize;
  gridSize?: number;
  showGrid?: boolean;
  chordGridOffsets?: Record<string, number>;
  onSnapChord?: (key: string, offsetCols: number) => void;
  onSelectChord?: (chordName: string) => void;
}

interface ActiveChordDrag {
  key: string;
  lineKey: string;
  pointerId: number;
  startX: number;
  baseCols: number;
  currentCols: number;
  cellPx: number;
  moved: boolean;
}

const INK = '#1A382B';

/** On-screen paper preview. Uses pt units so sizes match the exported PDF. */
export function SheetPreview({
  song,
  preset,
  diagramSize,
  diagramScope,
  displayMode,
  capo,
  scale,
  pageSize,
  gridSize = 24,
  showGrid = false,
  chordGridOffsets,
  onSnapChord,
  onSelectChord,
}: SheetPreviewProps) {
  const plan = planSheet(song, { preset, diagramScope, displayMode, capo });
  const isTwoColumn = preset === 'worship_two_column';
  const pt = (n: number) => `${n * scale}pt`;
  const cellPt = Math.max(8, gridSize) * scale;

  const [activeDrag, setActiveDrag] = useState<ActiveChordDrag | null>(null);
  const suppressClickRef = useRef(false);

  const gridBackgroundStyle =
    showGrid || activeDrag
      ? {
          backgroundImage:
            'linear-gradient(to right, rgba(26, 56, 43, 0.085) 1px, transparent 1px), linear-gradient(to bottom, rgba(26, 56, 43, 0.085) 1px, transparent 1px)',
          backgroundSize: `${cellPt}pt ${cellPt}pt`,
          backgroundPosition: '0 0',
        }
      : undefined;

  return (
    <article
      aria-label="Sheet preview"
      style={gridBackgroundStyle}
      className={`mx-auto w-full rounded-sm border border-warm-border bg-surface text-primary shadow-[0_1px_3px_rgba(26,56,43,0.05),0_10px_28px_rgba(26,56,43,0.04)] print:max-w-none print:border-0 print:shadow-none ${
        pageSize === 'A4' ? 'max-w-[210mm]' : 'max-w-[8.5in]'
      } px-8 py-10 sm:px-[20mm] sm:py-[18mm]`}
    >
      <header className="mb-[10mm] flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-warm-border pb-4">
        <div>
          <h1
            style={{ fontSize: pt(18) }}
            className="leading-tight font-semibold tracking-tight text-primary"
          >
            {plan.title}
          </h1>
          {plan.artist && (
            <p style={{ fontSize: pt(10) }} className="mt-1 text-muted">
              {plan.artist}
            </p>
          )}
        </div>
        <p style={{ fontSize: pt(9) }} className="font-medium text-muted">
          {prettyAccidentals(plan.keyInfo.summary)}
        </p>
      </header>

      {plan.glossary.length > 0 && (
        <section aria-label="Chord glossary" className="mb-[10mm] flex flex-wrap gap-x-6 gap-y-4">
          {plan.glossary.map((chord) => (
            <button
              key={chord.name}
              type="button"
              onClick={() => onSelectChord?.(chord.name)}
              aria-label={`Change shape for ${chord.name}`}
              className="group flex flex-col items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-honey/50 hover:bg-honey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <span style={{ fontSize: pt(9) }} className="font-semibold text-primary">
                {prettyAccidentals(chord.name)}
              </span>
              <FretboardSvg voicing={chord} size={diagramSize} scale={scale * 1.15} color={INK} />
            </button>
          ))}
        </section>
      )}

      <div className={isTwoColumn ? 'gap-[10mm] md:columns-2' : ''}>
        {plan.sections.map((sec, sIdx) => (
          <section key={sIdx} style={{ marginBottom: pt(16) }} className="break-inside-avoid">
            {sec.label && (
              <h3
                style={{ fontSize: pt(8.5), marginBottom: pt(6) }}
                className={
                  isTwoColumn
                    ? 'inline-block rounded-sm border border-primary/35 bg-sage px-1.5 py-px font-semibold tracking-wide text-primary uppercase'
                    : 'font-semibold tracking-wider text-muted uppercase'
                }
              >
                {sec.label}
              </h3>
            )}

            {sec.lines.map((line, lIdx) => {
              if (line.kind === 'comment') {
                return (
                  <p
                    key={lIdx}
                    style={{ fontSize: pt(9.5), marginBottom: pt(4) }}
                    className="text-muted italic"
                  >
                    {line.text}
                  </p>
                );
              }
              if (line.kind === 'tab') {
                return (
                  <pre
                    key={lIdx}
                    style={{ fontSize: pt(8.5) }}
                    className="overflow-x-auto font-mono leading-snug text-primary"
                  >
                    {line.text}
                  </pre>
                );
              }
              const lineKey = `${sIdx}:${lIdx}`;
              const isLineDragging = activeDrag?.lineKey === lineKey;
              return (
                <div
                  key={lIdx}
                  style={{
                    marginBottom: pt(line.hasDiagram ? 8 : 4),
                    ...(isLineDragging
                      ? {
                          backgroundImage:
                            'linear-gradient(to right, rgba(232, 168, 56, 0.35) 1px, transparent 1px)',
                          backgroundSize: `${cellPt}pt 100%`,
                        }
                      : {}),
                  }}
                  className={`flex flex-wrap items-end rounded-xs transition-colors ${
                    isLineDragging ? 'bg-honey-tint/50 ring-1 ring-honey/50' : ''
                  }`}
                >
                  {line.tokens.map((tok, tIdx) => {
                    const prevHyphenated = Boolean(line.tokens[tIdx - 1]?.isHyphenated);
                    const chordHeaders =
                      tok.chords ??
                      (tok.label && tok.chord
                        ? [
                            {
                              chord: tok.chord,
                              label: tok.label,
                              isCustom: tok.isCustom,
                              voicing: tok.voicing,
                              showDiagram: tok.showDiagram,
                            },
                          ]
                        : []);
                    const hasMultipleChords = chordHeaders.length > 1;
                    return (
                      <span key={tIdx} className="inline-flex flex-col items-start">
                        {chordHeaders.length > 0 && (
                          <span
                            className={`inline-flex items-end ${
                              hasMultipleChords ? 'gap-1.5 mr-[0.5em]' : ''
                            }`}
                          >
                            {chordHeaders.map((c, cIdx) => {
                              const chordKey = `${sIdx}:${lIdx}:${tIdx}:${cIdx}`;
                              const savedCols = chordGridOffsets?.[chordKey] ?? 0;
                              const isDraggingThis =
                                activeDrag?.key === chordKey && activeDrag.moved;
                              const effectiveCols =
                                activeDrag?.key === chordKey ? activeDrag.currentCols : savedCols;
                              const offsetPt = effectiveCols * cellPt;

                              return (
                                <button
                                  key={`${c.chord}-${cIdx}`}
                                  type="button"
                                  title={
                                    onSnapChord
                                      ? 'Drag left/right to snap onto grid · Click to change chord shape'
                                      : `Change shape for ${c.label}`
                                  }
                                  aria-label={`Change shape for ${c.label}`}
                                  style={
                                    offsetPt !== 0
                                      ? { position: 'relative', left: `${offsetPt}pt` }
                                      : undefined
                                  }
                                  onPointerDown={(e) => {
                                    if (!onSnapChord || e.button !== 0) return;
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    const cellPx = Math.max(8, cellPt * (96 / 72));
                                    setActiveDrag({
                                      key: chordKey,
                                      lineKey,
                                      pointerId: e.pointerId,
                                      startX: e.clientX,
                                      baseCols: savedCols,
                                      currentCols: savedCols,
                                      cellPx,
                                      moved: false,
                                    });
                                  }}
                                  onPointerMove={(e) => {
                                    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
                                    const dx = e.clientX - activeDrag.startX;
                                    const moved = activeDrag.moved || Math.abs(dx) >= 4;
                                    const deltaCols = Math.round(dx / activeDrag.cellPx);
                                    const nextCols = activeDrag.baseCols + deltaCols;
                                    if (
                                      moved !== activeDrag.moved ||
                                      nextCols !== activeDrag.currentCols
                                    ) {
                                      setActiveDrag({
                                        ...activeDrag,
                                        moved,
                                        currentCols: nextCols,
                                      });
                                    }
                                  }}
                                  onPointerUp={(e) => {
                                    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
                                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                      e.currentTarget.releasePointerCapture(e.pointerId);
                                    }
                                    const finished = activeDrag;
                                    setActiveDrag(null);
                                    if (finished.moved) {
                                      suppressClickRef.current = true;
                                      if (finished.currentCols !== finished.baseCols) {
                                        onSnapChord?.(finished.key, finished.currentCols);
                                      }
                                    }
                                  }}
                                  onPointerCancel={(e) => {
                                    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
                                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                      e.currentTarget.releasePointerCapture(e.pointerId);
                                    }
                                    setActiveDrag(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (!onSnapChord) return;
                                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                      e.preventDefault();
                                      const delta = e.key === 'ArrowRight' ? 1 : -1;
                                      onSnapChord(chordKey, savedCols + delta);
                                    }
                                  }}
                                  onClick={() => {
                                    if (suppressClickRef.current) {
                                      suppressClickRef.current = false;
                                      return;
                                    }
                                    onSelectChord?.(c.chord);
                                  }}
                                  className={`group relative inline-flex flex-col items-start rounded py-0.5 text-left transition select-none hover:bg-honey-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey ${
                                    onSnapChord ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                  } ${
                                    isDraggingThis
                                      ? 'z-20 bg-honey-tint ring-2 ring-honey shadow-sm'
                                      : ''
                                  } ${
                                    hasMultipleChords
                                      ? 'px-0.5'
                                      : tok.isHyphenated
                                        ? 'mr-0 pr-0.5 pl-1'
                                        : prevHyphenated
                                          ? 'mr-[0.5em] pr-1 pl-0'
                                          : 'mr-[0.5em] px-1'
                                  }`}
                                >
                                  {isDraggingThis && (
                                    <span className="pointer-events-none absolute -top-5 left-0 z-30 rounded bg-primary px-1.5 py-0.5 font-mono text-[9px] font-semibold whitespace-nowrap text-base shadow-xs">
                                      {effectiveCols > 0
                                        ? `+${effectiveCols} grid`
                                        : `${effectiveCols} grid`}
                                    </span>
                                  )}
                                  {c.showDiagram && c.voicing && (
                                    <span style={{ marginBottom: pt(2) }}>
                                      <FretboardSvg
                                        voicing={c.voicing}
                                        size={diagramSize}
                                        scale={scale}
                                        color={INK}
                                      />
                                    </span>
                                  )}
                                  <span
                                    style={{ fontSize: pt(9.5) }}
                                    className="rounded-xs bg-honey/25 px-1 leading-tight font-semibold text-primary decoration-honey decoration-2 underline-offset-2 group-hover:underline"
                                  >
                                    {prettyAccidentals(c.label)}
                                  </span>
                                </button>
                              );
                            })}
                          </span>
                        )}
                        <span
                          style={{ fontSize: pt(10.5) }}
                          className="leading-snug whitespace-pre-wrap text-primary"
                        >
                          {tok.text || '\u00A0'}
                        </span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </article>
  );
}
