'use client';

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
  onSelectChord?: (chordName: string) => void;
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
  onSelectChord,
}: SheetPreviewProps) {
  const plan = planSheet(song, { preset, diagramScope, displayMode, capo });
  const isTwoColumn = preset === 'worship_two_column';
  const pt = (n: number) => `${n * scale}pt`;

  return (
    <article
      aria-label="Sheet preview"
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
              return (
                <div
                  key={lIdx}
                  style={{ marginBottom: pt(line.hasDiagram ? 8 : 4) }}
                  className="flex flex-wrap items-end"
                >
                  {line.tokens.map((tok, tIdx) => (
                    <span key={tIdx} className="inline-flex flex-col items-start">
                      {tok.label && tok.chord && (
                        <button
                          type="button"
                          onClick={() => tok.chord && onSelectChord?.(tok.chord)}
                          aria-label={`Change shape for ${tok.label}`}
                          className="group mr-[0.5em] inline-flex cursor-pointer flex-col items-start rounded px-1 py-0.5 text-left transition hover:bg-honey-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey"
                        >
                          {tok.showDiagram && tok.voicing && (
                            <span style={{ marginBottom: pt(2) }}>
                              <FretboardSvg
                                voicing={tok.voicing}
                                size={diagramSize}
                                scale={scale}
                                color={INK}
                              />
                            </span>
                          )}
                          <span
                            style={{ fontSize: pt(9.5) }}
                            className={`leading-tight font-semibold decoration-honey decoration-2 underline-offset-2 group-hover:underline ${
                              tok.isCustom
                                ? 'rounded-xs bg-honey/25 px-1 text-primary'
                                : 'text-primary'
                            }`}
                          >
                            {prettyAccidentals(tok.label)}
                          </span>
                        </button>
                      )}
                      <span
                        style={{ fontSize: pt(10.5) }}
                        className="leading-snug whitespace-pre text-primary"
                      >
                        {tok.text || '\u00A0'}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </article>
  );
}
