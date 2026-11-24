'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Globe,
  Guitar,
  Library,
  Link2,
  Loader2,
  Music,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { DiagramSize, DisplayMode, LayoutPreset } from '@/types/chord';
import { useAuthStore } from '@/lib/authStore';
import { resolveVoicing } from '@/lib/chordLibrary';
import { publishSongToPublic, unpublishPublicSong } from '@/lib/firestoreSongs';
import {
  cleanRawPastedText,
  detectSupportedImportUrl,
  hasRawPasteClutter,
} from '@/lib/importers/textCleaner';
import type {
  ImportedSongResponse,
  ImportProvider,
  SongSearchResult,
} from '@/lib/importers/types';
import { parseSong, parseSongBody } from '@/lib/parser';
import { computeKeyInfo } from '@/lib/sheet';
import {
  calculateCapoForKey,
  getKeyListForMode,
  normalizeKey,
  prettyAccidentals,
} from '@/lib/music';
import { mergeUserOverrides, useChordFlowStore } from '@/lib/store';
import { fretsToString, parseFretString } from '@/lib/voicing';
import { AuthAccountButton } from './AuthAccountButton';
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
    activeSavedSongId,
    preset,
    diagramSize,
    displayMode,
    scale,
    pageSize,
    capoOverride,
    customOverrides,
    gridSize,
    showGrid,
    chordGridOffsets,
    savedSongs,
    setRawInput,
    applyImportedSong,
    setPreset,
    setDiagramSize,
    setDisplayMode,
    setScale,
    setPageSize,
    setCapoOverride,
    setCustomOverride,
    removeCustomOverride,
    setGridSize,
    setShowGrid,
    setChordGridOffset,
    resetChordGridOffsets,
    saveCurrentSong,
    setSongPublicState,
  } = useChordFlowStore();
  const { user, setAuthDialogOpen } = useAuthStore();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewMainRef = useRef<HTMLElement | null>(null);
  const [newChordName, setNewChordName] = useState('');
  const [newChordFrets, setNewChordFrets] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [editingChord, setEditingChord] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toastState, setToastState] = useState<{
    visible: boolean;
    message: string;
    kind: 'saved' | 'reset';
  }>({ visible: false, message: 'Saved', kind: 'saved' });
  const savedToastTimerRef = useRef<number | null>(null);

  const triggerToast = (message: string, kind: 'saved' | 'reset' = 'saved') => {
    setToastState({ visible: true, message, kind });
    if (savedToastTimerRef.current) {
      window.clearTimeout(savedToastTimerRef.current);
    }
    savedToastTimerRef.current = window.setTimeout(() => {
      setToastState((prev) => ({ ...prev, visible: false }));
    }, 2000);
  };

  // URL Importer, Multi-Source Song Search & Raw-Paste Cleaner state
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SongSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [failedImportUrl, setFailedImportUrl] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLFormElement | null>(null);
  const [importedMeta, setImportedMeta] = useState<{
    provider: ImportedSongResponse['provider'];
    sourceUrl: string;
  } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    rawInput: string;
    capoOverride: number | null;
    customOverrides: Record<string, string>;
    activeSavedSongId: string | null;
  } | null>(null);

  // Grow the editor with its content, within sensible bounds so Layout & Options stay reachable.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(340, Math.max(200, el.scrollHeight))}px`;
  }, [rawInput]);

  // Reload the sheet preview cleanly inside its own scroll pane when diagram size or layout changes,
  // ensuring the outer document never shifts or locks at an offset.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    previewMainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [diagramSize, preset, pageSize]);

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

  const activeSavedSong = useMemo(
    () => savedSongs.find((s) => s.id === activeSavedSongId) ?? null,
    [savedSongs, activeSavedSongId],
  );
  const isCurrentSongPublic = Boolean(activeSavedSong?.isPublic);

  const handleSaveSong = () => {
    const savedId = saveCurrentSong({
      title: parsedSong.title,
      artist: parsedSong.artist,
      lastPlayedKey: selectedKey,
      shapeKey: keyInfo.shapeKey,
      capo: effectiveCapo,
    });
    const updated = useChordFlowStore.getState().savedSongs.find((s) => s.id === savedId);
    if (updated?.isPublic && user?.uid) {
      const authorName =
        user.displayName?.trim() || user.email?.split('@')[0] || 'ChordFlow Musician';
      void publishSongToPublic(user.uid, authorName, updated).catch(() => {});
    }
    setJustSaved(true);
    triggerToast('Saved', 'saved');
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const handleTogglePublicShare = async () => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    try {
      setIsPublishing(true);
      const savedId = saveCurrentSong({
        title: parsedSong.title,
        artist: parsedSong.artist,
        lastPlayedKey: selectedKey,
        shapeKey: keyInfo.shapeKey,
        capo: effectiveCapo,
      });
      const currentSong = useChordFlowStore.getState().savedSongs.find((s) => s.id === savedId);
      if (!currentSong) return;

      const authorName =
        user.displayName?.trim() || user.email?.split('@')[0] || 'ChordFlow Musician';

      if (currentSong.isPublic) {
        await unpublishPublicSong(user.uid, currentSong);
        setSongPublicState(savedId, {
          isPublic: false,
          authorUid: currentSong.authorUid,
          authorName: currentSong.authorName,
          publishedAt: currentSong.publishedAt,
        });
        triggerToast('Removed from public library', 'reset');
      } else {
        const published = await publishSongToPublic(user.uid, authorName, currentSong);
        setSongPublicState(savedId, {
          isPublic: true,
          authorUid: published.authorUid,
          authorName: published.authorName,
          publishedAt: published.publishedAt,
        });
        triggerToast('Published to public library', 'saved');
      }
    } finally {
      setIsPublishing(false);
    }
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
    triggerToast('Saved', 'saved');
  };

  const formatProviderLabel = (provider: ImportProvider): string => {
    switch (provider) {
      case 'spotify':
        return 'Spotify';
      case 'itunes':
        return 'Apple Music';
      case 'gemini':
        return 'AI Chord Sheet';
      case 'youtube':
        return 'YouTube';
      case 'pnwchords':
        return 'PNW Chords';
      case 'worshiptogether':
        return 'WorshipTogether';
      case 'ultimate-guitar':
      default:
        return 'Ultimate Guitar';
    }
  };

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  // 300ms debounced live autocomplete for song/artist queries
  useEffect(() => {
    const trimmed = importUrl.trim();
    if (
      trimmed.length < 2 ||
      detectSupportedImportUrl(trimmed) !== null ||
      /^https?:\/\//i.test(trimmed) ||
      isImporting
    ) {
      if (trimmed.length === 0) {
        setSearchResults([]);
        setSearchOpen(false);
      }
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`/api/search-songs?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          results?: SongSearchResult[];
        };
        if (controller.signal.aborted) return;
        const list = Array.isArray(data.results) ? data.results : [];
        setSearchResults(list);
        if (list.length > 0) {
          setSearchOpen(true);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [importUrl, isImporting]);

  const performUrlImport = async (
    targetUrl: string,
    catalogMeta?: { title: string; artist: string },
  ) => {
    const trimmed = targetUrl.trim();
    if (!trimmed && !catalogMeta) {
      setImportError('Enter a song title/artist to search or paste a direct song link.');
      return;
    }
    const detected = trimmed ? detectSupportedImportUrl(trimmed) : null;
    if (!detected && !catalogMeta) {
      setImportError(
        'Unsupported link. Please paste a song URL from youtube.com, youtu.be, pnwchords.com, ultimate-guitar.com, or worshiptogether.com.',
      );
      return;
    }

    try {
      setIsImporting(true);
      setSearchOpen(false);
      setImportError(null);
      setFailedImportUrl(null);
      const res = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: detected ? detected.url : trimmed,
          title: catalogMeta?.title,
          artist: catalogMeta?.artist,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ImportedSongResponse> & {
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.formattedText) {
        if (detected) setFailedImportUrl(detected.url);
        setImportError(
          data.error ||
            'Could not import that link automatically. Copy the page text (Cmd+A / Ctrl+A) into the Song box below and click "Clean & Format Pasted Text".',
        );
        return;
      }

      setUndoSnapshot({
        rawInput,
        capoOverride,
        customOverrides: { ...customOverrides },
        activeSavedSongId,
      });
      applyImportedSong({
        formattedText: data.formattedText,
        capo: typeof data.capo === 'number' ? data.capo : 0,
      });
      setImportedMeta({
        provider: data.provider ?? detected?.provider ?? 'gemini',
        sourceUrl: data.sourceUrl ?? detected?.url ?? trimmed,
      });
      setImportUrl('');
      setSearchResults([]);
    } catch {
      if (detected) setFailedImportUrl(detected.url);
      setImportError(
        'Network error while importing link. You can paste the copied page text below and click "Clean & Format Pasted Text".',
      );
    } finally {
      setIsImporting(false);
    }
  };

  const performSongSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setImportError('Enter a song title/artist to search or paste a direct song link.');
      return;
    }
    try {
      setIsSearching(true);
      setImportError(null);
      setFailedImportUrl(null);
      const res = await fetch(`/api/search-songs?q=${encodeURIComponent(trimmed)}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: SongSearchResult[];
        error?: string;
      };
      const list = Array.isArray(data.results) ? data.results : [];
      setSearchResults(list);
      setSearchOpen(true);
      if (list.length === 0) {
        setImportError(
          `No chord sheets found for "${trimmed}". Try adding the artist name or paste a direct URL.`,
        );
      }
    } catch {
      setImportError('Unable to search songs right now. Try pasting a direct song URL.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = importUrl.trim();
    const detected = detectSupportedImportUrl(trimmed);
    if (detected) {
      void performUrlImport(detected.url);
    } else {
      void performSongSearch(trimmed);
    }
  };

  const handleCleanPastedText = () => {
    setUndoSnapshot({
      rawInput,
      capoOverride,
      customOverrides: { ...customOverrides },
      activeSavedSongId,
    });
    const cleaned = cleanRawPastedText(rawInput, importedMeta?.sourceUrl);
    applyImportedSong({
      formattedText: cleaned.formattedText,
      capo: typeof cleaned.capo === 'number' ? cleaned.capo : 0,
    });
    setImportError(null);
  };

  const handleUndoImport = () => {
    if (!undoSnapshot) return;
    applyImportedSong({
      formattedText: undoSnapshot.rawInput,
      capo: undoSnapshot.capoOverride,
      customOverrides: undoSnapshot.customOverrides,
      activeSavedSongId: undoSnapshot.activeSavedSongId,
    });
    setUndoSnapshot(null);
    setImportedMeta(null);
    setImportError(null);
  };

  const detectedRawUrlInEditor = useMemo(
    () => detectSupportedImportUrl(rawInput.trim()),
    [rawInput],
  );
  const showRawPasteCleaner = useMemo(
    () => Boolean(importError || hasRawPasteClutter(rawInput)),
    [importError, rawInput],
  );

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

          <button
            type="button"
            disabled={isPublishing}
            onClick={() => void handleTogglePublicShare()}
            title={
              isCurrentSongPublic
                ? 'Published in the public song library — click to unpublish'
                : 'Publish this song to the community public library'
            }
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:cursor-wait disabled:opacity-60 ${
              isCurrentSongPublic
                ? 'border-honey-deep/60 bg-honey-tint text-primary hover:bg-honey/25'
                : 'border-primary/25 bg-surface text-primary hover:border-primary/50 hover:bg-sage'
            }`}
          >
            {isPublishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Globe
                className={`h-3.5 w-3.5 ${isCurrentSongPublic ? 'text-primary' : 'text-muted'}`}
                aria-hidden="true"
              />
            )}
            <span>{isCurrentSongPublic ? 'Published' : 'Share publicly'}</span>
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

          <AuthAccountButton onStatusToast={(msg) => triggerToast(msg, 'saved')} />
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row print:block print:overflow-visible">
        {/* Sidebar — wider with comfortable side gutter so scrolling happens smoothly outside the lyrics textarea */}
        <aside className="min-h-0 shrink-0 divide-y divide-warm-border overflow-y-auto border-warm-border bg-base lg:w-[468px] lg:border-r print:hidden">
          <SidebarSection
            title="Song"
            action={
              undoSnapshot ? (
                <button
                  type="button"
                  onClick={handleUndoImport}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:bg-sage hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Undo import</span>
                </button>
              ) : null
            }
          >
            {/* Unified Song Search & URL Import Bar */}
            <form
              ref={searchContainerRef}
              onSubmit={handleImportSubmit}
              className="relative space-y-2 pr-3"
            >
              <label htmlFor="song-import-url" className="sr-only">
                Search song or artist, or paste a YouTube, PNW Chords, Ultimate Guitar, or
                WorshipTogether link
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  {detectSupportedImportUrl(importUrl) ? (
                    <Link2
                      className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                  ) : (
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                  )}
                  <input
                    id="song-import-url"
                    type="text"
                    value={importUrl}
                    onFocus={() => {
                      if (searchResults.length > 0 && !detectSupportedImportUrl(importUrl)) {
                        setSearchOpen(true);
                      }
                    }}
                    onChange={(e) => {
                      setImportUrl(e.target.value);
                      if (importError) setImportError(null);
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text').trim();
                      if (detectSupportedImportUrl(pasted)) {
                        e.preventDefault();
                        setImportUrl(pasted);
                        void performUrlImport(pasted);
                      }
                    }}
                    placeholder="Search song/artist or paste URL…"
                    className={`${inputClass} py-1.5 pr-2.5 pl-8 text-xs`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isImporting || isSearching}
                  className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-base transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:cursor-wait disabled:opacity-60"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Importing…</span>
                    </>
                  ) : isSearching ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Searching…</span>
                    </>
                  ) : detectSupportedImportUrl(importUrl) ? (
                    <span>Import</span>
                  ) : (
                    <span>Search</span>
                  )}
                </button>
              </div>

              {/* Search Results Dropdown Popover */}
              {searchOpen && searchResults.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Song search results"
                  className="absolute top-full right-3 left-0 z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-warm-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(26,56,43,0.16)] transition-all duration-150 ease-out starting:scale-95 starting:opacity-0"
                >
                  <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                    <span>Select a song to import</span>
                    <button
                      type="button"
                      onClick={() => setSearchOpen(false)}
                      aria-label="Close search results"
                      className="rounded p-0.5 text-muted hover:bg-sage hover:text-primary"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                  {searchResults.map((item) => (
                    <button
                      key={`${item.provider}-${item.id ?? item.url}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setSearchOpen(false);
                        void performUrlImport(item.url, {
                          title: item.title,
                          artist: item.artist,
                        });
                      }}
                      className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-sage/75 focus-visible:bg-sage/75 focus-visible:outline-none"
                    >
                      {item.artworkUrl ? (
                        <img
                          src={item.artworkUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-md border border-warm-border object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-warm-border bg-sage text-muted">
                          <Music className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-primary">
                          {item.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {item.artist}
                          {item.album ? ` · ${item.album}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-primary/20 bg-sage px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {formatProviderLabel(item.provider)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Imported Provider Status Pill */}
            {importedMeta && (
              <div className="mr-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-sage px-3 py-1.5 text-xs text-primary">
                <span className="font-medium">
                  Imported from {formatProviderLabel(importedMeta.provider)}
                </span>
                <a
                  href={importedMeta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline decoration-honey decoration-2 underline-offset-2 hover:text-primary-hover"
                >
                  <span>Source</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            )}

            {/* One-click import prompt if user pasted a URL straight into the main textarea */}
            {detectedRawUrlInEditor && !isImporting && (
              <div className="mr-3 flex items-center justify-between gap-2 rounded-lg border border-honey/60 bg-honey-tint px-3 py-2 text-xs text-primary">
                <span>Detected song link in editor.</span>
                <button
                  type="button"
                  onClick={() => void performUrlImport(detectedRawUrlInEditor.url)}
                  className="rounded-md bg-primary px-2.5 py-1 font-medium text-base hover:bg-primary-hover"
                >
                  Import &amp; Format
                </button>
              </div>
            )}

            {/* Dismissible Import Error Alert + Open Link / Raw Paste Cleaner Fallback */}
            {importError && (
              <div
                role="alert"
                className="mr-3 space-y-2 rounded-lg border border-honey-deep/50 bg-honey-tint p-3 text-xs text-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="leading-relaxed font-medium">{importError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setImportError(null);
                      setFailedImportUrl(null);
                    }}
                    aria-label="Dismiss import alert"
                    className="rounded p-0.5 text-muted hover:bg-sage hover:text-primary"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                {failedImportUrl && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={failedImportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-surface px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:border-primary/50 hover:bg-sage"
                    >
                      <span>Open link in new tab</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                )}
              </div>
            )}

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
                placeholder="Paste an Ultimate Guitar or PNW Chords sheet, or ChordPro…"
                className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
              />
            </div>

            {showRawPasteCleaner && (
              <div className="pr-3">
                <button
                  type="button"
                  onClick={handleCleanPastedText}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-sage px-3 py-2 text-xs font-semibold text-primary transition hover:border-primary/50 hover:bg-sage-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Clean &amp; Format Pasted Text</span>
                </button>
              </div>
            )}

            <p id="song-sheet-hint" className="text-xs leading-relaxed text-muted">
              Define custom shapes like{' '}
              <code className="rounded bg-sage px-1 py-0.5 font-mono text-primary">
                G* = 320033
              </code>
              , or click any chord on the sheet to pick a different position.
            </p>
          </SidebarSection>

          <SidebarSection title="Layout">
            <div role="radiogroup" aria-label="Layout preset" className="space-y-1.5">
              {PRESETS.map((p) => {
                const checked = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setPreset(p.id)}
                    className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-honey focus-visible:outline-none ${
                      checked
                        ? 'border-honey/60 bg-honey-tint'
                        : 'border-transparent hover:bg-sage/70'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                        checked ? 'border-primary bg-primary' : 'border-muted bg-surface'
                      }`}
                    >
                      {checked && <span className="h-1.5 w-1.5 rounded-full bg-base" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-primary">{p.title}</span>
                      <span className="block text-xs text-muted">{p.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
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
                  className="flex h-[38px] items-center justify-between gap-2 rounded-lg border border-warm-border bg-sage/65 px-3 text-sm"
                >
                  <span className="shrink-0 whitespace-nowrap font-medium text-primary">
                    {effectiveCapo === 0 ? 'No capo' : `Fret ${effectiveCapo}`}
                  </span>
                  {keyInfo.shapeKey && (
                    <span className="truncate whitespace-nowrap text-xs font-medium text-muted">
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
              <Segmented<'on' | 'off'>
                label="Sheet grid"
                value={showGrid ? 'on' : 'off'}
                onChange={(v) => setShowGrid(v === 'on')}
                options={[
                  { value: 'on', label: 'Show' },
                  { value: 'off', label: 'Hide' },
                ]}
              />
              <Field label={`Grid size · ${gridSize}pt`} htmlFor="grid-size">
                <input
                  id="grid-size"
                  type="range"
                  min={12}
                  max={48}
                  step={2}
                  value={gridSize}
                  onChange={(e) => setGridSize(parseInt(e.target.value, 10))}
                  className="h-[38px] w-full accent-forest"
                />
              </Field>
              <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg border border-warm-border bg-sage/55 px-3 py-2 text-xs text-muted">
                <span>Drag any chord on the sheet to snap it onto the grid.</span>
                {Object.keys(chordGridOffsets).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      resetChordGridOffsets();
                      triggerToast('Reset to default', 'reset');
                    }}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-primary/20 bg-surface px-2 py-1 text-[11px] font-medium text-primary transition hover:border-primary/40 hover:bg-honey-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Reset positions</span>
                  </button>
                )}
              </div>
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
                        aria-label={`Reset ${v.name} to default`}
                        title="Reset to default"
                        onClick={() => {
                          removeCustomOverride(v.name);
                          triggerToast('Reset to default', 'reset');
                        }}
                        className="absolute top-1 right-1 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-sage hover:text-primary focus-visible:opacity-100"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
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
          ref={previewMainRef}
          className={`min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10 lg:px-16 lg:py-12 ${
            exportOpen ? 'print:hidden' : 'print:overflow-visible print:p-0'
          }`}
        >
          <SheetPreview
            key={`${preset}-${diagramSize}-${pageSize}`}
            song={parsedSong}
            preset={preset}
            diagramSize={diagramSize}
            diagramScope="all"
            displayMode={displayMode}
            capo={effectiveCapo}
            scale={scale}
            pageSize={pageSize}
            gridSize={gridSize}
            showGrid={showGrid}
            chordGridOffsets={chordGridOffsets}
            onSnapChord={(key, cols) => {
              setChordGridOffset(key, cols);
              triggerToast('Saved', 'saved');
            }}
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
        onSelectFrets={(chord, frets) => {
          setCustomOverride(chord, frets);
          triggerToast('Saved', 'saved');
        }}
        onResetOverride={(chord) => {
          removeCustomOverride(chord);
          triggerToast('Reset to default', 'reset');
        }}
        onClose={() => setEditingChord(null)}
      />

      {/* Bottom-of-screen Confirmation Toast ("Saved" / "Reset to default") */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out print:hidden ${
          toastState.visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 py-2 text-xs font-semibold text-base shadow-[0_8px_24px_rgba(26,56,43,0.24)]">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-honey text-primary">
            {toastState.kind === 'reset' ? (
              <RotateCcw className="h-2.5 w-2.5 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
            )}
          </span>
          <span>{toastState.message}</span>
        </div>
      </div>

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
        gridSize={gridSize}
        showGrid={showGrid}
        chordGridOffsets={chordGridOffsets}
        onChangePreset={setPreset}
        onChangeDiagramSize={setDiagramSize}
        onChangeScale={setScale}
        onChangePageSize={setPageSize}
        onChangeGridSize={setGridSize}
        onChangeShowGrid={setShowGrid}
        onSnapChord={(key, cols) => {
          setChordGridOffset(key, cols);
          triggerToast('Saved', 'saved');
        }}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
