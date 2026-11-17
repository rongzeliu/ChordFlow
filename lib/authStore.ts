'use client';

import { useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { create } from 'zustand';
import { auth, isFirebaseConfigured } from './firebase';
import { mergeLocalSongsOnSignIn, subscribeToUserSongs } from './firestoreSongs';
import { useChordFlowStore } from './store';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthState {
  user: User | null;
  authLoading: boolean;
  syncStatus: CloudSyncStatus;
  authDialogOpen: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setSyncStatus: (status: CloudSyncStatus) => void;
  setAuthDialogOpen: (open: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authLoading: isFirebaseConfigured(),
  syncStatus: 'idle',
  authDialogOpen: false,
  setUser: (user) => set({ user }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setAuthDialogOpen: (authDialogOpen) => set({ authDialogOpen }),
}));

/** Maps Firebase Auth error codes into clear, user-friendly messages. */
export function formatFirebaseAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please double-check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in popup was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not yet authorized in Firebase Console (Authentication → Settings → Authorized domains).';
    default:
      if (err instanceof Error && err.message) {
        return err.message;
      }
      return 'Authentication failed. Please try again.';
  }
}

let activeAuthListenerCount = 0;
let unsubscribeAuthGlobal: (() => void) | null = null;
let unsubscribeSongsGlobal: (() => void) | null = null;

/**
 * Connects Firebase Authentication state and real-time Cloud Firestore `users/{uid}/songs`
 * synchronization to `useChordFlowStore`. Safe to call from multiple header mounts.
 */
export function useFirebaseAuthSync(): void {
  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) {
      useAuthStore.getState().setAuthLoading(false);
      return;
    }

    activeAuthListenerCount += 1;
    if (activeAuthListenerCount === 1) {
      unsubscribeAuthGlobal = onAuthStateChanged(auth, async (firebaseUser) => {
        const authStore = useAuthStore.getState();
        authStore.setUser(firebaseUser);
        authStore.setAuthLoading(false);

        if (unsubscribeSongsGlobal) {
          unsubscribeSongsGlobal();
          unsubscribeSongsGlobal = null;
        }

        if (!firebaseUser) {
          authStore.setSyncStatus('idle');
          // Clear any previous account's songs & editor state from this browser.
          useChordFlowStore.getState().resetForSignedOutSession();
          return;
        }

        const uid = firebaseUser.uid;
        const isStale = () => auth?.currentUser?.uid !== uid;

        authStore.setSyncStatus('syncing');
        try {
          const chordStore = useChordFlowStore.getState();
          const previousUid = chordStore.lastSyncedUid;
          if (previousUid && previousUid !== uid) {
            // Account switch on the same browser: never leak the previous user's library.
            chordStore.resetForSignedOutSession();
          }
          const library = await mergeLocalSongsOnSignIn(
            uid,
            useChordFlowStore.getState().savedSongs,
            previousUid,
          );
          if (isStale()) return;
          useChordFlowStore.getState().setSavedSongs(library);
          useChordFlowStore.getState().setLastSyncedUid(uid);
          authStore.setSyncStatus('synced');
        } catch {
          if (isStale()) return;
          authStore.setSyncStatus('error');
        }

        if (isStale()) return;
        unsubscribeSongsGlobal = subscribeToUserSongs(
          uid,
          (cloudSongs) => {
            if (isStale()) return;
            // Cloud Firestore is the source of truth once the initial merge has completed
            // (pending local writes are included via latency compensation).
            useChordFlowStore.getState().setSavedSongs(cloudSongs);
            useAuthStore.getState().setSyncStatus('synced');
          },
          () => {
            useAuthStore.getState().setSyncStatus('error');
          },
        );
      });
    }

    return () => {
      activeAuthListenerCount = Math.max(0, activeAuthListenerCount - 1);
      if (activeAuthListenerCount === 0) {
        if (unsubscribeSongsGlobal) {
          unsubscribeSongsGlobal();
          unsubscribeSongsGlobal = null;
        }
        if (unsubscribeAuthGlobal) {
          unsubscribeAuthGlobal();
          unsubscribeAuthGlobal = null;
        }
      }
    };
  }, []);
}
