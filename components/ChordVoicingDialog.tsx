'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { ChordVoicing } from '@/types/chord';
import { getVoicingCandidates, type VoicingCandidate } from '@/lib/chordLibrary';
import { prettyAccidentals } from '@/lib/music';
import { fretsToString, parseFretString } from '@/lib/voicing';
import { FretboardSvg } from './FretboardSvg';
import { inputClass } from './ui';

interface ChordVoicingDialogProps {
  /** Chord name currently being inspected/edited (e.g. "G*", "Cadd9*", "Am7"), or null if closed. */
  chordName: string | null;
  /** Current resolved voicing for this chord in the song. */
  currentVoicing?: ChordVoicing;
  /** Song-level custom voicings map so we can surface the original tab's voicing too. */
  songCustomVoicings: Map<string, ChordVoicing>;
  /** Whether the user has an active custom override for this chord. */
  hasUserOverride: boolean;
  onSelectFrets: (chordName: string, fretString: string) => void;
  onResetOverride: (chordName: string) => void;
  onClose: () => void;
}

const SOURCE_BADGE: Record<VoicingCandidate['source'], string> = {
  song: 'Song Default',
  truefire: 'TrueFire Chart',
  'chords-db': 'All-Guitar-Chords DB',
  caged: 'CAGED Movable',
};

export function ChordVoicingDialog({
  chordName,
  currentVoicing,
  songCustomVoicings,
  hasUserOverride,
  onSelectFrets,
  onResetOverride,
  onClose,
}: ChordVoicingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [customFretsInput, setCustomFretsInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Sync native <dialog> modal open/close state with `chordName` prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (chordName) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setCustomFretsInput(currentVoicing ? fretsToString(currentVoicing.frets) : '');
      setCustomError(null);
    } else if (dialog.open) {
      dialog.close();
    }
  }, [chordName, currentVoicing]);

  // Native <dialog> close event listener + light-dismiss fallback for browsers without `closedby="any"`
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Fallback for browsers where `closedby="any"` is not yet supported (e.g. Safari)
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

  const candidates = useMemo(() => {
    if (!chordName) return [];
    return getVoicingCandidates(chordName, songCustomVoicings);
  }, [chordName, songCustomVoicings]);

  const activeFretSig = currentVoicing ? fretsToString(currentVoicing.frets) : '';

  const handleChooseCandidate = (cand: VoicingCandidate) => {
    if (!chordName) return;
    onSelectFrets(chordName, fretsToString(cand.voicing.frets));
    dialogRef.current?.close();
  };

  const handleApplyCustomFrets = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chordName) return;
    const parsed = parseFretString(customFretsInput);
    if (!parsed) {
      setCustomError('Enter 6 strings from low E to high e (e.g. 320033 or x-3-2-0-3-3).');
      return;
    }
    onSelectFrets(chordName, fretsToString(parsed));
    dialogRef.current?.close();
  };

  const handleReset = () => {
    if (!chordName) return;
    onResetOverride(chordName);
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-[1px]"
    >
      {chordName && (
        <div className="flex max-h-[85dvh] flex-col">
          {/* Dialog Header */}
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id={titleId} className="text-base font-semibold tracking-tight text-stone-900">
                  Choose voicing for{' '}
                  <span className="text-amber-700">{prettyAccidentals(chordName)}</span>
                </h2>
                <p className="text-xs text-stone-500">
                  Select a position from the chord database ({candidates.length}{' '}
                  {candidates.length === 1 ? 'shape' : 'shapes'} available) or enter custom frets.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasUserOverride && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-900"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset default
                </button>
              )}
              <form method="dialog">
                <button
                  type="submit"
                  value="cancel"
                  aria-label="Close voicing picker"
                  className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          {/* Voicing Positions Grid */}
          <div className="overflow-y-auto px-6 py-5">
            {candidates.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {candidates.map((cand, index) => {
                  const sig = fretsToString(cand.voicing.frets);
                  const isSelected = sig === activeFretSig;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      autoFocus={index === 0}
                      onClick={() => handleChooseCandidate(cand)}
                      className={`group relative flex flex-col items-center rounded-xl border p-3.5 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500/30'
                          : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/70'
                      }`}
                    >
                      {isSelected && (
                        <span
                          aria-label="Currently active shape"
                          className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      )}

                      <span className="mb-1 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">
                        {SOURCE_BADGE[cand.source]}
                      </span>

                      <div className="my-1.5 flex items-center justify-center">
                        <FretboardSvg
                          voicing={cand.voicing}
                          size="standard"
                          scale={1.45}
                          unit="px"
                          color="#1c1917"
                        />
                      </div>

                      <span className="mt-1 font-mono text-sm font-bold tracking-wide text-stone-900">
                        {sig}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[11px] text-stone-500">
                        {cand.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-stone-500">
                No pre-built database shapes found for {prettyAccidentals(chordName)}. Enter custom
                frets below.
              </p>
            )}
          </div>

          {/* Custom 6-String Fret Input Footer */}
          <div className="border-t border-stone-100 bg-stone-50/80 px-6 py-4">
            <form
              onSubmit={handleApplyCustomFrets}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <label htmlFor="dialog-custom-frets" className="text-xs font-medium text-stone-600">
                Custom 6-string voicing (low E → high e):
              </label>
              <div className="flex flex-1 items-center gap-2 sm:max-w-xs">
                <input
                  id="dialog-custom-frets"
                  name="customFrets"
                  value={customFretsInput}
                  onChange={(e) => {
                    setCustomFretsInput(e.target.value);
                    if (customError) setCustomError(null);
                  }}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  placeholder="e.g. 320033 or x-3-2-0-3-3"
                  className={`${inputClass} py-1.5 font-mono text-xs`}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-stone-800"
                >
                  Apply
                </button>
              </div>
            </form>
            {customError && (
              <p role="alert" className="mt-1.5 text-xs text-red-600">
                {customError}
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
