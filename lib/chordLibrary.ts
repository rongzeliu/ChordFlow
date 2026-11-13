/**
 * Comprehensive guitar chord voicing database & position lookup.
 *
 * Combines:
 *  1. The 132 canonical shapes from "The Ultimate Guitar Chord Chart" (TrueFire: 12 roots × 11
 *     types: Major, m, 6, 7, 9, m6, m7, maj7, dim, +, sus)
 *  2. Worship / acoustic drone & slash voicings (all-guitar-chords.com & rehearsal standards)
 *  3. All 2,069 multi-position neck voicings from `@tombatossals/chords-db` (all-guitar-chords
 *     positions across the fretboard with fingerings and barres)
 *  4. Algorithmic movable E-shape / A-shape / CAGED generators for any exotic chord suffix.
 */
import guitarDb from '@tombatossals/chords-db/lib/guitar.json';
import type { ChordVoicing } from '@/types/chord';
import { noteIndex, parseChordName, stripStars } from './music';
import { buildVoicing, fretsToString, parseFretString } from './voicing';

export interface VoicingCandidate {
  id: string;
  label: string;
  source: 'song' | 'truefire' | 'chords-db' | 'caged';
  voicing: ChordVoicing;
}

interface RawDbPosition {
  frets: number[];
  fingers?: number[];
  baseFret: number;
  barres?: number[];
}

interface RawDbChord {
  key: string;
  suffix: string;
  positions: RawDbPosition[];
}

const DB_CHORDS = (guitarDb as { chords: Record<string, RawDbChord[]> }).chords;

