'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FilePlus2, Guitar, Music, Plus, Search, Trash2, X } from 'lucide-react';
import { prettyAccidentals } from '@/lib/music';
import { useChordFlowStore } from '@/lib/store';

export default function SavedSongsPage() {
  const router = useRouter();
  const { savedSongs, activeSavedSongId, loadSavedSong, deleteSavedSong, createNewSong } =
    useChordFlowStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSongs = useMemo(() => {
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

  const handleOpenSong = (id: string) => {
    loadSavedSong(id);
    router.push('/');
  };

  const handleCreateNewSong = () => {
    createNewSong();
    router.push('/');
  };

  return (
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
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-primary">Saved songs</h1>
            <p className="mt-1 text-sm text-muted">
              Select a song to open its chord sheet in the workspace, or start a new song from a
              ready-to-fill skeleton template.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-xs font-medium text-muted">
              {searchQuery.trim()
                ? `${filteredSongs.length} of ${savedSongs.length} songs`
                : `${savedSongs.length} ${savedSongs.length === 1 ? 'song' : 'songs'}`}
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

        {/* Search Bar */}
        {savedSongs.length > 0 && (
          <div className="mb-6">
            <label htmlFor="library-search" className="sr-only">
              Search saved songs by title, artist, or key
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
                placeholder="Search by title, artist, or key (e.g. Amazing Grace, Tomlin, Bb)…"
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

        {savedSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-warm-border bg-surface px-6 py-16 text-center shadow-[0_1px_3px_rgba(26,56,43,0.04)]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-primary">
              <Music className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-primary">No saved songs yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Create a new song with a pre-formatted skeleton template, or save your current song
              from the editor header.
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
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg border border-primary/25 bg-surface px-4 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage"
              >
                Open editor
              </Link>
            </div>
          </div>
        ) : filteredSongs.length === 0 ? (
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
                {filteredSongs.map((song) => {
                  const isCurrent = activeSavedSongId === song.id;
                  return (
                    <tr
                      key={song.id}
                      className="group transition-colors hover:bg-base"
                    >
                      <th scope="row" className="py-4 pr-4 pl-6 font-medium text-primary">
                        <button
                          type="button"
                          onClick={() => handleOpenSong(song.id)}
                          className="inline-flex items-center gap-2.5 text-left font-semibold text-primary decoration-honey decoration-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
                        >
                          <span>{song.title}</span>
                          {isCurrent && (
                            <span className="shrink-0 rounded-full border border-primary/25 bg-sage px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Current
                            </span>
                          )}
                        </button>
                      </th>
                      <td className="px-4 py-4 text-muted">
                        {song.artist || '—'}
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
        )}
      </main>
    </div>
  );
}
