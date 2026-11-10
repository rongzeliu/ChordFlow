import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  alignTwoLine,
  extractChordPositions,
  parseCustomVoicings,
  parseSong,
  parseSongBody,
  tokenizeChordPro,
} from './parser';
import { computeBaseFret, detectBarre, parseFretString } from './voicing';
import { buildFretboardGeometry, GRID } from './fretboard';
import { getVoicingCandidates } from './chordLibrary';
import { calculateCapoForKey, transposeChord, transposeKey } from './music';
import { planSheet } from './sheet';
import { SONG_TEMPLATES } from './templates';
import { parsePnwChordsHtml } from './importers/pnwChords';
import { cleanRawPastedText, detectSupportedImportUrl } from './importers/textCleaner';
import { parseUltimateGuitarHtml } from './importers/ultimateGuitar';
import { SongPDFDocument } from '@/components/pdf/SongPDFDocument';

describe('voicing & fret string parsing', () => {
  it('parses compact 6-char fret strings with muted/open strings', () => {
    expect(parseFretString('320033')).toEqual([3, 2, 0, 0, 3, 3]);
    expect(parseFretString('x32033')).toEqual([-1, 3, 2, 0, 3, 3]);
    expect(parseFretString('022000')).toEqual([0, 2, 2, 0, 0, 0]);
  });

  it('parses hyphen/space separated fret strings including double-digit frets', () => {
    expect(parseFretString('x-3-2-0-3-3')).toEqual([-1, 3, 2, 0, 3, 3]);
    expect(parseFretString('x 10 12 12 11 x')).toEqual([-1, 10, 12, 12, 11, -1]);
  });

  it('computes baseFret = 1 for open position and minFret when any fret > 4', () => {
    expect(computeBaseFret([3, 2, 0, 0, 3, 3])).toBe(1);
    expect(computeBaseFret([-1, 3, 5, 5, 4, 3])).toBe(3);
    expect(computeBaseFret([-1, 10, 12, 12, 11, -1])).toBe(10);
  });

  it('detects barre spans on movable shapes', () => {
    expect(detectBarre([1, 3, 3, 2, 1, 1])).toEqual({
      fromString: 0,
      toString: 5,
      fret: 1,
    });
    expect(detectBarre([-1, 3, 5, 5, 4, 3])).toEqual({
      fromString: 1,
      toString: 5,
      fret: 3,
    });
    expect(detectBarre([3, 2, 0, 0, 3, 3])).toBeUndefined();
  });
});

describe('parseCustomVoicings', () => {
  it('extracts UG-style header definitions with and without [ch] tags', () => {
    const raw = `
Title: Amazing Grace
[ch]G*[/ch]: 320033
D/F#* = 200233
Cadd9*   x-3-2-0-3-3
Em7*: 0 2 2 0 3 3
Cm7* = x 3 5 5 4 3
    `;
    const map = parseCustomVoicings(raw);
    expect(map.get('G*')?.frets).toEqual([3, 2, 0, 0, 3, 3]);
    expect(map.get('G*')?.rawName).toBe('G');
    expect(map.get('G*')?.isCustom).toBe(true);
    expect(map.get('D/F#*')?.frets).toEqual([2, 0, 0, 2, 3, 3]);
    expect(map.get('Cadd9*')?.frets).toEqual([-1, 3, 2, 0, 3, 3]);
    expect(map.get('Em7*')?.frets).toEqual([0, 2, 2, 0, 3, 3]);
    expect(map.get('Cm7*')?.baseFret).toBe(3);
    expect(map.get('Cm7*')?.barre).toEqual({ fromString: 1, toString: 5, fret: 3 });
  });

  it('extracts ChordPro {define: ...} directives with base-fret and fingers', () => {
    const raw = `{define: Asus2* base-fret 1 frets x 0 2 2 0 0 fingers 0 0 2 3 0 0}`;
    const map = parseCustomVoicings(raw);
    const v = map.get('Asus2*');
    expect(v).toBeDefined();
    expect(v?.frets).toEqual([-1, 0, 2, 2, 0, 0]);
    expect(v?.fingers).toEqual([0, 0, 2, 3, 0, 0]);
  });

  it('extracts vertical ASCII neck blocks into custom voicings', () => {
    const raw = `
   G*   D/F#*
e|--3-----3--|
B|--3-----3--|
G|--0-----2--|
D|--0-----0--|
A|--2-----0--|
E|--3-----2--|
    `;
    const map = parseCustomVoicings(raw);
    expect(map.get('G*')?.frets).toEqual([3, 2, 0, 0, 3, 3]);
    expect(map.get('D/F#*')?.frets).toEqual([2, 0, 0, 2, 3, 3]);
  });
});