/** Maps pitch class (0 = C .. 11 = B) to `@tombatossals/chords-db` object key. */
const PITCH_TO_DB_KEY: string[] = [
  'C',
  'Csharp',
  'D',
  'Eb',
  'E',
  'F',
  'Fsharp',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

const PITCH_TO_CANONICAL_ROOT: string[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/**
 * 132 canonical voicings from the attached "The Ultimate Guitar Chord Chart" (TrueFire)
 * plus common acoustic/worship open-drone and slash shapes.
 * Indexed by `<CanonicalRoot>|<normalizedSuffix>`.
 */
const TRUEFIRE_CHART: Record<string, { frets: string; label: string }[]> = {
  // Ab / G# row
  'Ab|': [
    { frets: '4-6-6-5-4-4', label: 'TrueFire Chart (4fr E-Barre)' },
    { frets: 'x-x-6-5-4-4', label: 'Compact Triad (4fr)' },
  ],
  'Ab|m': [
    { frets: '4-6-6-4-4-4', label: 'TrueFire Chart (4fr Em-Barre)' },
    { frets: 'x-x-6-4-4-4', label: 'Compact Minor (4fr)' },
  ],
  'Ab|6': [{ frets: '4-x-3-5-4-x', label: 'TrueFire Chart (3fr Jazz 6th)' }],
  'Ab|7': [{ frets: '4-6-4-5-4-4', label: 'TrueFire Chart (4fr Dom 7)' }],
  'Ab|9': [{ frets: 'x-3-4-3-4-4', label: 'TrueFire Chart (9th Shape)' }],
  'Ab|m6': [{ frets: 'x-x-3-4-4-4', label: 'TrueFire Chart (m6 Shape)' }],
  'Ab|m7': [{ frets: '4-6-4-4-4-4', label: 'TrueFire Chart (4fr m7 Barre)' }],
  'Ab|maj7': [{ frets: '4-x-5-5-4-x', label: 'TrueFire Chart (Root-6 Maj7)' }],
  'Ab|dim': [{ frets: '4-x-3-4-3-x', label: 'TrueFire Chart (Dim 7th)' }],
  'Ab|aug': [{ frets: 'x-x-2-1-1-0', label: 'TrueFire Chart (Augmented)' }],
  'Ab|sus4': [{ frets: '4-6-6-6-4-4', label: 'TrueFire Chart (4fr Sus4)' }],

  // A row
  'A|': [
    { frets: 'x-0-2-2-2-0', label: 'TrueFire Chart (Open A)' },
    { frets: 'x-0-2-2-0-0', label: 'Open Asus2 Ring' },
    { frets: '5-7-7-6-5-5', label: '5fr E-Shape Barre' },
  ],
  'A|m': [
    { frets: 'x-0-2-2-1-0', label: 'TrueFire Chart (Open Am)' },
    { frets: '5-7-7-5-5-5', label: '5fr Em-Shape Barre' },
  ],
  'A|6': [{ frets: 'x-0-2-2-2-2', label: 'TrueFire Chart (Open A6 Barre)' }],
  'A|7': [
    { frets: 'x-0-2-0-2-0', label: 'TrueFire Chart (Open A7)' },
    { frets: 'x-0-2-2-2-3', label: 'Open A7 (High G)' },
  ],
  'A|9': [{ frets: 'x-0-2-4-2-3', label: 'TrueFire Chart (Open A9)' }],
  'A|m6': [{ frets: 'x-0-2-2-1-2', label: 'TrueFire Chart (Open Am6)' }],
  'A|m7': [
    { frets: 'x-0-2-0-1-0', label: 'TrueFire Chart (Open Am7)' },
    { frets: 'x-0-2-2-1-3', label: 'Open Am7 (High G)' },
  ],
  'A|maj7': [{ frets: 'x-0-2-1-2-0', label: 'TrueFire Chart (Open Amaj7)' }],
  'A|dim': [{ frets: 'x-0-1-2-1-x', label: 'TrueFire Chart (Adim)' }],
  'A|aug': [{ frets: 'x-0-3-2-2-1', label: 'TrueFire Chart (A+)' }],
  'A|sus4': [{ frets: 'x-0-2-2-3-0', label: 'TrueFire Chart (Open Asus4)' }],
  'A|sus2': [{ frets: 'x-0-2-2-0-0', label: 'Open Asus2' }],

  // Bb row
  'Bb|': [
    { frets: 'x-1-3-3-3-1', label: 'TrueFire Chart (1fr A-Barre)' },
    { frets: '6-8-8-7-6-6', label: '6fr E-Shape Barre' },
  ],
  'Bb|m': [{ frets: 'x-1-3-3-2-1', label: 'TrueFire Chart (1fr Am-Barre)' }],
  'Bb|6': [{ frets: 'x-1-3-3-3-3', label: 'TrueFire Chart (1fr Bb6)' }],
  'Bb|7': [{ frets: 'x-1-3-1-3-1', label: 'TrueFire Chart (1fr Bb7)' }],
  'Bb|9': [{ frets: 'x-1-0-1-1-1', label: 'TrueFire Chart (Bb9)' }],
  'Bb|m6': [{ frets: 'x-1-3-0-2-x', label: 'TrueFire Chart (Bbm6)' }],
  'Bb|m7': [{ frets: 'x-1-3-1-2-1', label: 'TrueFire Chart (1fr Bbm7)' }],
  'Bb|maj7': [{ frets: 'x-1-3-2-3-1', label: 'TrueFire Chart (1fr Bbmaj7)' }],
  'Bb|dim': [{ frets: 'x-1-2-3-2-x', label: 'TrueFire Chart (Bbdim)' }],
  'Bb|aug': [{ frets: 'x-1-0-3-3-2', label: 'TrueFire Chart (Bb+)' }],
  'Bb|sus4': [{ frets: 'x-1-3-3-4-1', label: 'TrueFire Chart (1fr Bbsus4)' }],

  // B row
  'B|': [
    { frets: 'x-2-4-4-4-2', label: 'TrueFire Chart (2fr A-Barre)' },
    { frets: 'x-2-4-4-0-0', label: 'Open-Drone Bsus4/B' },
    { frets: '7-9-9-8-7-7', label: '7fr E-Shape Barre' },
  ],
  'B|m': [
    { frets: 'x-2-4-4-3-2', label: 'TrueFire Chart (2fr Am-Barre)' },
    { frets: 'x-2-0-2-3-2', label: 'Open Bm7/11 Voicing' },
  ],
  'B|6': [{ frets: 'x-2-4-4-4-4', label: 'TrueFire Chart (2fr B6)' }],
  'B|7': [
    { frets: 'x-2-1-2-0-2', label: 'TrueFire Chart (Open B7)' },
    { frets: 'x-2-4-2-4-2', label: '2fr A7-Shape Barre' },
  ],
  'B|9': [{ frets: 'x-2-1-2-2-2', label: 'TrueFire Chart (B9)' }],
  'B|m6': [{ frets: 'x-2-0-1-0-2', label: 'TrueFire Chart (Bm6)' }],
  'B|m7': [
    { frets: 'x-2-0-2-0-2', label: 'TrueFire Chart (Open Bm7)' },
    { frets: 'x-2-4-2-3-2', label: '2fr Am7-Shape Barre' },
  ],
  'B|maj7': [{ frets: 'x-2-4-3-4-2', label: 'TrueFire Chart (2fr Bmaj7)' }],
  'B|dim': [{ frets: 'x-2-3-4-3-x', label: 'TrueFire Chart (Bdim)' }],
  'B|aug': [{ frets: 'x-2-1-0-0-3', label: 'TrueFire Chart (B+)' }],
  'B|sus4': [
    { frets: 'x-2-4-4-5-2', label: 'TrueFire Chart (2fr Bsus4)' },
    { frets: 'x-2-4-4-0-0', label: 'Open-E Drone Bsus4' },
  ],

  // C row
  'C|': [
    { frets: 'x-3-2-0-1-0', label: 'TrueFire Chart (Open C)' },
    { frets: 'x-3-2-0-3-3', label: 'Worship C(add9) Shape' },
    { frets: '3-3-2-0-1-0', label: 'Open C/G (Full 6-String)' },
    { frets: 'x-3-5-5-5-3', label: '3fr A-Shape Barre' },
  ],
  'C|m': [{ frets: 'x-3-5-5-4-3', label: 'TrueFire Chart (3fr Cm Barre)' }],
  'C|6': [{ frets: 'x-3-2-2-1-0', label: 'TrueFire Chart (Open C6)' }],
  'C|7': [{ frets: 'x-3-2-3-1-0', label: 'TrueFire Chart (Open C7)' }],
  'C|9': [{ frets: 'x-3-2-3-3-0', label: 'TrueFire Chart (C9)' }],
  'C|m6': [{ frets: 'x-3-1-2-1-3', label: 'TrueFire Chart (Cm6)' }],
  'C|m7': [{ frets: 'x-3-5-3-4-3', label: 'TrueFire Chart (3fr Cm7)' }],
  'C|maj7': [{ frets: 'x-3-2-0-0-0', label: 'TrueFire Chart (Open Cmaj7)' }],
  'C|dim': [{ frets: 'x-3-4-2-4-x', label: 'TrueFire Chart (Cdim)' }],
  'C|aug': [{ frets: 'x-3-2-1-1-0', label: 'TrueFire Chart (C+)' }],
  'C|sus4': [{ frets: 'x-3-3-0-1-1', label: 'TrueFire Chart (Csus4)' }],
  'C|add9': [
    { frets: 'x-3-2-0-3-3', label: 'Worship Cadd9 (High G)' },
    { frets: 'x-3-2-0-3-0', label: 'Open Cadd9' },
  ],

  // Db / C# row
  'Db|': [{ frets: 'x-4-6-6-6-4', label: 'TrueFire Chart (4fr A-Barre)' }],
  'Db|m': [
    { frets: 'x-4-6-6-5-4', label: 'TrueFire Chart (4fr C#m Barre)' },
    { frets: 'x-4-6-6-0-0', label: 'Open-E Drone C#m7' },
  ],
  'Db|6': [{ frets: 'x-4-3-3-2-1', label: 'TrueFire Chart (Db6)' }],
  'Db|7': [{ frets: 'x-4-6-4-6-4', label: 'TrueFire Chart (4fr Db7)' }],
  'Db|9': [{ frets: 'x-4-3-4-4-4', label: 'TrueFire Chart (Db9)' }],
  'Db|m6': [{ frets: 'x-4-2-3-2-4', label: 'TrueFire Chart (C#m6)' }],
  'Db|m7': [
    { frets: 'x-4-6-4-5-4', label: 'TrueFire Chart (4fr C#m7)' },
    { frets: 'x-4-6-6-0-0', label: 'Open-E Drone C#m7' },
  ],
  'Db|maj7': [{ frets: 'x-4-6-5-6-4', label: 'TrueFire Chart (4fr Dbmaj7)' }],
  'Db|dim': [{ frets: 'x-4-2-0-2-0', label: 'TrueFire Chart (C#dim)' }],
  'Db|aug': [{ frets: 'x-4-3-2-2-1', label: 'TrueFire Chart (Db+)' }],
  'Db|sus4': [{ frets: 'x-4-6-6-7-4', label: 'TrueFire Chart (4fr Dbsus)' }],

  // D row
  'D|': [
    { frets: 'x-x-0-2-3-2', label: 'TrueFire Chart (Open D)' },
    { frets: '2-0-0-2-3-2', label: 'D/F# Thumb Wrap' },
    { frets: 'x-5-7-7-7-5', label: '5fr A-Shape Barre' },
  ],
  'D|m': [
    { frets: 'x-x-0-2-3-1', label: 'TrueFire Chart (Open Dm)' },
    { frets: 'x-5-7-7-6-5', label: '5fr Am-Shape Barre' },
  ],
  'D|6': [{ frets: 'x-x-0-2-0-2', label: 'TrueFire Chart (Open D6)' }],
  'D|7': [{ frets: 'x-x-0-2-1-2', label: 'TrueFire Chart (Open D7)' }],
  'D|9': [{ frets: 'x-5-4-5-5-5', label: 'TrueFire Chart (5fr D9)' }],
  'D|m6': [{ frets: 'x-x-0-2-0-1', label: 'TrueFire Chart (Open Dm6)' }],
  'D|m7': [{ frets: 'x-x-0-2-1-1', label: 'TrueFire Chart (Open Dm7)' }],
  'D|maj7': [{ frets: 'x-x-0-2-2-2', label: 'TrueFire Chart (Open Dmaj7)' }],
  'D|dim': [{ frets: 'x-x-0-1-3-1', label: 'TrueFire Chart (Open Ddim)' }],
  'D|aug': [{ frets: 'x-x-0-3-3-2', label: 'TrueFire Chart (Open D+)' }],
  'D|sus4': [{ frets: 'x-x-0-2-3-3', label: 'TrueFire Chart (Open Dsus4)' }],
  'D|sus2': [{ frets: 'x-x-0-2-3-0', label: 'Open Dsus2' }],

  // Eb row
  'Eb|': [
    { frets: 'x-6-8-8-8-6', label: 'TrueFire Chart (6fr A-Barre)' },
    { frets: 'x-x-1-3-4-3', label: 'Compact Eb (1fr D-Shape)' },
  ],
  'Eb|m': [{ frets: 'x-6-8-8-7-6', label: 'TrueFire Chart (6fr Ebm)' }],
  'Eb|6': [{ frets: 'x-6-5-5-4-3', label: 'TrueFire Chart (Eb6)' }],
  'Eb|7': [{ frets: 'x-6-8-6-8-6', label: 'TrueFire Chart (6fr Eb7)' }],
  'Eb|9': [{ frets: 'x-6-5-6-6-6', label: 'TrueFire Chart (Eb9)' }],
  'Eb|m6': [{ frets: 'x-6-4-5-4-6', label: 'TrueFire Chart (Ebm6)' }],
  'Eb|m7': [{ frets: 'x-6-8-6-7-6', label: 'TrueFire Chart (6fr Ebm7)' }],
  'Eb|maj7': [{ frets: 'x-6-8-7-8-6', label: 'TrueFire Chart (6fr Ebmaj7)' }],
  'Eb|dim': [{ frets: 'x-x-1-2-4-2', label: 'TrueFire Chart (Ebdim)' }],
  'Eb|aug': [{ frets: 'x-x-1-0-0-3', label: 'TrueFire Chart (Eb+)' }],
  'Eb|sus4': [{ frets: 'x-6-8-8-9-6', label: 'TrueFire Chart (6fr Ebsus)' }],

  // E row
  'E|': [
    { frets: '0-2-2-1-0-0', label: 'TrueFire Chart (Open E)' },
    { frets: '0-7-9-9-0-0', label: 'High-Neck Open-E Drone' },
  ],
  'E|m': [
    { frets: '0-2-2-0-0-0', label: 'TrueFire Chart (Open Em)' },
    { frets: '0-2-2-0-3-3', label: 'Worship Em7 (Open G Drone)' },
  ],
  'E|6': [{ frets: '0-2-2-1-2-0', label: 'TrueFire Chart (Open E6)' }],
  'E|7': [
    { frets: '0-2-0-1-0-0', label: 'TrueFire Chart (Open E7)' },
    { frets: '0-2-2-1-3-0', label: 'Open E7 (High D)' },
  ],
  'E|9': [{ frets: '0-2-0-1-0-2', label: 'TrueFire Chart (Open E9)' }],
  'E|m6': [{ frets: '0-2-2-0-2-0', label: 'TrueFire Chart (Open Em6)' }],
  'E|m7': [
    { frets: '0-2-0-0-0-0', label: 'TrueFire Chart (Open Em7)' },
    { frets: '0-2-2-0-3-3', label: 'Worship Em7 (3rd-Fret B & e)' },
    { frets: '0-2-2-0-3-0', label: 'Open Em7 (4-Finger)' },
  ],
  'E|maj7': [{ frets: '0-2-1-1-0-0', label: 'TrueFire Chart (Open Emaj7)' }],
  'E|dim': [{ frets: '0-1-2-0-2-0', label: 'TrueFire Chart (Open Edim)' }],
  'E|aug': [{ frets: '0-3-2-1-1-0', label: 'TrueFire Chart (Open E+)' }],
  'E|sus4': [{ frets: '0-2-2-2-0-0', label: 'TrueFire Chart (Open Esus4)' }],

  // F row
  'F|': [
    { frets: '1-3-3-2-1-1', label: 'TrueFire Chart (1fr Full Barre)' },
    { frets: 'x-x-3-2-1-1', label: 'Compact F (4-String)' },
    { frets: 'x-3-3-2-1-0', label: 'Open Fmaj7/C (Easy F)' },
  ],
  'F|m': [{ frets: '1-3-3-1-1-1', label: 'TrueFire Chart (1fr Fm Barre)' }],
  'F|6': [{ frets: 'x-x-3-2-3-1', label: 'TrueFire Chart (F6)' }],
  'F|7': [{ frets: '1-3-1-2-1-1', label: 'TrueFire Chart (1fr F7 Barre)' }],
  'F|9': [{ frets: '1-0-1-0-1-1', label: 'TrueFire Chart (F9)' }],
  'F|m6': [{ frets: 'x-x-0-1-1-1', label: 'TrueFire Chart (Fm6)' }],
  'F|m7': [{ frets: '1-3-1-1-1-1', label: 'TrueFire Chart (1fr Fm7 Barre)' }],
  'F|maj7': [
    { frets: 'x-x-3-2-1-0', label: 'TrueFire Chart (Open Fmaj7)' },
    { frets: '1-x-2-2-1-x', label: 'Jazz Root-6 Fmaj7' },
  ],
  'F|dim': [{ frets: 'x-x-0-1-0-1', label: 'TrueFire Chart (Fdim)' }],
  'F|aug': [{ frets: 'x-x-3-2-2-1', label: 'TrueFire Chart (F+)' }],
  'F|sus4': [{ frets: '1-3-3-3-1-1', label: 'TrueFire Chart (1fr Fsus4)' }],

  // F# / Gb row
  'F#|': [{ frets: '2-4-4-3-2-2', label: 'TrueFire Chart (2fr Full Barre)' }],
  'F#|m': [
    { frets: '2-4-4-2-2-2', label: 'TrueFire Chart (2fr F#m Barre)' },
    { frets: '2-x-2-2-0-0', label: 'Open-E Drone F#m11' },
  ],
  'F#|6': [{ frets: '2-x-1-3-2-x', label: 'TrueFire Chart (Gb6)' }],
  'F#|7': [{ frets: '2-4-2-3-2-2', label: 'TrueFire Chart (2fr F#7)' }],
  'F#|9': [{ frets: 'x-1-2-1-2-2', label: 'TrueFire Chart (F#9)' }],
  'F#|m6': [{ frets: 'x-x-1-2-2-2', label: 'TrueFire Chart (F#m6)' }],
  'F#|m7': [
    { frets: '2-4-2-2-2-2', label: 'TrueFire Chart (2fr F#m7)' },
    { frets: '2-x-2-2-0-0', label: 'Open F#m7/11' },
  ],
  'F#|maj7': [{ frets: '2-x-3-3-2-x', label: 'TrueFire Chart (Gbmaj7)' }],
  'F#|dim': [{ frets: '2-x-1-2-1-x', label: 'TrueFire Chart (F#dim)' }],
  'F#|aug': [{ frets: 'x-x-4-3-3-2', label: 'TrueFire Chart (Gb+)' }],
  'F#|sus4': [{ frets: '2-4-4-4-2-2', label: 'TrueFire Chart (2fr Gbsus)' }],

  // G row
  'G|': [
    { frets: '3-2-0-0-0-3', label: 'TrueFire Chart (Standard Open G)' },
    { frets: '3-2-0-0-3-3', label: 'Worship 4-Finger G (B & e 3rd Fret)' },
    { frets: '3-x-0-0-0-3', label: 'Muted-A Folk G' },
    { frets: '3-5-5-4-3-3', label: '3fr E-Shape Barre' },
  ],
  'G|m': [{ frets: '3-5-5-3-3-3', label: 'TrueFire Chart (3fr Gm Barre)' }],
  'G|6': [{ frets: '3-2-0-0-0-0', label: 'TrueFire Chart (Open G6)' }],
  'G|7': [{ frets: '3-2-0-0-0-1', label: 'TrueFire Chart (Open G7)' }],
  'G|9': [{ frets: '3-x-0-2-0-1', label: 'TrueFire Chart (Open G9)' }],
  'G|m6': [{ frets: '3-x-2-3-3-3', label: 'TrueFire Chart (Gm6)' }],
  'G|m7': [{ frets: '3-5-3-3-3-3', label: 'TrueFire Chart (3fr Gm7 Barre)' }],
  'G|maj7': [{ frets: '3-2-0-0-0-2', label: 'TrueFire Chart (Open Gmaj7)' }],
  'G|dim': [{ frets: '3-x-2-3-2-x', label: 'TrueFire Chart (Gdim)' }],
  'G|aug': [{ frets: '3-2-1-0-0-3', label: 'TrueFire Chart (G+)' }],
  'G|sus4': [
    { frets: '3-3-0-0-1-3', label: 'TrueFire Chart (Gsus)' },
    { frets: '3-x-0-0-1-3', label: 'Open Gsus4' },
  ],
  'G|sus2': [
    { frets: '3-0-0-0-3-3', label: 'Open G2 / Gsus2' },
    { frets: '3-x-0-2-0-3', label: 'Open Gadd9' },
  ],
  'G|sus#4/2': [
    { frets: '3-x-0-2-0-2', label: 'Open Gsus#4/2 (Lydian)' },
    { frets: '3-2-0-2-1-3', label: 'Open Gsus#4/2' },
  ],
  'G|sus#4': [
    { frets: '3-x-0-0-2-3', label: 'Open Gsus#4' },
    { frets: '3-2-0-0-2-3', label: 'Full Open Gsus#4' },
  ],
};

/** Popular slash chords with multiple playable options. */
const SLASH_CHORD_SHAPES: Record<string, { frets: string; label: string }[]> = {
  'D/F#': [
    { frets: '2-0-0-2-3-2', label: 'Open D/F# (Thumb Low E)' },
    { frets: '2-0-0-2-3-3', label: 'Worship Dsus4/F# (3rd-Fret High e)' },
    { frets: '2-x-0-2-3-2', label: 'Muted-A D/F#' },
  ],
  'D7/F#': [
    { frets: '2-x-0-2-1-2', label: 'Open D7/F# (Thumb Low E)' },
    { frets: '2-0-0-2-1-2', label: 'Full Open D7/F#' },
  ],
  'G/B': [
    { frets: 'x-2-0-0-3-3', label: 'Worship G/B (Double 3rd Fret)' },
    { frets: 'x-2-0-0-0-3', label: 'Standard Open G/B' },
    { frets: 'x-2-0-0-3-x', label: 'Acoustic 4-String G/B' },
  ],
  'C/G': [
    { frets: '3-3-2-0-1-0', label: 'Full 6-String C/G' },
    { frets: '3-3-2-0-3-3', label: 'Worship Cadd9/G' },
  ],
  'C/E': [
    { frets: '0-3-2-0-1-0', label: 'Open Low-E C/E' },
    { frets: '0-3-2-0-3-3', label: 'Worship Cadd9/E' },
  ],
  'E/G#': [
    { frets: '4-x-2-4-0-0', label: 'Open-Drone E/G#' },
    { frets: '4-2-2-1-0-0', label: 'Full Open E/G#' },
  ],
  'E7/G#': [
    { frets: '4-x-0-1-0-0', label: 'Open E7/G#' },
    { frets: '4-2-0-1-0-0', label: 'Full Open E7/G#' },
  ],
  'Am/G': [
    { frets: '3-0-2-2-1-0', label: 'Open Am/G' },
    { frets: '3-x-2-2-1-0', label: 'Muted-A Am/G' },
  ],
};

/** Offsets relative to the root fret; -99 = muted. */
const X = -99;
const E_SHAPES: Record<string, number[]> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, X, 1, 1, 0, X],
  sus4: [0, 2, 2, 2, 0, 0],
  '6': [0, 2, 2, 1, 2, 0],
  '7sus4': [0, 2, 0, 2, 0, 0],
};
const A_SHAPES: Record<string, number[]> = {
  '': [X, 0, 2, 2, 2, 0],
  m: [X, 0, 2, 2, 1, 0],
  '7': [X, 0, 2, 0, 2, 0],
  m7: [X, 0, 2, 0, 1, 0],
  maj7: [X, 0, 2, 1, 2, 0],
  sus2: [X, 0, 2, 2, 0, 0],
  sus4: [X, 0, 2, 2, 3, 0],
  '7sus4': [X, 0, 2, 0, 3, 0],
  add9: [X, 0, 2, 4, 0, X],
  '9': [X, 0, -1, 0, 0, 0],
  m7b5: [X, 0, 1, 0, 1, X],
  dim7: [X, 0, 1, -1, 1, X],
  dim: [X, 0, 1, 2, 1, X],
  aug: [X, 0, -1, -2, -2, X],
};

