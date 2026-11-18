export type ImportProvider =
  | 'pnwchords'
  | 'ultimate-guitar'
  | 'youtube'
  | 'worshiptogether'
  | 'spotify'
  | 'itunes'
  | 'gemini';

export interface ImportedSongResponse {
  title: string;
  artist: string;
  key?: string;
  capo?: number;
  tuning?: string;
  /** Full ChordFlow plain-text format including header block (`Title:`, `Artist:`, `Key:`, `Capo:`, `Tuning:`). */
  formattedText: string;
  provider: ImportProvider;
  sourceUrl: string;
}

export interface SongSearchResult {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  url: string;
  provider: ImportProvider;
  subtitle?: string;
  key?: string;
}
