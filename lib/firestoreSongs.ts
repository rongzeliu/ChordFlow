import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import type {
  DiagramScope,
  DiagramSize,
  DisplayMode,
  LayoutPreset,
  PageSize,
} from '@/types/chord';
import { db } from './firebase';
import { getStarterSongs, isUnmodifiedStarterSong } from './seedSongs';
import type { SavedSong } from './store';

/**
 * Produces a clean Firestore-compatible object from a `SavedSong` (stripping `undefined` optional fields
 * which Firestore rejects unless `ignoreUndefinedProperties` is enabled).
 */
export function serializeSongForFirestore(song: SavedSong): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: song.id,
    title: (song.title || 'Untitled Song').slice(0, 300),
    artist: (song.artist ?? '').slice(0, 300),
    lastPlayedKey: (song.lastPlayedKey || 'G').slice(0, 32),
    capo: Math.max(0, Math.min(11, Math.round(song.capo ?? 0))),
    rawInput: song.rawInput ?? '',
    preset: song.preset ?? 'first_occurrence_only',
    diagramSize: song.diagramSize ?? 'compact',
    diagramScope: song.diagramScope ?? 'all',
    displayMode: song.displayMode ?? 'shapes',
    scale: typeof song.scale === 'number' ? song.scale : 1,
    pageSize: song.pageSize ?? 'A4',
    customOverrides: song.customOverrides ?? {},
    updatedAt: song.updatedAt || new Date().toISOString(),
  };

  if (song.shapeKey !== undefined) {
    payload.shapeKey = song.shapeKey.slice(0, 32);
  }
  if (typeof song.gridSize === 'number') {
    payload.gridSize = song.gridSize;
  }
  if (typeof song.showGrid === 'boolean') {
    payload.showGrid = song.showGrid;
  }
  if (song.chordGridOffsets !== undefined) {
    payload.chordGridOffsets = song.chordGridOffsets;
  }

  return payload;
}