export function normalizeSuffix(suffix: string): string {
  let s = suffix;
  if (/^(maj|M)$/.test(s)) return '';
  if (s === 'Δ' || s === 'Δ7') return 'maj7';
  if (s === '°') return 'dim';
  if (s === '°7') return 'dim7';
  if (s === 'ø' || s === 'ø7') return 'm7b5';
  if (s === '+') return 'aug';
  if (s === 'sus' || s === '4' || s === 'add4') return 'sus4';
  if (s === '2' || s === 'add2') return 'sus2';
  if (s === '6/9') return '69';
  if (s === 'm6/9') return 'm69';
  s = s
    .replace(/^M(?=\d)/, 'maj')
    .replace(/^min(?!or)/, 'm')
    .replace(/^mi(?!n)/, 'm')
    .replace(/^-/, 'm');
  return s;
}

/** Derives a simpler fallback suffix when an extended/altered suffix has no direct library entry. */
function fallbackSuffix(normSuffix: string): string {
  if (/^m(?!aj)/.test(normSuffix)) {
    if (/(?:7|9|11|13)/.test(normSuffix)) return 'm7';
    if (/6/.test(normSuffix)) return 'm6';
    return 'm';
  }
  if (/maj(?:7|9|11|13)/.test(normSuffix)) return 'maj7';
  if (/7sus/.test(normSuffix)) return '7sus4';
  if (/sus#?4\/2|sus2/.test(normSuffix)) return 'sus2';
  if (/sus/.test(normSuffix)) return 'sus4';
  if (/add9|add2/.test(normSuffix)) return 'add9';
  if (/dim/.test(normSuffix)) return 'dim';
  if (/aug|\+/.test(normSuffix)) return 'aug';
  if (/(?:7|9|11|13)/.test(normSuffix)) return '7';
  if (/6/.test(normSuffix)) return '6';
  return '';
}

/** Maps a normalized ChordFlow suffix to the `@tombatossals/chords-db` suffix key. */
function toChordsDbSuffix(normSuffix: string, bass?: string): string[] {
  const candidates: string[] = [];
  if (bass) {
    const bassPitch = noteIndex(bass);
    const bassSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][bassPitch];
    if (normSuffix === '') candidates.push(`/${bassSharp}`);
    if (normSuffix === 'm') candidates.push(`m/${bassSharp}`);
  }
  const map: Record<string, string> = {
    '': 'major',
    m: 'minor',
    dim: 'dim',
    dim7: 'dim7',
    sus2: 'sus2',
    sus4: 'sus4',
    '7sus4': '7sus4',
    aug: 'aug',
    '6': '6',
    '69': '69',
    '7': '7',
    '7b5': '7b5',
    aug7: 'aug7',
    '9': '9',
    '9b5': '9b5',
    aug9: 'aug9',
    '7b9': '7b9',
    '7#9': '7#9',
    '11': '11',
    '9#11': '9#11',
    '13': '13',
    maj7: 'maj7',
    maj7b5: 'maj7b5',
    'maj7#5': 'maj7#5',
    maj9: 'maj9',
    maj11: 'maj11',
    maj13: 'maj13',
    m6: 'm6',
    m69: 'm69',
    m7: 'm7',
    m7b5: 'm7b5',
    m9: 'm9',
    m11: 'm11',
    mmaj7: 'mmaj7',
    add9: 'add9',
    madd9: 'madd9',
  };
  if (map[normSuffix]) candidates.push(map[normSuffix]);
  return candidates;
}

