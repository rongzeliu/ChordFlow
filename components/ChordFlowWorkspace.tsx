'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Bookmark, Check, Guitar, Library, Plus, X } from 'lucide-react';
import type { DiagramScope, DiagramSize, DisplayMode, LayoutPreset, PageSize } from '@/types/chord';
import { parseSong, parseSongBody } from '@/lib/parser';
import { computeKeyInfo } from '@/lib/sheet';
import {
  calculateCapoForKey,
  getKeyListForMode,
  normalizeKey,
  prettyAccidentals,
} from '@/lib/music';
import { mergeUserOverrides, useChordFlowStore } from '@/lib/store';
import { SONG_TEMPLATES } from '@/lib/templates';
import { fretsToString, parseFretString } from '@/lib/voicing';
import { FretboardSvg } from './FretboardSvg';
import { SheetPreview } from './SheetPreview';
import { Field, inputClass, Segmented, SidebarSection } from './ui';

const PDFDownloadButton = dynamic(
  () => import('./pdf/PDFDownloadButton').then((m) => m.PDFDownloadButton),
  {
    ssr: false,
    loading: () => (
      <span className="inline-flex h-9 items-center rounded-lg bg-stone-200 px-4 text-xs font-medium text-stone-500">
        Export PDF
      </span>
    ),
  },
);

const PRESETS: { id: LayoutPreset; title: string; description: string }[] = [
  { id: 'inline_all', title: 'Study', description: 'Diagram above every chord' },
  { id: 'first_occurrence_only', title: 'Rehearsal', description: 'Diagram on first appearance only' },
  { id: 'top_glossary', title: 'Glossary', description: 'Chord grid at the top, clean lyrics below' },
  { id: 'worship_two_column', title: 'Lead sheet', description: 'Two columns with section markers' },
];

