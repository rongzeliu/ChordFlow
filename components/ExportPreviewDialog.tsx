'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Download, FileText, Loader2, Printer, X } from 'lucide-react';
import type {
  DiagramScope,
  DiagramSize,
  DisplayMode,
  LayoutPreset,
  PageSize,
  ParsedSong,
} from '@/types/chord';
import { SongPDFDocument } from './pdf/SongPDFDocument';
import { SheetPreview } from './SheetPreview';
import { Field, inputClass, Segmented } from './ui';

interface ExportPreviewDialogProps {
  open: boolean;
  song: ParsedSong;
  preset: LayoutPreset;
  diagramSize: DiagramSize;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  capo: number;
  scale: number;
  pageSize: PageSize;
  onChangePreset: (preset: LayoutPreset) => void;
  onChangeDiagramSize: (size: DiagramSize) => void;
  onChangeScale: (scale: number) => void;
  onChangePageSize: (pageSize: PageSize) => void;
  onClose: () => void;
}

const PRESET_LABELS: { id: LayoutPreset; label: string }[] = [
  { id: 'inline_all', label: 'Study (Diagram above every chord)' },
  { id: 'first_occurrence_only', label: 'Rehearsal (First appearance only)' },
  { id: 'top_glossary', label: 'Glossary (Chord grid at top)' },
  { id: 'worship_two_column', label: 'Lead sheet (Two columns)' },
];

export function ExportPreviewDialog({
  open,
  song,
  preset,
  diagramSize,
  diagramScope,
  displayMode,
  capo,
  scale,
  pageSize,
  onChangePreset,
  onChangeDiagramSize,
  onChangeScale,
  onChangePageSize,
  onClose,
}: ExportPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [compiling, setCompiling] = useState(false);

  // Sync native <dialog> open/close state with `open` prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Native <dialog> close event listener + light-dismiss fallback for browsers without `closedby="any"`
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupBackdrop: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialog.close();
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupBackdrop = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupBackdrop?.();
    };
  }, [onClose]);

  const handleDownloadPDF = async () => {
    try {
      setCompiling(true);
      const blob = await pdf(
        <SongPDFDocument
          song={song}
          preset={preset}
          diagramSize={diagramSize}
          diagramScope={diagramScope}
          displayMode={displayMode}
          capo={capo}
          scale={scale}
          pageSize={pageSize}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const safeTitle =
        (song.title || 'chordflow-sheet')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'chordflow-sheet';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}-${preset}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setCompiling(false);
    }
  };

  const handleNativePrint = () => {
    window.print();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="export-preview-dialog m-auto w-full max-w-5xl rounded-2xl border border-warm-border bg-surface p-0 text-primary shadow-[0_20px_50px_rgba(26,56,43,0.22)] backdrop:bg-primary/45 backdrop:backdrop-blur-[1px]"
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col print:block print:max-h-none">
          {/* Header (hidden when printing natively) */}
          <div className="flex items-center justify-between border-b border-warm-border bg-base px-6 py-4 print:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-honey/30 text-primary">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id={titleId} className="text-base font-semibold tracking-tight text-primary">
                  Export &amp; Print Preview
                </h2>
                <p className="text-xs text-muted">
                  Adjust paper size and download settings or print directly from your browser.
                </p>
              </div>
            </div>

            <form method="dialog">
              <button
                type="submit"
                value="cancel"
                aria-label="Close export preview"
                className="rounded-lg p-1.5 text-muted transition hover:bg-sage hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>

          {/* Export Size & Formatting Controls Bar (hidden when printing natively) */}
          <div className="grid grid-cols-1 gap-4 border-b border-warm-border bg-base/80 px-6 py-3.5 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
            <Segmented<PageSize>
              label="Paper size"
              value={pageSize}
              onChange={onChangePageSize}
              options={[
                { value: 'A4', label: 'A4 (210 × 297mm)' },
                { value: 'LETTER', label: 'Letter (8.5 × 11in)' },
              ]}
            />

            <Segmented<DiagramSize>
              label="Diagram size"
              value={diagramSize}
              onChange={onChangeDiagramSize}
              options={[
                { value: 'compact', label: 'Small (S)' },
                { value: 'standard', label: 'Large (L)' },
              ]}
            />

            <Field label="Layout style" htmlFor="export-preset-select">
              <select
                id="export-preset-select"
                value={preset}
                onChange={(e) => onChangePreset(e.target.value as LayoutPreset)}
                className={`${inputClass} py-1.5 text-xs`}
              >
                {PRESET_LABELS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Download scale · ${Math.round(scale * 100)}%`} htmlFor="export-scale">
              <input
                id="export-scale"
                type="range"
                min={0.8}
                max={1.2}
                step={0.05}
                value={scale}
                onChange={(e) => onChangeScale(parseFloat(e.target.value))}
                className="h-[34px] w-full accent-forest"
              />
            </Field>
          </div>

          {/* Scrollable Sheet Preview Area */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-6 py-8 sm:px-10 print:overflow-visible print:bg-surface print:p-0">
            <SheetPreview
              song={song}
              preset={preset}
              diagramSize={diagramSize}
              diagramScope={diagramScope}
              displayMode={displayMode}
              capo={capo}
              scale={scale}
              pageSize={pageSize}
            />
          </div>

          {/* Footer Actions (hidden when printing natively) */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warm-border bg-base px-6 py-4 print:hidden">
            <p className="text-xs font-medium text-muted">
              {pageSize === 'A4' ? 'A4 (210 × 297 mm)' : 'US Letter (8.5 × 11 in)'} ·{' '}
              {diagramSize === 'compact' ? 'Compact diagrams' : 'Standard diagrams'} ·{' '}
              {Math.round(scale * 100)}% scale
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleNativePrint}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/25 bg-surface px-4 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
              >
                <Printer className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span>Print…</span>
              </button>

              <button
                type="button"
                autoFocus
                onClick={handleDownloadPDF}
                disabled={compiling}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-base shadow-[0_1px_2px_rgba(26,56,43,0.16)] transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:cursor-wait disabled:opacity-60"
              >
                {compiling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{compiling ? 'Compiling PDF…' : 'Download PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
