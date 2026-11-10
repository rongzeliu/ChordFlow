export type ImportProvider = 'pnwchords' | 'ultimate-guitar';

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