export function ChordFlowWorkspace() {
  const {
    rawInput,
    activeTemplateId,
    preset,
    diagramSize,
    diagramScope,
    displayMode,
    scale,
    pageSize,
    capoOverride,
    customOverrides,
    savedSongs,
    setRawInput,
    loadTemplate,
    setPreset,
    setDiagramSize,
    setDiagramScope,
    setDisplayMode,
    setScale,
    setPageSize,
    setCapoOverride,
    setCustomOverride,
    removeCustomOverride,
    saveCurrentSong,
  } = useChordFlowStore();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [newChordName, setNewChordName] = useState('');
  const [newChordFrets, setNewChordFrets] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Grow the editor with its content, within sensible bounds so Layout & Options stay reachable.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(340, Math.max(200, el.scrollHeight))}px`;
  }, [rawInput]);

  const parsedSong = useMemo(() => {
    const base = parseSong(rawInput);
    const customVoicings = mergeUserOverrides(base.customVoicings, customOverrides);
    return { ...base, customVoicings, lines: parseSongBody(rawInput, customVoicings) };
  }, [rawInput, customOverrides]);

  const effectiveCapo = capoOverride ?? parsedSong.capo ?? 0;
  const keyInfo = useMemo(
    () => computeKeyInfo(parsedSong, effectiveCapo),
    [parsedSong, effectiveCapo],
  );
  const customVoicingList = Array.from(parsedSong.customVoicings.values());

  // Available target keys based on the song's base shape key (major or minor)
  const baseShapeKey = keyInfo.shapeKey ?? 'G';
  const availableKeys = useMemo(() => getKeyListForMode(baseShapeKey), [baseShapeKey]);
  const selectedKey = normalizeKey(keyInfo.concertKey ?? baseShapeKey) ?? availableKeys[0];

  const handleSelectTargetKey = (targetKey: string) => {
    const generatedCapo = calculateCapoForKey(baseShapeKey, targetKey);
    setCapoOverride(generatedCapo);
  };

  const handleSaveSong = () => {
    saveCurrentSong({
      title: parsedSong.title,
      artist: parsedSong.artist,
      lastPlayedKey: selectedKey,
      shapeKey: keyInfo.shapeKey,
      capo: effectiveCapo,
    });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const handleAddOverride = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newChordName.trim();
    if (!name) return setOverrideError('Enter a chord name, e.g. G*');
    if (!parseFretString(newChordFrets))
      return setOverrideError('Enter 6 frets, low E to high e, e.g. 320033');
    setCustomOverride(name, newChordFrets.trim());
    setNewChordName('');
    setNewChordFrets('');
    setOverrideError(null);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-6">
        <div className="flex items-center gap-2.5">
          <Guitar className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">ChordFlow</span>
        </div>

        <nav aria-label="Workspace actions" className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSaveSong}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            {justSaved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />
                <span>Save song</span>
              </>
            )}
          </button>

          <Link
            href="/saved"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <Library className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />
            <span>Saved songs</span>
            <span className="ml-0.5 rounded-full bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600">
              {savedSongs.length}
            </span>
          </Link>

          <PDFDownloadButton
            song={parsedSong}
            preset={preset}
            diagramSize={diagramSize}
            diagramScope={diagramScope}
            displayMode={displayMode}
            capo={effectiveCapo}
            scale={scale}
            pageSize={pageSize}
          />
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Sidebar — wider with comfortable side gutter so scrolling happens smoothly outside the lyrics textarea */}
        <aside className="min-h-0 shrink-0 divide-y divide-stone-100 overflow-y-auto border-stone-200 bg-white lg:w-[468px] lg:border-r">
          <SidebarSection
            title="Song"
            action={
              <select
                aria-label="Load an example song"
                value={SONG_TEMPLATES.some((t) => t.id === activeTemplateId) ? activeTemplateId : ''}
                onChange={(e) => e.target.value && loadTemplate(e.target.value)}
                className="rounded-md border-0 bg-transparent py-1 pr-1 text-right text-xs text-stone-500 hover:text-stone-900 focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              >
                <option value="">Load example…</option>
                {SONG_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            }
          >
            <div className="pr-3">
              <textarea
                id="song-sheet-input"
                ref={textareaRef}
                aria-label="Chord sheet"
                aria-describedby="song-sheet-hint"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                placeholder="Paste an Ultimate Guitar chord sheet or ChordPro…"
                className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
              />
            </div>
            <p id="song-sheet-hint" className="text-xs leading-relaxed text-stone-400">
              Define custom shapes like <code className="text-stone-600">G* = 320033</code>, then use{' '}
              <code className="text-stone-600">G*</code> in the song.
            </p>
          </SidebarSection>

          <SidebarSection title="Layout">
            <fieldset>
              <legend className="sr-only">Layout preset</legend>
              <div className="space-y-1">
                {PRESETS.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-50 has-[:checked]:bg-amber-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-500"
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={p.id}
                      checked={preset === p.id}
                      onChange={() => setPreset(p.id)}
                      className="mt-0.5 accent-amber-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-stone-900">{p.title}</span>
                      <span className="block text-xs text-stone-500">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </SidebarSection>

          <SidebarSection title="Options">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Field label="Key" htmlFor="target-key">
                <select
                  id="target-key"
                  value={selectedKey}
                  onChange={(e) => handleSelectTargetKey(e.target.value)}
                  className={inputClass}
                >
                  {availableKeys.map((k) => {
                    const capoForK = calculateCapoForKey(baseShapeKey, k);
                    return (
                      <option key={k} value={k}>
                        {prettyAccidentals(k)}
                        {capoForK === 0 ? ` (${prettyAccidentals(baseShapeKey)} open)` : ` (Capo ${capoForK})`}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="Capo position">
                <div
                  aria-live="polite"
                  className="flex h-[38px] items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm"
                >
                  <span className="font-medium text-stone-900">
                    {effectiveCapo === 0 ? 'Open (No capo)' : `Fret ${effectiveCapo}`}
                  </span>
                  {keyInfo.shapeKey && (
                    <span className="text-xs text-stone-500">
                      {prettyAccidentals(keyInfo.shapeKey)} shapes
                    </span>
                  )}
                </div>
              </Field>

              <div className="col-span-2">
                <Segmented<DisplayMode>
                  label="Chord names"
                  value={displayMode}
                  onChange={setDisplayMode}
                  options={[
                    { value: 'shapes', label: 'Capo shapes' },
                    { value: 'concert', label: 'Concert pitch' },
                  ]}
                />
              </div>
              <Segmented<DiagramScope>
                label="Diagrams for"
                value={diagramScope}
                onChange={setDiagramScope}
                options={[
                  { value: 'custom', label: 'Custom' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <Segmented<DiagramSize>
                label="Diagram size"
                value={diagramSize}
                onChange={setDiagramSize}
                options={[
                  { value: 'compact', label: 'S' },
                  { value: 'standard', label: 'L' },
                ]}
              />
              <Segmented<PageSize>
                label="Paper"
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { value: 'A4', label: 'A4' },
                  { value: 'LETTER', label: 'Letter' },
                ]}
              />
              <Field label={`Scale · ${Math.round(scale * 100)}%`} htmlFor="scale">
                <input
                  id="scale"
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="h-[38px] w-full accent-amber-600"
                />
              </Field>
            </div>
          </SidebarSection>

          <SidebarSection
            title="Custom voicings"
            action={<span className="text-xs text-stone-400">{customVoicingList.length}</span>}
          >
            {customVoicingList.length > 0 && (
              <ul role="list" className="grid grid-cols-4 gap-2">
                {customVoicingList.map((v) => (
                  <li
                    key={v.name}
                    className="group relative flex flex-col items-center gap-1 rounded-lg py-2 hover:bg-stone-50"
                  >
                    <span className="text-xs font-medium text-stone-900">
                      {prettyAccidentals(v.name)}
                    </span>
                    <FretboardSvg voicing={v} size="compact" scale={1.2} unit="px" color="#44403c" />
                    <span className="font-mono text-[10px] text-stone-400">
                      {fretsToString(v.frets)}
                    </span>
                    {customOverrides[v.name] && (
                      <button
                        type="button"
                        aria-label={`Remove ${v.name}`}
                        onClick={() => removeCustomOverride(v.name)}
                        className="absolute top-1 right-1 rounded p-0.5 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-900 focus-visible:opacity-100"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={handleAddOverride}
              className="grid grid-cols-[5.5rem_1fr_auto] items-end gap-2"
            >
              <Field label="Chord" htmlFor="override-chord-name">
                <input
                  id="override-chord-name"
                  name="chordName"
                  value={newChordName}
                  onChange={(e) => {
                    setNewChordName(e.target.value);
                    if (overrideError) setOverrideError(null);
                  }}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  placeholder="G*"
                  className={`${inputClass} font-mono text-xs`}
                />
              </Field>
              <Field label="Frets (6 → 1)" htmlFor="override-chord-frets">
                <input
                  id="override-chord-frets"
                  name="chordFrets"
                  value={newChordFrets}
                  onChange={(e) => {
                    setNewChordFrets(e.target.value);
                    if (overrideError) setOverrideError(null);
                  }}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  placeholder="320033"
                  className={`${inputClass} min-w-0 font-mono text-xs`}
                />
              </Field>
              <button
                type="submit"
                aria-label="Add voicing"
                className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-stone-200 px-3 text-stone-600 hover:bg-stone-50 hover:text-stone-900"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
            {overrideError && (
              <p role="alert" className="text-xs text-red-600">
                {overrideError}
              </p>
            )}
          </SidebarSection>
        </aside>

        {/* Preview canvas */}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
          <SheetPreview
            song={parsedSong}
            preset={preset}
            diagramSize={diagramSize}
            diagramScope={diagramScope}
            displayMode={displayMode}
            capo={effectiveCapo}
            scale={scale}
            pageSize={pageSize}
          />
        </main>
      </div>
    </div>
  );
}