/** Validates and converts a raw Firestore document snapshot data map into a `SavedSong`. */
export function deserializeFirestoreSong(
  docId: string,
  data: Record<string, unknown> | undefined,
): SavedSong | null {
  if (!data || typeof data.title !== 'string' || typeof data.rawInput !== 'string') {
    return null;
  }

  const customOverrides: Record<string, string> = {};
  if (data.customOverrides && typeof data.customOverrides === 'object') {
    for (const [k, v] of Object.entries(data.customOverrides as Record<string, unknown>)) {
      if (typeof v === 'string') customOverrides[k] = v;
    }
  }

  const chordGridOffsets: Record<string, number> = {};
  if (data.chordGridOffsets && typeof data.chordGridOffsets === 'object') {
    for (const [k, v] of Object.entries(data.chordGridOffsets as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) chordGridOffsets[k] = v;
    }
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    title: data.title,
    artist: typeof data.artist === 'string' ? data.artist : '',
    lastPlayedKey: typeof data.lastPlayedKey === 'string' ? data.lastPlayedKey : 'G',
    shapeKey: typeof data.shapeKey === 'string' ? data.shapeKey : undefined,
    capo: typeof data.capo === 'number' ? data.capo : 0,
    rawInput: data.rawInput,
    preset: (data.preset as LayoutPreset) || 'first_occurrence_only',
    diagramSize: (data.diagramSize as DiagramSize) || 'compact',
    diagramScope: (data.diagramScope as DiagramScope) || 'all',
    displayMode: (data.displayMode as DisplayMode) || 'shapes',
    scale: typeof data.scale === 'number' ? data.scale : 1,
    pageSize: (data.pageSize as PageSize) || 'A4',
    customOverrides,
    gridSize: typeof data.gridSize === 'number' ? data.gridSize : undefined,
    showGrid: typeof data.showGrid === 'boolean' ? data.showGrid : undefined,
    chordGridOffsets: Object.keys(chordGridOffsets).length > 0 ? chordGridOffsets : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Merges local and cloud song lists by `id`, keeping whichever version has the newer `updatedAt`
 * ISO timestamp, sorted most-recently-updated first.
 */
export function mergeSongsByRecency(
  localSongs: SavedSong[],
  cloudSongs: SavedSong[],
): SavedSong[] {
  const byId = new Map<string, SavedSong>();
  for (const s of localSongs) {
    byId.set(s.id, s);
  }
  for (const c of cloudSongs) {
    const existing = byId.get(c.id);
    if (!existing) {
      byId.set(c.id, c);
    } else {
      const localTime = Date.parse(existing.updatedAt || '') || 0;
      const cloudTime = Date.parse(c.updatedAt || '') || 0;
      if (cloudTime >= localTime) {
        byId.set(c.id, c);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const tA = Date.parse(a.updatedAt || '') || 0;
    const tB = Date.parse(b.updatedAt || '') || 0;
    return tB - tA;
  });
}

/** Subscribes in real time to `users/{uid}/songs` ordered by `updatedAt` descending. */
export function subscribeToUserSongs(
  uid: string,
  onUpdate: (songs: SavedSong[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!db) return () => {};
  const songsRef = collection(db, 'users', uid, 'songs');
  const q = query(songsRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const songs: SavedSong[] = [];
      snapshot.forEach((docSnap) => {
        const parsed = deserializeFirestoreSong(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        );
        if (parsed) songs.push(parsed);
      });
      onUpdate(songs);
    },
    (err) => {
      onError?.(err);
    },
  );
}

/** Creates or updates `users/{uid}/songs/{song.id}` in Cloud Firestore. */
export async function upsertUserSong(uid: string, song: SavedSong): Promise<void> {
  if (!db) return;
  const songRef = doc(db, 'users', uid, 'songs', song.id);
  await setDoc(songRef, serializeSongForFirestore(song));
}

/** Deletes `users/{uid}/songs/{songId}` from Cloud Firestore. */
export async function deleteUserSong(uid: string, songId: string): Promise<void> {
  if (!db) return;
  const songRef = doc(db, 'users', uid, 'songs', songId);
  await deleteDoc(songRef);
}

export interface SignInLibraryPlan {
  /** Song library that should be mirrored locally for the signed-in user. */
  library: SavedSong[];
  /** Songs that must be written to `users/{uid}/songs` to complete the merge. */
  toUpload: SavedSong[];
}

function sortByRecency(songs: SavedSong[]): SavedSong[] {
  return [...songs].sort((a, b) => {
    const tA = Date.parse(a.updatedAt || '') || 0;
    const tB = Date.parse(b.updatedAt || '') || 0;
    return tB - tA;
  });
}

/**
 * Pure planner for the sign-in merge:
 *  - Account switch (`previousUid` set and different from `uid`): local songs belong to another
 *    account and are never uploaded or shown.
 *  - Same account / first sign-in on this browser: user-edited local songs missing in the cloud
 *    (or newer locally) are uploaded. Unmodified starter templates are never force-uploaded.
 *  - Empty cloud library: the two starter template songs are provisioned for the new account.
 */
export function planSignInLibrary(params: {
  uid: string;
  previousUid: string | null;
  localSongs: SavedSong[];
  cloudSongs: SavedSong[];
}): SignInLibraryPlan {
  const { uid, previousUid, localSongs, cloudSongs } = params;
  const isAccountSwitch = previousUid !== null && previousUid !== uid;

  const byId = new Map<string, SavedSong>();
  for (const c of cloudSongs) byId.set(c.id, c);
  const toUpload: SavedSong[] = [];

  if (!isAccountSwitch) {
    for (const local of localSongs) {
      if (isUnmodifiedStarterSong(local)) continue;
      const cloud = byId.get(local.id);
      const localTime = Date.parse(local.updatedAt || '') || 0;
      const cloudTime = cloud ? Date.parse(cloud.updatedAt || '') || 0 : -1;
      if (!cloud || localTime > cloudTime) {
        byId.set(local.id, local);
        toUpload.push(local);
      }
    }
  }

  if (cloudSongs.length === 0) {
    for (const starter of getStarterSongs()) {
      if (byId.has(starter.id)) continue;
      byId.set(starter.id, starter);
      toUpload.push(starter);
    }
  }

  return { library: sortByRecency(Array.from(byId.values())), toUpload };
}

/** Fetches `users/{uid}/songs` once (empty array when Firestore is unavailable). */
export async function fetchUserSongs(uid: string): Promise<SavedSong[]> {
  if (!db) return [];
  const snapshot = await getDocs(collection(db, 'users', uid, 'songs'));
  const songs: SavedSong[] = [];
  snapshot.forEach((docSnap) => {
    const parsed = deserializeFirestoreSong(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (parsed) songs.push(parsed);
  });
  return songs;
}

/**
 * On sign-in, reconciles the local library with `users/{uid}/songs` (see `planSignInLibrary`),
 * uploads the required songs (including starter templates for brand-new accounts) and returns
 * the library to mirror locally.
 */
export async function mergeLocalSongsOnSignIn(
  uid: string,
  localSongs: SavedSong[],
  previousUid: string | null = null,
): Promise<SavedSong[]> {
  if (!db) return localSongs;
  const cloudSongs = await fetchUserSongs(uid);
  const plan = planSignInLibrary({ uid, previousUid, localSongs, cloudSongs });
  if (plan.toUpload.length > 0) {
    await Promise.allSettled(plan.toUpload.map((song) => upsertUserSong(uid, song)));
  }
  return plan.library;
}
