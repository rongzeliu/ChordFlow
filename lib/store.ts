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
}

const initialTemplate = SONG_TEMPLATES[0];

const DEFAULT_SAVED_SONGS: SavedSong[] = [
  {
    id: 'seed-amazing-grace',
    title: 'Amazing Grace (My Chains Are Gone)',
    artist: 'Chris Tomlin / Traditional',
    lastPlayedKey: 'Bb',
    shapeKey: 'G',
    capo: 3,
    rawInput: SONG_TEMPLATES[0].rawInput,
    preset: SONG_TEMPLATES[0].defaultPreset,
    diagramSize: 'compact',
    diagramScope: 'all',
    displayMode: 'shapes',
    scale: 1,
    pageSize: 'A4',
    customOverrides: {},
    updatedAt: '2026-11-08T16:00:00.000Z',
  },
  {
    id: 'seed-build-my-life',
    title: 'Build My Life (Open E Shapes)',
    artist: 'Housefires / Pat Barrett',
    lastPlayedKey: 'F#',
    shapeKey: 'E',
    capo: 2,
    rawInput: SONG_TEMPLATES[1].rawInput,
    preset: SONG_TEMPLATES[1].defaultPreset,
    diagramSize: 'compact',
    diagramScope: 'all',
    displayMode: 'shapes',
    scale: 1,
    pageSize: 'A4',
    customOverrides: {},
    updatedAt: '2026-11-08T16:05:00.000Z',
  },
];

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
      savedSongs: DEFAULT_SAVED_SONGS,

      setRawInput: (rawInput) =>
        set({ rawInput, activeTemplateId: 'custom', activeSavedSongId: null }),
      applyImportedSong: ({ formattedText, capo = null, customOverrides = {}, activeSavedSongId = null }) =>
        set({
          rawInput: formattedText,
          activeTemplateId: 'imported',
          activeSavedSongId,
          capoOverride: capo,
          customOverrides,
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
          updatedAt: new Date().toISOString(),
        };

        const rest = state.savedSongs.filter((s) => s.id !== id);
        set({
          savedSongs: [entry, ...rest],
          activeSavedSongId: id,
        });
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
          savedSongs: [newEntry, ...state.savedSongs],
        });
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
        });
      },

      deleteSavedSong: (id) =>
        set((state) => ({
          savedSongs: state.savedSongs.filter((s) => s.id !== id),
          activeSavedSongId: state.activeSavedSongId === id ? null : state.activeSavedSongId,
        })),
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
