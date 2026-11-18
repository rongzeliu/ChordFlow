export type ImportProvider = 'pnwchords' | 'ultimate-guitar' | 'youtube' | 'worshiptogether';

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
  title: string;
  artist: string;
  url: string;
  provider: ImportProvider;
  subtitle?: string;
  key?: string;
}
