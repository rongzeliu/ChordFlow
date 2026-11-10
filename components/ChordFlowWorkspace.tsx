'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Bookmark, Check, Download, Guitar, Library, Plus, X } from 'lucide-react';
import type { DiagramSize, DisplayMode, LayoutPreset } from '@/types/chord';
import { resolveVoicing } from '@/lib/chordLibrary';
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
import { ChordVoicingDialog } from './ChordVoicingDialog';
import { FretboardSvg } from './FretboardSvg';
import { SheetPreview } from './SheetPreview';
import { Field, inputClass, Segmented, SidebarSection } from './ui';

const ExportPreviewDialog = dynamic(
  () => import('./ExportPreviewDialog').then((m) => m.ExportPreviewDialog),
  { ssr: false },
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
  const [editingChord, setEditingChord] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Grow the editor with its content, within sensible bounds so Layout & Options stay reachable.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(340, Math.max(200, el.scrollHeight))}px`;
  }, [rawInput]);

  const baseParsedSong = useMemo(() => parseSong(rawInput), [rawInput]);

  const parsedSong = useMemo(() => {
    const customVoicings = mergeUserOverrides(baseParsedSong.customVoicings, customOverrides);
    return { ...baseParsedSong, customVoicings, lines: parseSongBody(rawInput, customVoicings) };
  }, [baseParsedSong, rawInput, customOverrides]);

  const effectiveCapo = capoOverride ?? parsedSong.capo ?? 0;
  const keyInfo = useMemo(
    () => computeKeyInfo(parsedSong, effectiveCapo),
    [parsedSong, effectiveCapo],
  );
  const customVoicingList = Array.from(parsedSong.customVoicings.values());

  // Collect all unique chords in the song (both custom and standard) so the user can click any of them
  const allSongChords = useMemo(() => {
    const map = new Map(parsedSong.customVoicings);
    for (const line of parsedSong.lines) {
      for (const tok of line.tokens) {
        if (tok.chord && tok.voicing && !map.has(tok.chord)) {
          map.set(tok.chord, { ...tok.voicing, name: tok.chord });
        }
      }
    }
    return Array.from(map.values());
  }, [parsedSong]);

  const editingCurrentVoicing = useMemo(() => {
    if (!editingChord) return undefined;
    return resolveVoicing(editingChord, parsedSong.customVoicings);
  }, [editingChord, parsedSong.customVoicings]);

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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas text-primary print:static print:h-auto print:overflow-visible print:bg-surface">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-warm-border bg-base px-6 print:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-honey/30 text-primary">
            <Guitar className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-primary">ChordFlow</span>
        </div>

        <nav aria-label="Workspace actions" className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSaveSong}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-3.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
          >
            {justSaved ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="font-semibold text-primary">Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span>Save song</span>
              </>
            )}
          </button>

          <Link
            href="/saved"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-3.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
          >
            <Library className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            <span>Saved songs</span>
            <span className="ml-0.5 rounded-full bg-sage px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {savedSongs.length}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-base shadow-[0_1px_2px_rgba(26,56,43,0.16)] transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export</span>
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row print:block print:overflow-visible">
        {/* Sidebar — wider with comfortable side gutter so scrolling happens smoothly outside the lyrics textarea */}
        <aside className="min-h-0 shrink-0 divide-y divide-warm-border overflow-y-auto border-warm-border bg-base lg:w-[468px] lg:border-r print:hidden">
          <SidebarSection
            title="Song"
            action={
              <select
                aria-label="Load an example song"
                value={SONG_TEMPLATES.some((t) => t.id === activeTemplateId) ? activeTemplateId : ''}
                onChange={(e) => e.target.value && loadTemplate(e.target.value)}
                className="rounded-md border-0 bg-transparent py-1 pr-1 text-right text-xs font-medium text-muted hover:text-primary focus:ring-2 focus:ring-honey/50 focus:outline-none"
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
            <p id="song-sheet-hint" className="text-xs leading-relaxed text-muted">
              Define custom shapes like{' '}
              <code className="rounded bg-sage px-1 py-0.5 font-mono text-primary">
                G* = 320033
              </code>
              , or click any chord on the sheet to pick a different position.
            </p>
          </SidebarSection>

          <SidebarSection title="Layout">
            <fieldset>
              <legend className="sr-only">Layout preset</legend>
              <div className="space-y-1.5">
                {PRESETS.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:bg-sage/70 has-[:checked]:border-honey/60 has-[:checked]:bg-honey-tint has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-honey"
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={p.id}
                      checked={preset === p.id}
                      onChange={() => setPreset(p.id)}
                      className="mt-0.5 accent-forest"
                    />
                    <span>
                      <span className="block text-sm font-medium text-primary">{p.title}</span>
                      <span className="block text-xs text-muted">{p.description}</span>
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
                  className="flex h-[38px] items-center justify-between rounded-lg border border-warm-border bg-sage/65 px-3 text-sm"
                >
                  <span className="font-medium text-primary">
                    {effectiveCapo === 0 ? 'Open (No capo)' : `Fret ${effectiveCapo}`}
                  </span>
                  {keyInfo.shapeKey && (
                    <span className="text-xs font-medium text-muted">
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
              <Segmented<DiagramSize>
                label="Diagram size"
                value={diagramSize}
                onChange={setDiagramSize}
                options={[
                  { value: 'compact', label: 'S' },
                  { value: 'standard', label: 'L' },
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
                  className="h-[38px] w-full accent-forest"
                />
              </Field>
            </div>
          </SidebarSection>

          <SidebarSection
            title="Song chords & voicings"
            action={
              <span className="text-xs text-muted">
                Click any chord to change shape ({allSongChords.length || customVoicingList.length})
              </span>
            }
          >
            {allSongChords.length > 0 && (
              <ul role="list" className="grid grid-cols-4 gap-2">
                {allSongChords.map((v) => (
                  <li
                    key={v.name}
                    className="group relative flex flex-col items-center rounded-lg border border-transparent transition hover:border-warm-border-strong hover:bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() => setEditingChord(v.name)}
                      aria-label={`Change voicing for ${v.name}`}
                      className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                    >
                      <span className="rounded-xs px-1 text-xs font-semibold text-primary group-hover:bg-honey/25">
                        {prettyAccidentals(v.name)}
                      </span>
                      <FretboardSvg
                        voicing={v}
                        size="compact"
                        scale={1.2}
                        unit="px"
                        color="#1A382B"
                      />
                      <span className="font-mono text-[10px] text-muted">
                        {fretsToString(v.frets)}
                      </span>
                    </button>
                    {customOverrides[v.name] && (
                      <button
                        type="button"
                        aria-label={`Reset ${v.name}`}
                        onClick={() => removeCustomOverride(v.name)}
                        className="absolute top-1 right-1 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-sage hover:text-primary focus-visible:opacity-100"
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
                className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-surface px-3 text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
            {overrideError && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {overrideError}
              </p>
            )}
          </SidebarSection>
        </aside>

        {/* Preview canvas */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10 lg:px-16 lg:py-12 ${
            exportOpen ? 'print:hidden' : 'print:overflow-visible print:p-0'
          }`}
        >
          <SheetPreview
            song={parsedSong}
            preset={preset}
            diagramSize={diagramSize}
            diagramScope="all"
            displayMode={displayMode}
            capo={effectiveCapo}
            scale={scale}
            pageSize={pageSize}
            onSelectChord={(chord) => setEditingChord(chord)}
          />
        </main>
      </div>

      {/* Interactive Chord Voicing Picker Popup */}
      <ChordVoicingDialog
        chordName={editingChord}
        currentVoicing={editingCurrentVoicing}
        songCustomVoicings={baseParsedSong.customVoicings}
        hasUserOverride={Boolean(editingChord && customOverrides[editingChord])}
        onSelectFrets={(chord, frets) => setCustomOverride(chord, frets)}
        onResetOverride={(chord) => removeCustomOverride(chord)}
        onClose={() => setEditingChord(null)}
      />

      {/* Export & Print Preview Modal Popup */}
      <ExportPreviewDialog
        open={exportOpen}
        song={parsedSong}
        preset={preset}
        diagramSize={diagramSize}
        diagramScope="all"
        displayMode={displayMode}
        capo={effectiveCapo}
        scale={scale}
        pageSize={pageSize}
        onChangePreset={setPreset}
        onChangeDiagramSize={setDiagramSize}
        onChangeScale={setScale}
        onChangePageSize={setPageSize}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
