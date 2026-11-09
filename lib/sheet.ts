/**
 * Sheet planning: turns a ParsedSong + render settings into a renderer-agnostic plan (sections,
 * tokens with display labels, which diagrams to draw, glossary, header metadata). The DOM preview
 * and the PDF document both render from the same plan so they never disagree.
 */
import type {
  ChordVoicing,
  DiagramScope,
  DisplayMode,
  LayoutPreset,
  ParsedSong,
  SongLine,
} from '@/types/chord';
import { guessKeyFromChord, keyPrefersFlats, transposeChord, transposeKey } from './music';

export interface SheetOptions {
  preset: LayoutPreset;
  diagramScope: DiagramScope;
  displayMode: DisplayMode;
  capo: number;
}

export interface PlannedToken {
  /** Chord as written (shape name), if any. */
  chord?: string;
  /** Chord label to print (shape or concert name). */
  label?: string;
  isCustom: boolean;
  voicing?: ChordVoicing;
  showDiagram: boolean;
  /** Lyric text with whitespace collapsed; may end with a single space. */
  text: string;
  trailingSpace: boolean;
}

export interface PlannedLine {
  kind: 'lyric' | 'comment' | 'tab';
  tokens: PlannedToken[];
  hasChords: boolean;
  hasDiagram: boolean;
  /** Plain text (used for comments, tab lines and height estimation). */
  text: string;
}

export interface PlannedSection {
  label?: string;
  lines: PlannedLine[];
}

export interface KeyInfo {
  shapeKey?: string;
  concertKey?: string;
  capo: number;
  /** e.g. "Capo 3: G Shapes / Concert Key: Bb" or "Key: G". */
  summary: string;
}

export interface SheetPlan {
  title: string;
  artist: string;
  tuning?: string;
  keyInfo: KeyInfo;
  glossary: ChordVoicing[];
  sections: PlannedSection[];
  preset: LayoutPreset;
  displayMode: DisplayMode;
}

export function computeKeyInfo(song: ParsedSong, capo: number): KeyInfo {
  const firstChord = song.lines.flatMap((l) => l.tokens).find((t) => t.chord)?.chord;
  const shapeKey = song.key ?? guessKeyFromChord(firstChord);
  const concertKey = shapeKey && capo > 0 ? transposeKey(shapeKey, capo) : shapeKey;
  let summary: string;
  if (capo > 0) {
    summary = shapeKey
      ? `Capo ${capo}: ${shapeKey} Shapes / Concert Key: ${concertKey}`
      : `Capo ${capo}`;
  } else {
    summary = shapeKey ? `Key: ${shapeKey}` : 'No capo';
  }
  return { shapeKey, concertKey, capo, summary };
}

function normalizeText(text: string, isFirst: boolean): { text: string; trailingSpace: boolean } {
  let t = text.replace(/\s+/g, ' ');
  if (isFirst) t = t.trimStart();
  return { text: t, trailingSpace: /\s$/.test(t) };
}

export function planSheet(song: ParsedSong, opts: SheetOptions): SheetPlan {
  const keyInfo = computeKeyInfo(song, opts.capo);
  const concert = opts.displayMode === 'concert' && opts.capo > 0;
  const preferFlats = keyPrefersFlats(concert ? keyInfo.concertKey : keyInfo.shapeKey);
  const inScope = (v?: ChordVoicing): v is ChordVoicing =>
    !!v && (opts.diagramScope === 'all' || v.isCustom);
  const inlineMode = !concert && (opts.preset === 'inline_all' || opts.preset === 'first_occurrence_only');
  const wantsGlossary = opts.preset === 'top_glossary' || opts.preset === 'worship_two_column';

  const seen = new Set<string>();
  const glossaryMap = new Map<string, ChordVoicing>();

  const planLine = (line: SongLine): PlannedLine => {
    if (line.type === 'tab' || line.type === 'comment') {
      return { kind: line.type, tokens: [], hasChords: false, hasDiagram: false, text: line.rawText };
    }
    let hasDiagram = false;
    const tokens = line.tokens.map((tok, idx): PlannedToken => {
      const norm = normalizeText(tok.text ?? '', idx === 0);
      if (!tok.chord) return { isCustom: false, showDiagram: false, ...norm };
      const v = tok.voicing;
      if (inScope(v) && !glossaryMap.has(tok.chord)) glossaryMap.set(tok.chord, { ...v, name: tok.chord });
      let showDiagram = false;
      if (inlineMode && inScope(v)) {
        showDiagram = opts.preset === 'inline_all' || !seen.has(tok.chord);
        seen.add(tok.chord);
      }
      hasDiagram ||= showDiagram;
      return {
        chord: tok.chord,
        label: concert ? transposeChord(tok.chord, opts.capo, preferFlats) : tok.chord,
        isCustom: v?.isCustom ?? /\*$/.test(tok.chord),
        voicing: v,
        showDiagram,
        ...norm,
      };
    });
    return {
      kind: 'lyric',
      tokens,
      hasChords: tokens.some((t) => t.chord),
      hasDiagram,
      text: tokens.map((t) => t.text).join(''),
    };
  };

  const sections: PlannedSection[] = [];
  let current: PlannedSection | null = null;
  const close = () => {
    if (current && (current.lines.length || current.label)) sections.push(current);
    current = null;
  };

  for (const line of song.lines) {
    if (line.type === 'blank') {
      if (current && (current as PlannedSection).lines.length) close();
      continue;
    }
    if (line.type === 'section_header') {
      close();
      current = { label: line.label, lines: [] };
      continue;
    }
    if (!current) current = { lines: [] };
    (current as PlannedSection).lines.push(planLine(line));
  }
  close();

  // Defined-but-unused custom voicings still belong in the glossary.
  for (const [name, v] of song.customVoicings) if (!glossaryMap.has(name)) glossaryMap.set(name, v);

  return {
    title: song.title,
    artist: song.artist,
    tuning: song.tuning,
    keyInfo,
    glossary: wantsGlossary ? [...glossaryMap.values()].filter((v) => inScope(v)) : [],
    sections,
    preset: opts.preset,
    displayMode: concert ? 'concert' : 'shapes',
  };
}
