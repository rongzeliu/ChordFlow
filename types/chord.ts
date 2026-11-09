/**
 * Core ChordFlow data models.
 *
 * String/fret conventions used everywhere in the codebase:
 *  - `frets` is a 6-element array ordered from string 6 (low E) to string 1 (high e).
 *  - `-1` = muted string (×), `0` = open string (○), `n > 0` = ABSOLUTE fret number.
 *  - `baseFret` is the first fret shown in the diagram (1 = open position, nut drawn).
 */

export interface ChordVoicing {
  /** Lookup/display name including any asterisk, e.g. "G*", "D/F#*", "Em7". */
  name: string;
  /** Base chord name without asterisk, e.g. "G", "D/F#". */
  rawName: string;
  /** 6 entries, low E → high e. -1 = muted, 0 = open, n = absolute fret. */
  frets: number[];
  /** Optional finger indicators (1–4), 0 = no finger. Same order as `frets`. */
  fingers?: number[];
  /** 1 for open position; > 1 for voicings higher up the neck. */
  baseFret: number;
  /** Barre span. `fromString`/`toString` are indices into `frets` (0 = low E); `fret` is absolute. */
  barre?: { fromString: number; toString: number; fret: number };
  /** True if tagged with an asterisk or defined in a header glossary. */
  isCustom: boolean;
}

export interface LyricChordToken {
  type: 'lyric' | 'chord' | 'chord_with_lyric';
  chord?: string;
  voicing?: ChordVoicing;
  text?: string;
}

export interface SongLine {
  /** `blank` separates stanzas; `tab` is a raw ASCII tablature line rendered monospace. */
  type: 'section_header' | 'lyric_line' | 'comment' | 'blank' | 'tab';
  rawText: string;
  tokens: LyricChordToken[];
  /** Section label for `section_header` lines, e.g. "Verse 1". */
  label?: string;
}

export interface ParsedSong {
  title: string;
  artist: string;
  key?: string;
  capo?: number;
  tuning?: string;
  customVoicings: Map<string, ChordVoicing>;
  lines: SongLine[];
}

export type LayoutPreset =
  | 'inline_all'
  | 'first_occurrence_only'
  | 'top_glossary'
  | 'worship_two_column';

export type DiagramSize = 'compact' | 'standard';
/** Which chords get diagrams: only custom (asterisked/defined) voicings, or every chord. */
export type DiagramScope = 'custom' | 'all';
/** Chord names over lyrics: guitar shapes (relative to capo) or concert pitch. */
export type DisplayMode = 'shapes' | 'concert';
export type PageSize = 'A4' | 'LETTER';

export interface RenderSettings {
  preset: LayoutPreset;
  diagramSize: DiagramSize;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  /** Font / diagram scale multiplier, 0.8 – 1.2. */
  scale: number;
  pageSize: PageSize;
}
