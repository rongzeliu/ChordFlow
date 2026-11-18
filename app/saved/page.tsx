'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  FilePlus2,
  Globe,
  Guitar,
  Library,
  Loader2,
  Music,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AuthAccountButton } from '@/components/AuthAccountButton';
import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/lib/authStore';
import {
  deletePublicSongDoc,
  forkPublicSongToLibrary,
  publishSongToPublic,
  subscribeToPublicSongs,
  unpublishPublicSong,
} from '@/lib/firestoreSongs';
import { prettyAccidentals } from '@/lib/music';
import { useChordFlowStore, type SavedSong } from '@/lib/store';

type LibraryTab = 'my-songs' | 'public';

export default function SavedSongsPage() {
  const router = useRouter();
  const {
    savedSongs,
    activeSavedSongId,
    loadSavedSong,
    deleteSavedSong,
    createNewSong,
    setSongPublicState,
    addForkedSong,
  } = useChordFlowStore();
  const { user, setAuthDialogOpen } = useAuthStore();

  const [activeTab, setActiveTab] = useState<LibraryTab>('my-songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [publicSongs, setPublicSongs] = useState<SavedSong[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [busySongId, setBusySongId] = useState<string | null>(null);

  const [toastState, setToastState] = useState<{
    visible: boolean;
    message: string;
    kind: 'saved' | 'reset';
  }>({ visible: false, message: 'Saved', kind: 'saved' });
  const toastTimerRef = useRef<number | null>(null);

  const triggerToast = (message: string, kind: 'saved' | 'reset' = 'saved') => {
    setToastState({ visible: true, message, kind });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastState((prev) => ({ ...prev, visible: false }));
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setPublicLoading(true);
    const unsub = subscribeToPublicSongs(
      (songs) => {
        setPublicSongs(songs);
        setPublicLoading(false);
      },
      () => {
        setPublicLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filteredMySongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return savedSongs;
    return savedSongs.filter((song) => {
      const prettyKey = prettyAccidentals(song.lastPlayedKey).toLowerCase();
      return (
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        song.lastPlayedKey.toLowerCase().includes(q) ||
        prettyKey.includes(q) ||
        (song.shapeKey && song.shapeKey.toLowerCase().includes(q))
      );
    });
  }, [savedSongs, searchQuery]);

  const filteredPublicSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return publicSongs;
    return publicSongs.filter((song) => {
      const prettyKey = prettyAccidentals(song.lastPlayedKey).toLowerCase();
      return (
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        (song.authorName && song.authorName.toLowerCase().includes(q)) ||
        song.lastPlayedKey.toLowerCase().includes(q) ||
        prettyKey.includes(q) ||
        (song.shapeKey && song.shapeKey.toLowerCase().includes(q))
      );
    });
  }, [publicSongs, searchQuery]);

  const handleOpenSong = (id: string) => {
    loadSavedSong(id);
    router.push('/');
  };

  const handleCreateNewSong = () => {
    createNewSong();
    router.push('/');
  };

  const handleToggleSongPublic = async (song: SavedSong) => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    try {
      setBusySongId(song.id);
      const authorName =
        user.displayName?.trim() || user.email?.split('@')[0] || 'ChordFlow Musician';
      if (song.isPublic) {
        await unpublishPublicSong(user.uid, song);
        setSongPublicState(song.id, {
          isPublic: false,
          authorUid: song.authorUid,
          authorName: song.authorName,
          publishedAt: song.publishedAt,
        });
        triggerToast('Removed from public library', 'reset');
      } else {
        const published = await publishSongToPublic(user.uid, authorName, song);
        setSongPublicState(song.id, {
          isPublic: true,
          authorUid: published.authorUid,
          authorName: published.authorName,
          publishedAt: published.publishedAt,
        });
        triggerToast('Published to public library', 'saved');
      }
    } finally {
      setBusySongId(null);
    }
  };

  const handleUnpublishFromPublicTab = async (song: SavedSong) => {
    if (!user || song.authorUid !== user.uid) return;
    try {
      setBusySongId(song.id);
      const localMatch = savedSongs.find((s) => s.id === song.id);
      if (localMatch) {
        await unpublishPublicSong(user.uid, localMatch);
        setSongPublicState(song.id, {
          isPublic: false,
          authorUid: localMatch.authorUid,
          authorName: localMatch.authorName,
          publishedAt: localMatch.publishedAt,
        });
      } else {
        await deletePublicSongDoc(song.id);
      }
      triggerToast('Removed from public library', 'reset');
    } finally {
      setBusySongId(null);
    }
  };

  const handleForkPublicSong = async (publicSong: SavedSong) => {
    try {
      setBusySongId(publicSong.id);
      const forked = await forkPublicSongToLibrary(user?.uid, publicSong);
      addForkedSong(forked);
      router.push('/');
    } finally {
      setBusySongId(null);
    }
  };

  const activeList = activeTab === 'my-songs' ? savedSongs : publicSongs;
  const filteredList = activeTab === 'my-songs' ? filteredMySongs : filteredPublicSongs;

  return (
    <AuthGate>
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-base text-primary">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-warm-border bg-base px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-honey/30 text-primary">
              <Guitar className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-primary">ChordFlow</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCreateNewSong}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-base shadow-[0_1px_2px_rgba(26,56,43,0.16)] transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New song</span>
            </button>

            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-3.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              <span>Back to editor</span>
            </Link>

            <AuthAccountButton onStatusToast={(msg) => triggerToast(msg, 'saved')} />
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-primary">
                {activeTab === 'my-songs' ? 'Saved songs' : 'Public song library'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {activeTab === 'my-songs'
                  ? 'Select a song to open its chord sheet in the workspace, share songs publicly, or start from a template.'
                  : 'Browse chord sheets shared by the ChordFlow community and copy any arrangement into your private library.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span aria-live="polite" className="text-xs font-medium text-muted">
                {searchQuery.trim()
                  ? `${filteredList.length} of ${activeList.length} songs`
                  : `${activeList.length} ${activeList.length === 1 ? 'song' : 'songs'}`}
              </span>
              <button
                type="button"
                onClick={handleCreateNewSong}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-honey px-3.5 text-xs font-semibold text-primary shadow-[0_1px_2px_rgba(26,56,43,0.12)] transition hover:bg-honey-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <FilePlus2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>New song from template</span>
              </button>
            </div>
          </div>

          {/* Library Tabs ("My Saved Songs" vs "Public Library") */}
          <div className="mb-6 flex items-center gap-2 border-b border-warm-border pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('my-songs')}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition ${
                activeTab === 'my-songs'
                  ? 'bg-primary text-base shadow-[0_1px_2px_rgba(26,56,43,0.14)]'
                  : 'bg-surface text-muted hover:bg-sage hover:text-primary'
              }`}
            >
              <Library className="h-3.5 w-3.5" aria-hidden="true" />
              <span>My Saved Songs</span>
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  activeTab === 'my-songs'
                    ? 'bg-base/20 text-base'
                    : 'bg-sage text-primary'
                }`}
              >
                {savedSongs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('public')}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition ${
                activeTab === 'public'
                  ? 'bg-primary text-base shadow-[0_1px_2px_rgba(26,56,43,0.14)]'
                  : 'bg-surface text-muted hover:bg-sage hover:text-primary'
              }`}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Public Library</span>
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  activeTab === 'public'
                    ? 'bg-base/20 text-base'
                    : 'bg-sage text-primary'
                }`}
              >
                {publicSongs.length}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          {activeList.length > 0 && (
            <div className="mb-6">
              <label htmlFor="library-search" className="sr-only">
                Search songs by title, artist, author, or key
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  id="library-search"
                  type="search"
                  name="q"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    activeTab === 'my-songs'
                      ? 'Search by title, artist, or key (e.g. Amazing Grace, Tomlin, Bb)…'
                      : 'Search public songs by title, artist, author, or key…'
                  }
                  className="w-full rounded-xl border border-warm-border bg-surface py-2.5 pr-9 pl-10 text-sm text-primary shadow-[0_1px_2px_rgba(26,56,43,0.04)] placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-honey/45 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-sage hover:text-primary"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'my-songs' ? (
            savedSongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-16 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-primary">
                  <Music className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-primary">No saved songs yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted">
                  Create a new song with a pre-formatted skeleton template, or browse the Public
                  Library to copy a community chord sheet.
                </p>
                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCreateNewSong}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-base transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New song from template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('public')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-4 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage"
                  >
                    <Globe className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span>Browse Public Library</span>
                  </button>
                </div>
              </div>
            ) : filteredMySongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-14 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
                <p className="text-sm font-semibold text-primary">
                  No songs matching &ldquo;{searchQuery.trim()}&rdquo;
                </p>
                <p className="mt-1 text-xs text-muted">
                  Try searching for a different song title, artist name, or musical key.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 inline-flex h-8 items-center rounded-lg border border-primary/25 bg-surface px-3 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-warm-border bg-surface shadow-[0_1px_3px_rgba(26,56,43,0.05),0_8px_24px_rgba(26,56,43,0.03)]">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">Saved songs library</caption>
                  <thead>
                    <tr className="border-b border-warm-border bg-sage/70 text-[11px] font-semibold tracking-wider text-muted uppercase">
                      <th scope="col" className="py-3.5 pr-4 pl-6">
                        Title
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Artist
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Last played key
                      </th>
                      <th scope="col" className="py-3.5 pr-6 pl-4 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-border text-sm">
                    {filteredMySongs.map((song) => {
                      const isCurrent = activeSavedSongId === song.id;
                      const isBusy = busySongId === song.id;
                      return (
                        <tr key={song.id} className="group transition-colors hover:bg-base">
                          <th scope="row" className="py-4 pr-4 pl-6 font-medium text-primary">
                            <button
                              type="button"
                              onClick={() => handleOpenSong(song.id)}
                              className="group/title inline-flex flex-wrap items-center gap-2 text-left font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                            >
                              <span className="decoration-honey decoration-2 underline-offset-4 group-hover/title:underline">
                                {song.title}
                              </span>
                              {isCurrent && (
                                <span className="shrink-0 rounded-full border border-primary/25 bg-sage px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  Current
                                </span>
                              )}
                              {song.isPublic && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-honey-deep/50 bg-honey-tint px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  <Globe className="h-2.5 w-2.5" aria-hidden="true" />
                                  <span>Public</span>
                                </span>
                              )}
                            </button>
                          </th>
                          <td className="px-4 py-4 text-muted">{song.artist || '—'}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                              <span>{prettyAccidentals(song.lastPlayedKey)}</span>
                              {song.capo > 0 && song.shapeKey && (
                                <span className="rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-muted">
                                  Capo {song.capo} · {prettyAccidentals(song.shapeKey)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-4 pr-6 pl-4 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleSongPublic(song)}
                                aria-label={
                                  song.isPublic
                                    ? `Unpublish ${song.title}`
                                    : `Share ${song.title} publicly`
                                }
                                title={
                                  song.isPublic
                                    ? 'Remove from public library'
                                    : 'Share to public library'
                                }
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-50 ${
                                  song.isPublic
                                    ? 'border-honey-deep/50 bg-honey-tint text-primary hover:bg-honey/25'
                                    : 'border-primary/25 bg-surface text-primary hover:border-primary/50 hover:bg-sage'
                                }`}
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Globe className="h-3 w-3" aria-hidden="true" />
                                )}
                                <span>{song.isPublic ? 'Unpublish' : 'Share'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSong(song.id)}
                                aria-label={`Open ${song.title}`}
                                className="rounded-md border border-primary/25 bg-surface px-2.5 py-1 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSavedSong(song.id)}
                                aria-label={`Delete ${song.title}`}
                                className="rounded-md p-1.5 text-muted transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : publicLoading ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-16 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
              <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-xs font-medium text-muted">Loading public song library…</p>
            </div>
          ) : publicSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-16 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-primary">
                <Globe className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-primary">No public songs published yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Be the first to share a chord sheet with the community—click &ldquo;Share&rdquo; on
                any of your saved songs or &ldquo;Share publicly&rdquo; in the editor header.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('my-songs')}
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-base transition hover:bg-primary-hover"
              >
                <span>View My Saved Songs</span>
              </button>
            </div>
          ) : filteredPublicSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-14 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
              <p className="text-sm font-semibold text-primary">
                No public songs matching &ldquo;{searchQuery.trim()}&rdquo;
              </p>
              <p className="mt-1 text-xs text-muted">
                Try searching for a different title, artist, author, or key.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 inline-flex h-8 items-center rounded-lg border border-primary/25 bg-surface px-3 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-warm-border bg-surface shadow-[0_1px_3px_rgba(26,56,43,0.05),0_8px_24px_rgba(26,56,43,0.03)]">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Public community songs library</caption>
                <thead>
                  <tr className="border-b border-warm-border bg-sage/70 text-[11px] font-semibold tracking-wider text-muted uppercase">
                    <th scope="col" className="py-3.5 pr-4 pl-6">
                      Title
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Artist
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Shared by
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Key
                    </th>
                    <th scope="col" className="py-3.5 pr-6 pl-4 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-border text-sm">
                  {filteredPublicSongs.map((song) => {
                    const isOwner = Boolean(user?.uid && song.authorUid === user.uid);
                    const isBusy = busySongId === song.id;
                    return (
                      <tr key={song.id} className="group transition-colors hover:bg-base">
                        <th scope="row" className="py-4 pr-4 pl-6 font-medium text-primary">
                          <button
                            type="button"
                            onClick={() => void handleForkPublicSong(song)}
                            className="group/title inline-flex items-center gap-2 text-left font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                          >
                            <span className="decoration-honey decoration-2 underline-offset-4 group-hover/title:underline">
                              {song.title}
                            </span>
                          </button>
                        </th>
                        <td className="px-4 py-4 text-muted">{song.artist || '—'}</td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {song.authorName || 'Community'}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                            <span>{prettyAccidentals(song.lastPlayedKey)}</span>
                            {song.capo > 0 && song.shapeKey && (
                              <span className="rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-muted">
                                Capo {song.capo} · {prettyAccidentals(song.shapeKey)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-4 pr-6 pl-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleForkPublicSong(song)}
                              aria-label={`Copy ${song.title} to My Songs`}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-primary/25 bg-surface px-2.5 py-1 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted" aria-hidden="true" />
                              )}
                              <span>Copy to My Songs</span>
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleUnpublishFromPublicTab(song)}
                                aria-label={`Unpublish ${song.title}`}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-warm-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-50"
                              >
                                <span>Unpublish</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* Bottom-of-screen Confirmation Toast */}
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
            toastState.visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
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
      </div>
    </AuthGate>
  );
}
