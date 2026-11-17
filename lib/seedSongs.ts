import type { SavedSong } from './store';
import { SONG_TEMPLATES } from './templates';

/** IDs of the two starter template songs provisioned for every account. */
export const STARTER_SONG_IDS = ['seed-amazing-grace', 'seed-build-my-life'] as const;

/** Original `updatedAt` stamps for the starter songs (used to detect unmodified copies). */
const STARTER_UPDATED_AT: Record<string, string> = {
  'seed-amazing-grace': '2026-11-08T16:00:00.000Z',
  'seed-build-my-life': '2026-11-08T16:05:00.000Z',
};

export const DEFAULT_SAVED_SONGS: SavedSong[] = [
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
    updatedAt: STARTER_UPDATED_AT['seed-amazing-grace'],
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
    updatedAt: STARTER_UPDATED_AT['seed-build-my-life'],
  },
];

/** Returns fresh (deep-cloned) copies of the two starter template songs. */
export function getStarterSongs(): SavedSong[] {
  return DEFAULT_SAVED_SONGS.map((s) => ({ ...s, customOverrides: { ...s.customOverrides } }));
}

export function isStarterSongId(id: string): boolean {
  return (STARTER_SONG_IDS as readonly string[]).includes(id);
}

/** True when a song is a starter template that the user has never edited/saved. */
export function isUnmodifiedStarterSong(song: SavedSong): boolean {
  return isStarterSongId(song.id) && song.updatedAt === STARTER_UPDATED_AT[song.id];
}