describe('two-line & ChordPro tokenization', () => {
  it('slices two-line chord-over-lyric blocks at exact column indices', () => {
    const chordLine = 'G*                D/F#*         Em7*';
    const lyricLine = 'Amazing grace how sweet the sound';
    const voicings = parseCustomVoicings('G* = 320033\nD/F#* = 200233\nEm7* = 022033');
    const positions = extractChordPositions(chordLine)!;
    const tokens = alignTwoLine(positions, lyricLine, voicings);

    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toMatchObject({
      type: 'chord_with_lyric',
      chord: 'G*',
      text: 'Amazing grace how ',
    });
    expect(tokens[0].voicing?.frets).toEqual([3, 2, 0, 0, 3, 3]);
    expect(tokens[1]).toMatchObject({
      type: 'chord_with_lyric',
      chord: 'D/F#*',
      text: 'sweet the soun',
    });
    expect(tokens[2]).toMatchObject({
      type: 'chord_with_lyric',
      chord: 'Em7*',
      text: 'd',
    });
  });

  it('tokenizes bracketed ChordPro lines and attaches custom voicings', () => {
    const voicings = parseCustomVoicings('G* = 320033\nD/F#* = 200233');
    const tokens = tokenizeChordPro('[G*]Amazing grace how [D/F#*]sweet the sound', voicings);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].chord).toBe('G*');
    expect(tokens[0].text).toBe('Amazing grace how ');
    expect(tokens[0].voicing?.frets).toEqual([3, 2, 0, 0, 3, 3]);
    expect(tokens[1].chord).toBe('D/F#*');
    expect(tokens[1].text).toBe('sweet the sound');
  });

  it('parses full mixed song bodies excluding glossary headers', () => {
    const raw = `
Title: Reckless Study
Artist: Worship Collective
Key: G
Capo: 3
G* = 320033
Cadd9* = x32033

[Verse 1]
G*                       Cadd9*
Before I spoke a word, You were singing over me

[Chorus]
[Em7]Oh the overwhelming [Cadd9*]never-ending [G*]reckless love of God
    `;
    const song = parseSong(raw);
    expect(song.title).toBe('Reckless Study');
    expect(song.artist).toBe('Worship Collective');
    expect(song.key).toBe('G');
    expect(song.capo).toBe(3);
    expect(song.customVoicings.size).toBe(2);

    const body = parseSongBody(raw, song.customVoicings);
    const headers = body.filter((l) => l.type === 'section_header').map((l) => l.label);
    expect(headers).toEqual(['Verse 1', 'Chorus']);
    const lyricLines = body.filter((l) => l.type === 'lyric_line');
    expect(lyricLines).toHaveLength(2);
    expect(lyricLines[0].tokens[0].chord).toBe('G*');
    expect(lyricLines[1].tokens.map((t) => t.chord)).toEqual(['Em7', 'Cadd9*', 'G*']);
  });
});

