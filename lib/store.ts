'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChordVoicing,
  DiagramScope,
  DiagramSize,
  DisplayMode,
  LayoutPreset,
  PageSize,
} from '@/types/chord';
import { auth } from './firebase';
import { deletePublicSongDoc, deleteUserSong, upsertUserSong } from './firestoreSongs';
import { getStarterSongs } from './seedSongs';
import { SKELETON_SONG_TEMPLATE, SONG_TEMPLATES } from './templates';
import { buildVoicing, parseFretString } from './voicing';

export interface SavedSong {
  id: string;
  title: string;
  artist: string;
  /** The sounding (concert) key or shape key last played when saved. */
  lastPlayedKey: string;
  shapeKey?: string;
  capo: number;
  rawInput: string;
  preset: LayoutPreset;
  diagramSize: DiagramSize;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  scale: number;
  pageSize: PageSize;
  customOverrides: Record<string, string>;
  gridSize?: number;
  showGrid?: boolean;
  chordGridOffsets?: Record<string, number>;
  isPublic?: boolean;
  authorUid?: string;
  authorName?: string;
  publishedAt?: string;
  updatedAt: string;
}

interface ChordFlowState {
  rawInput: string;
  activeTemplateId: string;
  /** ID of the currently loaded saved song, if any. */
  activeSavedSongId: string | null;
  preset: LayoutPreset;
  diagramSize: DiagramSize;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  scale: number;
  pageSize: PageSize;
  /** Optional user override for Capo (null = use song's parsed capo or 0). */
  capoOverride: number | null;
  /** User-defined custom chord overrides keyed by chord name (e.g., "G*" -> "320033"). */
  customOverrides: Record<string, string>;
  /** Grid cell size in pt (12..48) used for snapping chords on the sheet & PDF. */
  gridSize: number;
  /** Whether the visual snap grid is rendered on the sheet preview & PDF. */
  showGrid: boolean;
  /** User-snapped horizontal grid cell offsets per chord token (`sIdx:lIdx:tIdx:cIdx` -> grid cells). */
  chordGridOffsets: Record<string, number>;
  /** Saved song library persisted in LocalStorage. */
  savedSongs: SavedSong[];

  setRawInput: (rawInput: string) => void;
  /** Atomically replaces the current song input and syncs capo/overrides (used by URL importer & undo). */
  applyImportedSong: (payload: {
    formattedText: string;
    capo?: number | null;
    customOverrides?: Record<string, string>;
    activeSavedSongId?: string | null;
  }) => void;
  loadTemplate: (templateId: string) => void;
  setPreset: (preset: LayoutPreset) => void;
  setDiagramSize: (diagramSize: DiagramSize) => void;
  setDiagramScope: (diagramScope: DiagramScope) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  setScale: (scale: number) => void;
  setPageSize: (pageSize: PageSize) => void;
  setCapoOverride: (capo: number | null) => void;
  setCustomOverride: (chordName: string, fretDef: string) => void;
  removeCustomOverride: (chordName: string) => void;
  setGridSize: (gridSize: number) => void;
  setShowGrid: (showGrid: boolean) => void;
  setChordGridOffset: (key: string, offsetCols: number) => void;
  resetChordGridOffsets: () => void;

  /** Saves or updates the current song in `savedSongs` and returns its ID. */
  saveCurrentSong: (meta: {
    title: string;
    artist: string;
    lastPlayedKey: string;
    shapeKey?: string;
    capo: number;
  }) => string;
  /** Creates a brand-new song entry populated with a skeleton chord-sheet template and activates it. */
  createNewSong: () => string;
  loadSavedSong: (id: string) => void;
  deleteSavedSong: (id: string) => void;
  setSavedSongs: (songs: SavedSong[]) => void;
  setSongPublicState: (
    id: string,
    meta: {
      isPublic: boolean;
      authorUid?: string;
      authorName?: string;
      publishedAt?: string;
    },
  ) => void;
  addForkedSong: (song: SavedSong) => void;
  /** UID of the Firebase account whose cloud library is currently mirrored locally. */
  lastSyncedUid: string | null;
  setLastSyncedUid: (uid: string | null) => void;
  /** Clears all user-specific songs & editor state (used on sign-out / account switch). */
  resetForSignedOutSession: () => void;
}

const initialTemplate = SONG_TEMPLATES[0];

