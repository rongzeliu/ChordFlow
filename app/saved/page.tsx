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
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-stone-100 text-stone-900">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-6">
        <div className="flex items-center gap-2.5">
          <Guitar className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">ChordFlow</span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCreateNewSong}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 text-xs font-medium text-white shadow-2xs transition hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New song</span>
          </button>

          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />
            <span>Back to editor</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900">Saved songs</h1>
            <p className="mt-1 text-sm text-stone-500">
              Select a song to open its chord sheet in the workspace, or start a new song from a
              ready-to-fill skeleton template.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-xs font-medium text-stone-400">
              {searchQuery.trim()
                ? `${filteredSongs.length} of ${savedSongs.length} songs`
                : `${savedSongs.length} ${savedSongs.length === 1 ? 'song' : 'songs'}`}
            </span>
            <button
              type="button"
              onClick={handleCreateNewSong}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              <FilePlus2 className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
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
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400"
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
                className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pr-9 pl-10 text-sm text-stone-900 shadow-2xs placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {savedSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-white px-6 py-16 text-center">
            <Music className="mb-3 h-7 w-7 text-stone-300" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-800">No saved songs yet</p>
            <p className="mt-1 max-w-sm text-xs text-stone-500">
              Create a new song with a pre-formatted skeleton template, or save your current song
              from the editor header.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCreateNewSong}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-4 text-xs font-medium text-white hover:bg-stone-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>New song from template</span>
              </button>
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg border border-stone-200 bg-white px-4 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                Open editor
              </Link>
            </div>
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-stone-800">
              No songs matching &ldquo;{searchQuery.trim()}&rdquo;
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Try searching for a different song title, artist name, or musical key.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Saved songs library</caption>
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/70 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
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
              <tbody className="divide-y divide-stone-100 text-sm">
                {filteredSongs.map((song) => {
                  const isCurrent = activeSavedSongId === song.id;
                  return (
                    <tr
                      key={song.id}
                      className="group transition-colors hover:bg-stone-50/80"
                    >
                      <th scope="row" className="py-4 pr-4 pl-6 font-medium text-stone-900">
                        <button
                          type="button"
                          onClick={() => handleOpenSong(song.id)}
                          className="inline-flex items-center gap-2.5 text-left font-medium text-stone-900 hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                        >
                          <span>{song.title}</span>
                          {isCurrent && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Active
                            </span>
                          )}
                        </button>
                      </th>
                      <td className="px-4 py-4 text-stone-500">
                        {song.artist || '—'}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 font-medium text-stone-900">
                          <span>{prettyAccidentals(song.lastPlayedKey)}</span>
                          {song.capo > 0 && song.shapeKey && (
                            <span className="text-xs font-normal text-stone-400">
                              (Capo {song.capo} · {prettyAccidentals(song.shapeKey)})
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
                            className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100 hover:text-stone-900"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedSong(song.id)}
                            aria-label={`Delete ${song.title}`}
                            className="rounded-md p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
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
