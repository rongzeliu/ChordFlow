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

export interface PlannedChord {
  /** Chord as written (shape name), if any. */
  chord: string;
  /** Chord label to print (shape or concert name). */
  label: string;
  isCustom: boolean;
  voicing?: ChordVoicing;
  showDiagram: boolean;
}

export interface PlannedToken {
  /** Chord as written (shape name), if any. */
  chord?: string;
  /** Chord label to print (shape or concert name). */
  label?: string;
  isCustom: boolean;
  voicing?: ChordVoicing;
  showDiagram: boolean;
  /** Multiple chords stacked over a joined hyphenated word (e.g. "No-vem-ber"). */
  chords?: PlannedChord[];
  /** Lyric text with whitespace collapsed; may end with a single space. */
  text: string;
  trailingSpace: boolean;
  /** True when the lyric slice ends with a mid-word hyphen (e.g. "No-" before "vem-ber"). */
  isHyphenated?: boolean;
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

function normalizeText(
  text: string,
  isFirst: boolean,
): { text: string; trailingSpace: boolean; isHyphenated: boolean } {
  let t = text.replace(/\s+/g, ' ');
  // Collapse intra-token hyphen-space sequences (e.g. "ar- y," -> "ar-y,", "No-  vem-ber" -> "No-vem-ber")
  t = t.replace(/([A-Za-z])-(?:\s*-)*\s+(?=[A-Za-z])/g, '$1-');
  // Strip trailing alignment spaces / repeated filler hyphens after a mid-word hyphen (e.g. "No-   " -> "No-", "al- -  " -> "al-")
  t = t.replace(/([A-Za-z])-(?:\s*-)*\s*$/, '$1-');
  if (isFirst) t = t.trimStart();
  const isHyphenated = /[A-Za-z]-$/.test(t);
  return { text: t, trailingSpace: !isHyphenated && /\s$/.test(t), isHyphenated };
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

    // Join runs of short hyphenated chord tokens (e.g. [G#m7b5]"No-" + [Amaj7]"vem-" + [D7/F#]"ber will")
    // so mid-word syllables remain unbroken while keeping each chord clickable & visible above the word.
    const mergedTokens: PlannedToken[] = [];
    for (let idx = 0; idx < tokens.length; idx++) {
      const cur = tokens[idx];
      if (
        cur.chord &&
        cur.label &&
        cur.isHyphenated &&
        !/\s/.test(cur.text) &&
        idx + 1 < tokens.length &&
        tokens[idx + 1].chord &&
        tokens[idx + 1].label
      ) {
        const groupedChords: PlannedChord[] = [
          {
            chord: cur.chord,
            label: cur.label,
            isCustom: cur.isCustom,
            voicing: cur.voicing,
            showDiagram: cur.showDiagram,
          },
        ];
        let combinedText = cur.text;
        let last = cur;
        let j = idx + 1;
        while (j < tokens.length && tokens[j].chord && tokens[j].label) {
          const nxt = tokens[j];
          groupedChords.push({
            chord: nxt.chord!,
            label: nxt.label!,
            isCustom: nxt.isCustom,
            voicing: nxt.voicing,
            showDiagram: nxt.showDiagram,
          });
          combinedText += nxt.text;
          last = nxt;
          j++;
          if (!nxt.isHyphenated || /\s/.test(nxt.text)) break;
        }
        mergedTokens.push({
          chord: cur.chord,
          label: cur.label,
          isCustom: groupedChords.some((c) => c.isCustom),
          voicing: cur.voicing,
          showDiagram: groupedChords.some((c) => c.showDiagram),
          chords: groupedChords,
          text: combinedText,
          trailingSpace: last.trailingSpace,
          isHyphenated: last.isHyphenated,
        });
        idx = j - 1;
      } else {
        mergedTokens.push(cur);
      }
    }

    return {
      kind: 'lyric',
      tokens: mergedTokens,
      hasChords: mergedTokens.some((t) => t.chord || (t.chords && t.chords.length > 0)),
      hasDiagram,
      text: mergedTokens.map((t) => t.text).join(''),
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
