import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
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
  if (typeof song.isPublic === 'boolean') {
    payload.isPublic = song.isPublic;
  }
  if (typeof song.authorUid === 'string' && song.authorUid) {
    payload.authorUid = song.authorUid.slice(0, 128);
  }
  if (typeof song.authorName === 'string' && song.authorName) {
    payload.authorName = song.authorName.slice(0, 120);
  }
  if (typeof song.publishedAt === 'string' && song.publishedAt) {
    payload.publishedAt = song.publishedAt.slice(0, 64);
  }

  return payload;
}

/**
 * Produces a validated Firestore document payload for `publicSongs/{song.id}`.
 */
export function serializePublicSongForFirestore(
  uid: string,
  authorName: string,
  song: SavedSong,
  publishedAt?: string,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const pubAt = (publishedAt || song.publishedAt || nowIso).slice(0, 64);
  const cleanAuthorName = (authorName || song.authorName || 'ChordFlow Musician')
    .trim()
    .slice(0, 120);

  return {
    ...serializeSongForFirestore({
      ...song,
      isPublic: true,
      authorUid: uid,
      authorName: cleanAuthorName,
      publishedAt: pubAt,
      updatedAt: song.updatedAt || nowIso,
    }),
    isPublic: true,
    authorUid: uid.slice(0, 128),
    authorName: cleanAuthorName,
    publishedAt: pubAt,
  };
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
    isPublic: typeof data.isPublic === 'boolean' ? data.isPublic : undefined,
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : undefined,
    authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Clones a public song into a fresh private `SavedSong` copy with a new `id`,
 * `isPublic: false`, and cleared public authorship metadata.
 */
export function createForkedSongCopy(
  sourceSong: SavedSong,
  newId?: string,
  nowIso?: string,
): SavedSong {
  const generatedId =
    newId ?? `song-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = nowIso ?? new Date().toISOString();

  return {
    ...sourceSong,
    id: generatedId,
    customOverrides: { ...(sourceSong.customOverrides ?? {}) },
    chordGridOffsets: sourceSong.chordGridOffsets
      ? { ...sourceSong.chordGridOffsets }
      : undefined,
    isPublic: false,
    authorUid: undefined,
    authorName: undefined,
    publishedAt: undefined,
    updatedAt: timestamp,
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

/** Deletes `publicSongs/{songId}` from Cloud Firestore. */
export async function deletePublicSongDoc(songId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'publicSongs', songId));
}

/**
 * Publishes `song` to the top-level `publicSongs/{song.id}` collection and marks the user's
 * private copy in `users/{uid}/songs/{song.id}` with `isPublic: true`.
 */
export async function publishSongToPublic(
  uid: string,
  authorName: string,
  song: SavedSong,
): Promise<SavedSong> {
  const nowIso = new Date().toISOString();
  const cleanAuthor = (authorName || 'ChordFlow Musician').trim().slice(0, 120);
  const publishedSong: SavedSong = {
    ...song,
    isPublic: true,
    authorUid: uid,
    authorName: cleanAuthor,
    publishedAt: song.publishedAt || nowIso,
    updatedAt: nowIso,
  };

  if (db) {
    const publicRef = doc(db, 'publicSongs', song.id);
    const userSongRef = doc(db, 'users', uid, 'songs', song.id);
    await Promise.all([
      setDoc(
        publicRef,
        serializePublicSongForFirestore(uid, cleanAuthor, publishedSong, publishedSong.publishedAt),
      ),
      setDoc(userSongRef, serializeSongForFirestore(publishedSong)),
    ]);
  }

  return publishedSong;
}

/**
 * Removes `publicSongs/{song.id}` and marks the user's private copy in `users/{uid}/songs/{song.id}`
 * with `isPublic: false`.
 */
export async function unpublishPublicSong(uid: string, song: SavedSong): Promise<SavedSong> {
  const nowIso = new Date().toISOString();
  const updatedSong: SavedSong = {
    ...song,
    isPublic: false,
    updatedAt: nowIso,
  };

  if (db) {
    const publicRef = doc(db, 'publicSongs', song.id);
    const userSongRef = doc(db, 'users', uid, 'songs', song.id);
    await Promise.all([
      deleteDoc(publicRef),
      setDoc(userSongRef, serializeSongForFirestore(updatedSong)),
    ]);
  }

  return updatedSong;
}

/**
 * Subscribes in real time to the top-level `publicSongs` collection ordered by `updatedAt` descending.
 */
export function subscribeToPublicSongs(
  onUpdate: (songs: SavedSong[]) => void,
  onError?: (err: Error) => void,
  maxCount = 50,
): () => void {
  if (!db) {
    onUpdate([]);
    return () => {};
  }
  const publicRef = collection(db, 'publicSongs');
  const q = query(publicRef, orderBy('updatedAt', 'desc'), limit(maxCount));
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

/**
 * Clones a public song into the user's private library (`users/{uid}/songs/{newId}`)
 * and returns the forked private copy.
 */
export async function forkPublicSongToLibrary(
  uid: string | null | undefined,
  publicSong: SavedSong,
): Promise<SavedSong> {
  const forked = createForkedSongCopy(publicSong);
  if (uid && db) {
    await upsertUserSong(uid, forked);
  }
  return forked;
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