/** Converts a `@tombatossals/chords-db` relative position into an absolute-fret `ChordVoicing`. */
function convertDbPosition(chordName: string, pos: RawDbPosition, isCustom: boolean): ChordVoicing | null {
  const baseFret = Math.max(1, pos.baseFret || 1);
  const absFrets = pos.frets.map((f) => {
    if (f <= 0) return f; // -1 muted, 0 open
    return f + baseFret - 1;
  });
  return buildVoicing(chordName, absFrets, isCustom, {
    fingers: pos.fingers,
    baseFret,
  });
}

/**
 * Returns all playable voicings for `chordName` across the neck, deduplicated by fret signature.
 * Includes any current song-specific voicing first, followed by TrueFire chart shapes,
 * `@tombatossals/chords-db` (all-guitar-chords) positions, and CAGED movable shapes.
 */
export function getVoicingCandidates(
  chordName: string,
  songCustomVoicings?: Map<string, ChordVoicing>,
): VoicingCandidate[] {
  const bare = stripStars(chordName);
  const parts = parseChordName(bare);
  const out: VoicingCandidate[] = [];
  const seenFrets = new Set<string>();

  const pushCandidate = (
    voicing: ChordVoicing | null | undefined,
    label: string,
    source: VoicingCandidate['source'],
  ) => {
    if (!voicing) return;
    const sig = fretsToString(voicing.frets);
    if (seenFrets.has(sig)) return;
    seenFrets.add(sig);
    out.push({
      id: `${source}:${sig}`,
      label,
      source,
      voicing: { ...voicing, name: chordName },
    });
  };

  // 1. Song-defined custom voicing (if present)
  if (songCustomVoicings) {
    const exact = songCustomVoicings.get(chordName) ?? songCustomVoicings.get(bare);
    if (exact) {
      pushCandidate(exact, 'Current Song Voicing', 'song');
    }
  }

  if (!parts) return out;

  const rootPitch = noteIndex(parts.root);
  const canonicalRoot = PITCH_TO_CANONICAL_ROOT[rootPitch];
  const normSuffix = normalizeSuffix(parts.suffix);

  // 2. Slash chord curated shapes
  if (parts.bass) {
    const slashKey = `${canonicalRoot}${normSuffix}/${parts.bass}`;
    const directSlash = SLASH_CHORD_SHAPES[bare] ?? SLASH_CHORD_SHAPES[slashKey];
    if (directSlash) {
      for (const item of directSlash) {
        const frets = parseFretString(item.frets);
        if (frets) pushCandidate(buildVoicing(chordName, frets, false), item.label, 'truefire');
      }
    }
  }

  // 3. TrueFire "Ultimate Guitar Chord Chart" shapes
  const tfKey = `${canonicalRoot}|${normSuffix}`;
  const tfShapes = TRUEFIRE_CHART[tfKey];
  if (tfShapes) {
    for (const item of tfShapes) {
      const frets = parseFretString(item.frets);
      if (frets) pushCandidate(buildVoicing(chordName, frets, false), item.label, 'truefire');
    }
  }

  // 4. All-Guitar-Chords / @tombatossals/chords-db positions across the fretboard
  const dbKey = PITCH_TO_DB_KEY[rootPitch];
  const dbGroup = DB_CHORDS[dbKey] ?? [];
  const dbSuffixes = toChordsDbSuffix(normSuffix, parts.bass);
  for (const sfx of dbSuffixes) {
    const match = dbGroup.find((c) => c.suffix === sfx);
    if (!match) continue;
    match.positions.forEach((pos, idx) => {
      const v = convertDbPosition(chordName, pos, false);
      if (!v) return;
      const posLabel =
        v.baseFret === 1
          ? `Position ${idx + 1} (Open / 1fr)`
          : `Position ${idx + 1} (${v.baseFret}fr Neck)`;
      pushCandidate(v, posLabel, 'chords-db');
    });
  }

  // 5. Movable E-shape & A-shape CAGED generators as fallback/extra positions
  const tryMovable = (shape: number[] | undefined, openStringIdx: number, shapeLabel: string) => {
    if (!shape) return;
    let rootFret = (rootPitch - openStringIdx + 12) % 12;
    const minOffset = Math.min(...shape.filter((o) => o !== X));
    if (rootFret + minOffset < 0) rootFret += 12;
    if (rootFret === 0 && shape.some((o) => o === X) && openStringIdx === 4) rootFret += 12;
    const frets = shape.map((o) => (o === X ? -1 : rootFret + o));
    const v = buildVoicing(chordName, frets, false);
    if (v) {
      pushCandidate(
        v,
        `${shapeLabel} (${v.baseFret === 1 ? 'Open' : `${v.baseFret}fr`})`,
        'caged',
      );
    }
  };
  tryMovable(E_SHAPES[normSuffix], 4, 'E-Shape Barre');
  tryMovable(A_SHAPES[normSuffix], 9, 'A-Shape Barre');

  // 6. Graceful fallback for altered / compound extensions (e.g. Gsus#4/2, C#m7add11)
  if (out.length === 0) {
    const fb = fallbackSuffix(normSuffix);
    const fbTf = TRUEFIRE_CHART[`${canonicalRoot}|${fb}`];
    if (fbTf) {
      for (const item of fbTf) {
        const frets = parseFretString(item.frets);
        if (frets) pushCandidate(buildVoicing(chordName, frets, false), item.label, 'truefire');
      }
    }
    const fbDbSuffixes = toChordsDbSuffix(fb, parts.bass);
    for (const sfx of fbDbSuffixes) {
      const match = dbGroup.find((c) => c.suffix === sfx);
      if (!match) continue;
      match.positions.forEach((pos, idx) => {
        const v = convertDbPosition(chordName, pos, false);
        if (!v) return;
        const posLabel =
          v.baseFret === 1
            ? `Position ${idx + 1} (Open / 1fr)`
            : `Position ${idx + 1} (${v.baseFret}fr Neck)`;
        pushCandidate(v, posLabel, 'chords-db');
      });
    }
    tryMovable(E_SHAPES[fb], 4, 'E-Shape Barre');
    tryMovable(A_SHAPES[fb], 9, 'A-Shape Barre');
  }

  return out;
}

/** Looks up the primary standard voicing for a chord name (asterisks ignored). */
export function lookupStandardVoicing(name: string): ChordVoicing | undefined {
  const candidates = getVoicingCandidates(stripStars(name));
  if (candidates.length > 0) {
    return { ...candidates[0].voicing, name: stripStars(name), isCustom: false };
  }
  return undefined;
}

/**
 * Resolves the voicing for a chord token: custom definitions first (exact, then without
 * asterisk), then the TrueFire / chords-db standard library.
 */
export function resolveVoicing(
  chord: string,
  custom: Map<string, ChordVoicing>,
): ChordVoicing | undefined {
  const exact = custom.get(chord);
  if (exact) return exact;
  const bare = stripStars(chord);
  const bareMatch = custom.get(bare);
  if (bareMatch) return { ...bareMatch, name: chord };
  const lib = lookupStandardVoicing(bare);
  if (!lib) return undefined;
  return { ...lib, name: chord, isCustom: chord !== bare };
}