export const useChordFlowStore = create<ChordFlowState>()(
  persist(
    (set, get) => ({
      rawInput: initialTemplate.rawInput,
      activeTemplateId: initialTemplate.id,
      activeSavedSongId: 'seed-amazing-grace',
      preset: initialTemplate.defaultPreset,
      diagramSize: 'compact',
      diagramScope: 'all',
      displayMode: 'shapes',
      scale: 1.0,
      pageSize: 'A4',
      capoOverride: null,
      customOverrides: {},
      gridSize: 24,
      showGrid: true,
      chordGridOffsets: {},
      savedSongs: getStarterSongs(),
      lastSyncedUid: null,

      setRawInput: (rawInput) =>
        set({ rawInput, activeTemplateId: 'custom', activeSavedSongId: null }),
      applyImportedSong: ({ formattedText, capo = null, customOverrides = {}, activeSavedSongId = null }) =>
        set({
          rawInput: formattedText,
          activeTemplateId: 'imported',
          activeSavedSongId,
          capoOverride: capo,
          customOverrides,
          chordGridOffsets: {},
        }),
      loadTemplate: (templateId) => {
        const tpl = SONG_TEMPLATES.find((t) => t.id === templateId);
        if (!tpl) return;
        set({
          rawInput: tpl.rawInput,
          activeTemplateId: tpl.id,
          activeSavedSongId: null,
          preset: tpl.defaultPreset,
          capoOverride: null,
          chordGridOffsets: {},
        });
      },
      setPreset: (preset) => set({ preset }),
      setDiagramSize: (diagramSize) => set({ diagramSize }),
      setDiagramScope: (diagramScope) => set({ diagramScope }),
      setDisplayMode: (displayMode) => set({ displayMode }),
      setScale: (scale) => set({ scale }),
      setPageSize: (pageSize) => set({ pageSize }),
      setCapoOverride: (capoOverride) => set({ capoOverride }),
      setCustomOverride: (chordName, fretDef) =>
        set((state) => ({
          customOverrides: { ...state.customOverrides, [chordName.trim()]: fretDef.trim() },
        })),
      removeCustomOverride: (chordName) =>
        set((state) => {
          const next = { ...state.customOverrides };
          delete next[chordName];
          return { customOverrides: next };
        }),
      setGridSize: (gridSize) => set({ gridSize }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setChordGridOffset: (key, offsetCols) =>
        set((state) => {
          const next = { ...state.chordGridOffsets };
          if (offsetCols === 0) {
            delete next[key];
          } else {
            next[key] = offsetCols;
          }
          return { chordGridOffsets: next };
        }),
      resetChordGridOffsets: () => set({ chordGridOffsets: {} }),

      saveCurrentSong: ({ title, artist, lastPlayedKey, shapeKey, capo }) => {
        const state = get();
        const normTitle = (title || 'Untitled Song').trim();
        const normArtist = (artist || 'Unknown Artist').trim();

        // Match by activeSavedSongId or by same title + artist
        const existing =
          state.savedSongs.find((s) => s.id === state.activeSavedSongId) ??
          state.savedSongs.find(
            (s) =>
              s.title.toLowerCase() === normTitle.toLowerCase() &&
              s.artist.toLowerCase() === normArtist.toLowerCase(),
          );

        const id = existing?.id ?? `song-${Date.now()}`;
        const entry: SavedSong = {
          id,
          title: normTitle,
          artist: normArtist,
          lastPlayedKey: lastPlayedKey || shapeKey || 'C',
          shapeKey,
          capo,
          rawInput: state.rawInput,
          preset: state.preset,
          diagramSize: state.diagramSize,
          diagramScope: state.diagramScope,
          displayMode: state.displayMode,
          scale: state.scale,
          pageSize: state.pageSize,
          customOverrides: { ...state.customOverrides },
          gridSize: state.gridSize,
          showGrid: state.showGrid,
          chordGridOffsets: { ...state.chordGridOffsets },
          isPublic: existing?.isPublic,
          authorUid: existing?.authorUid,
          authorName: existing?.authorName,
          publishedAt: existing?.publishedAt,
          updatedAt: new Date().toISOString(),
        };

        const rest = state.savedSongs.filter((s) => s.id !== id);
        set({
          savedSongs: [entry, ...rest],
          activeSavedSongId: id,
        });
        if (auth?.currentUser?.uid) {
          void upsertUserSong(auth.currentUser.uid, entry).catch(() => {});
        }
        return id;
      },

      createNewSong: () => {
        const state = get();
        const existingUntitledCount = state.savedSongs.filter((s) =>
          /^untitled song(\s+\d+)?$/i.test(s.title.trim()),
        ).length;
        const title =
          existingUntitledCount === 0
            ? 'Untitled Song'
            : `Untitled Song ${existingUntitledCount + 1}`;
        const rawInput = SKELETON_SONG_TEMPLATE.replace(
          /^Title:\s*Untitled Song/m,
          `Title: ${title}`,
        );
        const id = `song-${Date.now()}`;
        const newEntry: SavedSong = {
          id,
          title,
          artist: 'Artist Name',
          lastPlayedKey: 'G',
          shapeKey: 'G',
          capo: 0,
          rawInput,
          preset: 'first_occurrence_only',
          diagramSize: state.diagramSize,
          diagramScope: 'all',
          displayMode: 'shapes',
          scale: 1.0,
          pageSize: state.pageSize,
          customOverrides: {},
          gridSize: state.gridSize,
          showGrid: state.showGrid,
          chordGridOffsets: {},
          updatedAt: new Date().toISOString(),
        };

        set({
          rawInput,
          activeTemplateId: 'skeleton',
          activeSavedSongId: id,
          preset: 'first_occurrence_only',
          diagramScope: 'all',
          displayMode: 'shapes',
          scale: 1.0,
          capoOverride: null,
          customOverrides: {},
          chordGridOffsets: {},
          savedSongs: [newEntry, ...state.savedSongs],
        });
        if (auth?.currentUser?.uid) {
          void upsertUserSong(auth.currentUser.uid, newEntry).catch(() => {});
        }
        return id;
      },

      loadSavedSong: (id) => {
        const song = get().savedSongs.find((s) => s.id === id);
        if (!song) return;
        set({
          rawInput: song.rawInput,
          activeSavedSongId: song.id,
          activeTemplateId: 'saved',
          preset: song.preset,
          diagramSize: song.diagramSize,
          diagramScope: 'all',
          displayMode: song.displayMode,
          scale: song.scale,
          pageSize: song.pageSize,
          capoOverride: song.capo,
          customOverrides: { ...song.customOverrides },
          gridSize: song.gridSize ?? get().gridSize,
          showGrid: song.showGrid ?? get().showGrid,
          chordGridOffsets: { ...(song.chordGridOffsets ?? {}) },
        });
      },

      deleteSavedSong: (id) => {
        const target = get().savedSongs.find((s) => s.id === id);
        set((state) => ({
          savedSongs: state.savedSongs.filter((s) => s.id !== id),
          activeSavedSongId: state.activeSavedSongId === id ? null : state.activeSavedSongId,
        }));
        if (auth?.currentUser?.uid) {
          void deleteUserSong(auth.currentUser.uid, id).catch(() => {});
          if (target?.isPublic) {
            void deletePublicSongDoc(id).catch(() => {});
          }
        }
      },

      setSavedSongs: (savedSongs) => set({ savedSongs }),
      setSongPublicState: (id, meta) =>
        set((state) => ({
          savedSongs: state.savedSongs.map((s) =>
            s.id === id
              ? {
                  ...s,
                  isPublic: meta.isPublic,
                  authorUid: meta.authorUid,
                  authorName: meta.authorName,
                  publishedAt: meta.publishedAt,
                  updatedAt: new Date().toISOString(),
                }
              : s,
          ),
        })),
      addForkedSong: (song) =>
        set((state) => ({
          rawInput: song.rawInput,
          activeSavedSongId: song.id,
          activeTemplateId: 'saved',
          preset: song.preset,
          diagramSize: song.diagramSize,
          diagramScope: 'all',
          displayMode: song.displayMode,
          scale: song.scale,
          pageSize: song.pageSize,
          capoOverride: song.capo,
          customOverrides: { ...song.customOverrides },
          gridSize: song.gridSize ?? state.gridSize,
          showGrid: song.showGrid ?? state.showGrid,
          chordGridOffsets: { ...(song.chordGridOffsets ?? {}) },
          savedSongs: [song, ...state.savedSongs.filter((s) => s.id !== song.id)],
        })),
      setLastSyncedUid: (lastSyncedUid) => set({ lastSyncedUid }),
      resetForSignedOutSession: () =>
        set({
          rawInput: initialTemplate.rawInput,
          activeTemplateId: initialTemplate.id,
          activeSavedSongId: 'seed-amazing-grace',
          preset: initialTemplate.defaultPreset,
          capoOverride: null,
          customOverrides: {},
          chordGridOffsets: {},
          savedSongs: getStarterSongs(),
          lastSyncedUid: null,
        }),
    }),
    {
      name: 'chordflow-workspace-v1',
    },
  ),
);

/** Merges parsed customVoicings with user overrides from Zustand store. */
export function mergeUserOverrides(
  baseVoicings: Map<string, ChordVoicing>,
  overrides: Record<string, string>,
): Map<string, ChordVoicing> {
  const merged = new Map(baseVoicings);
  for (const [name, fretDef] of Object.entries(overrides)) {
    const frets = parseFretString(fretDef);
    if (!frets) continue;
    const v = buildVoicing(name, frets, true);
    if (v) merged.set(name, v);
  }
  return merged;
}