describe('fretboard SVG geometry & music transposition', () => {
  it('places 6 strings at x=15..85 (dx=14) and 5 frets at y=25..105 (dy=20)', () => {
    const map = parseCustomVoicings('G* = 320033\nBm* = x24432');
    const gOpen = buildFretboardGeometry(map.get('G*')!);
    expect(gOpen.strings.map((s) => s.x1)).toEqual([15, 29, 43, 57, 71, 85]);
    expect(gOpen.frets.map((f) => f.y1)).toEqual([25, 45, 65, 85, 105]);
    expect(gOpen.nut).toBeDefined();
    expect(gOpen.markers.filter((m) => m.kind === 'open')).toHaveLength(2);
    expect(gOpen.markers.every((m) => m.y === GRID.markerY)).toBe(true);

    const gBarre = buildFretboardGeometry(map.get('Bm*')!);
    expect(gBarre.barre).toBeDefined();
    expect(gBarre.markers.filter((m) => m.kind === 'muted')).toHaveLength(1);
  });

  it('transposes chords and keys accurately for Capo / Concert Key display', () => {
    expect(transposeKey('G', 3)).toBe('Bb');
    expect(transposeChord('G*', 3, true)).toBe('Bb*');
    expect(transposeChord('D/F#*', 3, true)).toBe('F/A*');
    expect(calculateCapoForKey('G', 'Bb')).toBe(3);
    expect(calculateCapoForKey('G', 'G')).toBe(0);
    expect(calculateCapoForKey('E', 'F#')).toBe(2);
    expect(calculateCapoForKey('Cm', 'Ebm')).toBe(3);
  });

  it('returns multiple playable positions from TrueFire chart & chords-db for any chord', () => {
    const gCandidates = getVoicingCandidates('G*');
    expect(gCandidates.length).toBeGreaterThanOrEqual(4);
    expect(gCandidates.some((c) => c.source === 'truefire')).toBe(true);
    expect(gCandidates.some((c) => c.source === 'chords-db')).toBe(true);

    const abMaj7 = getVoicingCandidates('Abmaj7');
    expect(abMaj7.length).toBeGreaterThanOrEqual(2);
    expect(abMaj7[0].voicing.frets).toEqual([4, -1, 5, 5, 4, -1]);
  });

  it('enforces First-Occurrence-Only diagram rules in sheet planning', () => {
    const song = parseSong(`
G* = 320033
D/F#* = 200233
[Verse 1]
[G*]Amazing grace [D/F#*]how sweet [G*]the sound
    `);
    const plan = planSheet(song, {
      preset: 'first_occurrence_only',
      diagramScope: 'custom',
      displayMode: 'shapes',
      capo: 3,
    });
    const toks = plan.sections[0].lines[0].tokens;
    expect(toks.map((t) => t.showDiagram)).toEqual([true, true, false]);
    expect(plan.keyInfo.summary).toBe('Capo 3: G Shapes / Concert Key: Bb');
  });

  it('compiles all 4 layout presets into valid PDF buffers via @react-pdf/renderer', async () => {
    const song = parseSong(SONG_TEMPLATES[0].rawInput);
    const presets = [
      'inline_all',
      'first_occurrence_only',
      'top_glossary',
      'worship_two_column',
    ] as const;

    for (const preset of presets) {
      const element = React.createElement(SongPDFDocument, {
        song,
        preset,
        diagramSize: 'compact',
        diagramScope: 'custom',
        displayMode: 'shapes',
        scale: 1,
        pageSize: 'A4',
      }) as unknown as Parameters<typeof renderToBuffer>[0];
      const buf = await renderToBuffer(element);
      expect(buf.byteLength).toBeGreaterThan(1500);
      expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
  });
});

describe('URL chord importers (PNW Chords & Ultimate Guitar)', () => {
  it('validates supported PNW Chords and Ultimate Guitar URLs', () => {
    expect(
      detectSupportedImportUrl('https://pnwchords.com/jesus-be-the-name-elevation-worship/'),
    ).toEqual({
      url: 'https://pnwchords.com/jesus-be-the-name-elevation-worship/',
      provider: 'pnwchords',
    });
    expect(
      detectSupportedImportUrl('https://tabs.ultimate-guitar.com/tab/jeff-buckley/hallelujah-chords-198052'),
    ).toEqual({
      url: 'https://tabs.ultimate-guitar.com/tab/jeff-buckley/hallelujah-chords-198052',
      provider: 'ultimate-guitar',
    });
    expect(detectSupportedImportUrl('https://example.com/song')).toBeNull();
  });

  it('extracts PNW Chords title, artist, data-key, normalized section headers, and aligned chords', () => {
    const sampleHtml = `
      <html>
        <head><title>Jesus Be The Name - Elevation Worship - pnwchords</title></head>
        <body>
          <div>Font Print Dark view_moduleSplit AbAA#BbBCC#DbDD#EbEFF#GbGG#</div>
          <pre data-key="D">Verse1
D        A/C#      G
I could sing Your Name for all my life

Chorus
                                  Em
There's just something 'bout Your Name

Bridge2
             Em                 G
Jesus be the Name, Jesus be the Name</pre>
          <div class="lyrics-only">Duplicate lyrics tab ignored</div>
        </body>
      </html>
    `;
    const res = parsePnwChordsHtml(
      sampleHtml,
      'https://pnwchords.com/jesus-be-the-name-elevation-worship/',
    );
    expect(res.title).toBe('Jesus Be The Name');
    expect(res.artist).toBe('Elevation Worship');
    expect(res.key).toBe('D');
    expect(res.capo).toBe(0);
    expect(res.formattedText).toContain('Title: Jesus Be The Name');
    expect(res.formattedText).toContain('Artist: Elevation Worship');
    expect(res.formattedText).toContain('[Verse 1]');
    expect(res.formattedText).toContain('[Chorus]');
    expect(res.formattedText).toContain('[Bridge 2]');
    expect(res.formattedText).not.toContain('Duplicate lyrics tab');
  });

  it('extracts Ultimate Guitar .js-store JSON and strips [tab]/[ch] while preserving column alignment', () => {
    const storePayload = {
      store: {
        page: {
          data: {
            tab: {
              song_name: 'Hallelujah',
              artist_name: 'Jeff Buckley',
              tonality_name: 'Db',
            },
            tab_view: {
              meta: {
                tonality: 'Db',
                capo: 1,
                tuning: { value: 'E A D G B E' },
              },
              wiki_tab: {
                content:
                  '[Intro]\r\n[ch]C[/ch] [ch]Am[/ch] [ch]C[/ch] [ch]Am[/ch]\r\n\r\n[Verse 1]\r\n[tab]  [ch]C[/ch]                 [ch]Am[/ch]\r\nI heard there was a secret chord[/tab]',
              },
            },
          },
        },
      },
    };
    const encoded = JSON.stringify(storePayload)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    const html = `<div class="js-store" data-content="${encoded}"></div>`;

    const res = parseUltimateGuitarHtml(
      html,
      'https://tabs.ultimate-guitar.com/tab/jeff-buckley/hallelujah-chords-198052',
    );
    expect(res.title).toBe('Hallelujah');
    expect(res.artist).toBe('Jeff Buckley');
    expect(res.key).toBe('C'); // Shape key C + Capo 1 -> Concert Key Db
    expect(res.capo).toBe(1);
    expect(res.formattedText).toContain('  C                 Am\nI heard there was a secret chord');

    const parsed = parseSong(res.formattedText);
    const plan = planSheet(parsed, {
      preset: 'first_occurrence_only',
      diagramScope: 'all',
      displayMode: 'shapes',
      capo: res.capo ?? 0,
    });
    expect(plan.keyInfo.summary).toBe('Capo 1: C Shapes / Concert Key: Db');
  });

  it('cleans raw copy-pasted PNW Chords text with UI noise and unbracketed section labels', () => {
    const rawPaste = `Jesus Be The Name - Elevation Worship - pnwchords
Font Print Dark
view_moduleSplit
AbAA#BbBCC#DbDD#EbEFF#GbGG#
🎵 Simple🎶 Advanced
Verse1
D        A/C#      G
I could sing Your Name for all my life
Leave a Reply
Your email address will not be published.`;

    const cleaned = cleanRawPastedText(rawPaste);
    expect(cleaned.title).toBe('Jesus Be The Name');
    expect(cleaned.artist).toBe('Elevation Worship');
    expect(cleaned.formattedText).toContain('[Verse 1]');
    expect(cleaned.formattedText).not.toContain('AbAA#Bb');
    expect(cleaned.formattedText).not.toContain('Leave a Reply');
  });
});
