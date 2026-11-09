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
}

const INK = '#292524';

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
}: SheetPreviewProps) {
  const plan = planSheet(song, { preset, diagramScope, displayMode, capo });
  const isTwoColumn = preset === 'worship_two_column';
  const pt = (n: number) => `${n * scale}pt`;

  return (
    <article
      aria-label="Sheet preview"
      className={`mx-auto w-full bg-white text-stone-900 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] ${
        pageSize === 'A4' ? 'max-w-[210mm]' : 'max-w-[8.5in]'
      } px-8 py-10 sm:px-[20mm] sm:py-[18mm]`}
    >
      <header className="mb-[10mm] flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
        <div>
          <h1 style={{ fontSize: pt(18) }} className="leading-tight font-semibold tracking-tight">
            {plan.title}
          </h1>
          {plan.artist && (
            <p style={{ fontSize: pt(10) }} className="mt-1 text-stone-500">
              {plan.artist}
            </p>
          )}
        </div>
        <p style={{ fontSize: pt(9) }} className="text-stone-500">
          {prettyAccidentals(plan.keyInfo.summary)}
        </p>
      </header>

      {plan.glossary.length > 0 && (
        <section aria-label="Chord glossary" className="mb-[10mm] flex flex-wrap gap-x-6 gap-y-4">
          {plan.glossary.map((chord) => (
            <figure key={chord.name} className="flex flex-col items-center gap-1">
              <figcaption style={{ fontSize: pt(9) }} className="font-semibold">
                {prettyAccidentals(chord.name)}
              </figcaption>
              <FretboardSvg voicing={chord} size={diagramSize} scale={scale * 1.15} color={INK} />
            </figure>
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
                    ? 'inline-block rounded-sm border border-stone-400 px-1.5 py-px font-semibold tracking-wide text-stone-700 uppercase'
                    : 'font-semibold tracking-wider text-stone-400 uppercase'
                }
              >
                {sec.label}
              </h3>
            )}

            {sec.lines.map((line, lIdx) => {
              if (line.kind === 'comment') {
                return (
                  <p key={lIdx} style={{ fontSize: pt(9.5), marginBottom: pt(4) }} className="text-stone-500 italic">
                    {line.text}
                  </p>
                );
              }
              if (line.kind === 'tab') {
                return (
                  <pre key={lIdx} style={{ fontSize: pt(8.5) }} className="overflow-x-auto font-mono leading-snug text-stone-700">
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
                      {tok.label && (
                        <span className="inline-flex flex-col items-start pr-[0.5em]">
                          {tok.showDiagram && tok.voicing && (
                            <span style={{ marginBottom: pt(2) }}>
                              <FretboardSvg voicing={tok.voicing} size={diagramSize} scale={scale} color={INK} />
                            </span>
                          )}
                          <span
                            style={{ fontSize: pt(9.5) }}
                            className={`leading-tight font-semibold ${tok.isCustom ? 'text-amber-700' : 'text-stone-700'}`}
                          >
                            {prettyAccidentals(tok.label)}
                          </span>
                        </span>
                      )}
                      <span style={{ fontSize: pt(10.5) }} className="leading-snug whitespace-pre">
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
