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
import { getVoicingCandidates, resolveVoicing } from './chordLibrary';
import { calculateCapoForKey, isChord, parseChordName, transposeChord, transposeKey } from './music';
import { planSheet } from './sheet';
import { SONG_TEMPLATES } from './templates';
import { parsePnwChordsHtml } from './importers/pnwChords';
import {
  cleanCatalogTitle,
  parsePnwChordsWpSearchResults,
  parseUltimateGuitarSearchHtml,
  parseYouTubeSearchResultsHtml,
  primaryCatalogArtist,
  rankAndDedupeSearchResults,
  rankUltimateGuitarCandidates,
} from './importers/search';
import {
  parseItunesTracksResponse,
  parseSpotifyTracksResponse,
} from './importers/spotify';
import { cleanRawPastedText, detectSupportedImportUrl } from './importers/textCleaner';
import { parseUltimateGuitarHtml } from './importers/ultimateGuitar';
import { parseWorshipTogetherHtml } from './importers/worshipTogether';
import {
  extractYouTubeChordsWithGemini,
  formatGeminiYouTubeSheet,
  MissingGeminiApiKeyError,
} from './importers/youtube';
import { formatFirebaseAuthError } from './authStore';
import { isFirebaseConfigured } from './firebase';
import {
  createForkedSongCopy,
  deserializeFirestoreSong,
  mergeSongsByRecency,
  planSignInLibrary,
  serializePublicSongForFirestore,
  serializeSongForFirestore,
  subscribeToPublicSongs,
} from './firestoreSongs';
import { getStarterSongs } from './seedSongs';
import { SongPDFDocument } from '@/components/pdf/SongPDFDocument';

describe('voicing & fret string parsing', () => {
  it('parses compact 6-char fret strings with muted/open strings', () => {
    expect(parseFretString('320033')).toEqual([3, 2, 0, 0, 3, 3]);
    expect(parseFretString('x32033')).toEqual([-1, 3, 2, 0, 3, 3]);
    expect(parseFretString('022000')).toEqual([0, 2, 2, 0, 0, 0]);
  });

  it('parses hyphen/space separated and compact multi-digit fret strings including double-digit frets', () => {
    expect(parseFretString('x-3-2-0-3-3')).toEqual([-1, 3, 2, 0, 3, 3]);
    expect(parseFretString('x 10 12 12 11 x')).toEqual([-1, 10, 12, 12, 11, -1]);
    expect(parseFretString('101210111010')).toEqual([10, 12, 10, 11, 10, 10]);
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

describe('URL chord importers (YouTube, PNW Chords & Ultimate Guitar)', () => {
  it('validates and normalizes supported YouTube, PNW Chords, and Ultimate Guitar URLs', () => {
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
    expect(
      detectSupportedImportUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
    });
    expect(
      detectSupportedImportUrl('https://youtu.be/dQw4w9WgXcQ?si=abc123'),
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
    });
    expect(
      detectSupportedImportUrl('https://youtube.com/shorts/dQw4w9WgXcQ'),
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
    });
    expect(
      detectSupportedImportUrl(
        'https://www.worshiptogether.com/songs/build-my-life-pat-barrett/',
      ),
    ).toEqual({
      url: 'https://www.worshiptogether.com/songs/build-my-life-pat-barrett/',
      provider: 'worshiptogether',
    });
    expect(detectSupportedImportUrl('https://www.youtube.com/watch')).toBeNull();
    expect(detectSupportedImportUrl('https://example.com/song')).toBeNull();
  });

  it('extracts WorshipTogether HTML chord-pro segments and normalizesSongSearchResult ranking', () => {
    const wtHtml = `
      <html>
        <head><title>Build My Life - Pat Barrett - Worship Together</title></head>
        <body>
          <h1>Build My Life - Pat Barrett</h1>
          <div>Original Key: G</div>
          <div class="chord-pro-disp">
            <div class="chord-pro-line">
              <div class="chord-pro-segment">
                <div class="chord-pro-note">G</div>
                <div class="chord-pro-lyric">Worthy of every </div>
              </div>
              <div class="chord-pro-segment">
                <div class="chord-pro-note">C2</div>
                <div class="chord-pro-lyric">song we could ever sing</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    const wtRes = parseWorshipTogetherHtml(
      wtHtml,
      'https://www.worshiptogether.com/songs/build-my-life-pat-barrett/',
    );
    expect(wtRes.provider).toBe('worshiptogether');
    expect(wtRes.title).toBe('Build My Life');
    expect(wtRes.artist).toBe('Pat Barrett');
    expect(wtRes.key).toBe('G');
    expect(wtRes.formattedText).toContain('[G]Worthy of every [C2]song we could ever sing');

    const pnwPosts = [
      {
        link: 'https://pnwchords.com/build-my-life-housefires/',
        title: { rendered: 'Build My Life &#8211; Housefires - pnwchords' },
      },
    ];
    const pnwResults = parsePnwChordsWpSearchResults(pnwPosts);
    expect(pnwResults).toEqual([
      {
        title: 'Build My Life',
        artist: 'Housefires',
        url: 'https://pnwchords.com/build-my-life-housefires/',
        provider: 'pnwchords',
      },
    ]);

    const ytHtml =
      '{"videoRenderer":{"videoId":"abc123XYZ89","title":{"runs":[{"text":"Build My Life Guitar Tutorial"}]},"ownerText":{"runs":[{"text":"Worship Tutorials"}]}}}';
    const ytResults = parseYouTubeSearchResultsHtml(ytHtml);
    expect(ytResults[0]).toMatchObject({
      title: 'Build My Life Guitar Tutorial',
      artist: 'Worship Tutorials',
      url: 'https://www.youtube.com/watch?v=abc123XYZ89',
      provider: 'youtube',
    });

    const ranked = rankAndDedupeSearchResults(
      [...ytResults, ...pnwResults, ...pnwResults],
      'Build My Life Housefires',
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0].provider).toBe('pnwchords');
  });

  it('formats structured Gemini YouTube chord & lyric output into a valid ChordFlow song', async () => {
    const geminiOutput = {
      title: "St. Patrick's Day",
      artist: 'John Mayer',
      key: 'E',
      capo: 0,
      tuning: 'E A D G B E',
      sections: [
        {
          label: 'Intro',
          lines: [{ chords: 'E9 (for 4 measures)', lyrics: '' }],
        },
        {
          label: 'Verse 1',
          lines: [
            {
              chords: 'E9                        A2',
              lyrics: 'Here comes the cold, break out the winter clothes',
            },
          ],
        },
      ],
    };

    const res = formatGeminiYouTubeSheet(
      geminiOutput,
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(res.provider).toBe('youtube');
    expect(res.title).toBe("St. Patrick's Day");
    expect(res.artist).toBe('John Mayer');
    expect(res.key).toBe('E');
    expect(res.capo).toBe(0);
    expect(res.formattedText).toContain('[Intro]');
    expect(res.formattedText).toContain('E9 (for 4 measures)');
    expect(res.formattedText).toContain('[Verse 1]');

    const parsed = parseSong(res.formattedText);
    expect(parsed.title).toBe("St. Patrick's Day");
    expect(parsed.lines.some((l) => l.type === 'section_header' && l.label === 'Intro')).toBe(true);
    expect(parsed.lines.some((l) => l.tokens.some((t) => t.chord === 'E9'))).toBe(true);

    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(
        extractYouTubeChordsWithGemini('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).rejects.toBeInstanceOf(MissingGeminiApiKeyError);
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
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

describe('inline section prefixes, hyphenated syllables, and altered slash-extension chords', () => {
  it('parses [Intro] E9 (for 4 measures) into an Intro header plus clickable E9 chord and inline note', () => {
    const raw = `
Title: St. Patrick's Day
[Intro] E9 (for 4 measures)
A2 - B4 - E9 (2x)
    `;
    const song = parseSong(raw);
    expect(song.lines[0]).toMatchObject({ type: 'section_header', label: 'Intro' });

    const introLine = song.lines[1];
    expect(introLine.type).toBe('lyric_line');
    expect(introLine.tokens[0]).toMatchObject({ type: 'chord', chord: 'E9' });
    expect(introLine.tokens[0].voicing).toBeDefined();
    expect(introLine.tokens[1]).toMatchObject({ type: 'lyric', text: '(for 4 measures)' });

    const outroLine = song.lines[2];
    expect(outroLine.tokens.filter((t) => t.chord).map((t) => t.chord)).toEqual(['A2', 'B4', 'E9']);
    expect(outroLine.tokens.find((t) => t.text === '(2x)')).toBeDefined();
  });

  it('recognizes, transposes, and resolves voicings for Gsus#4/2, G2, D7/F#, and E7/G#', () => {
    expect(isChord('Gsus#4/2')).toBe(true);
    expect(isChord('G2')).toBe(true);
    expect(isChord('Gsus4#11')).toBe(true);
    expect(isChord('D7/F#')).toBe(true);
    expect(isChord('E7/G#')).toBe(true);

    expect(parseChordName('Gsus#4/2')).toEqual({
      root: 'G',
      suffix: 'sus#4/2',
      bass: undefined,
      stars: '',
    });
    expect(parseChordName('D7/F#')).toEqual({
      root: 'D',
      suffix: '7',
      bass: 'F#',
      stars: '',
    });

    expect(transposeChord('Gsus#4/2', 2)).toBe('Asus#4/2');
    expect(transposeChord('G2', 2)).toBe('A2');
    expect(transposeChord('D7/F#', 2)).toBe('E7/G#');

    const line1 = extractChordPositions('G#m7b5 Amaj7 D7/F# Gsus#4/2 G2');
    expect(line1?.map((c) => c.chord)).toEqual(['G#m7b5', 'Amaj7', 'D7/F#', 'Gsus#4/2', 'G2']);

    const line2 = extractChordPositions('E7/G# Amaj7 D7/F# Gsus#4/2');
    expect(line2?.map((c) => c.chord)).toEqual(['E7/G#', 'Amaj7', 'D7/F#', 'Gsus#4/2']);

    const empty = new Map();
    for (const name of ['G#m7b5', 'Amaj7', 'D7/F#', 'Gsus#4/2', 'G2', 'E7/G#']) {
      expect(resolveVoicing(name, empty)).toBeDefined();
    }

    // Also extracts custom header glossary definitions for Gsus#4/2 (and aliases like Gsus4/2)
    const customMap = parseCustomVoicings('G#m7b5 = 4x443x\nGsus#4/2 = 3x0202\nG2 = 3x020x');
    expect(customMap.get('Gsus#4/2')?.frets).toEqual([3, -1, 0, 2, 0, 2]);
    expect(customMap.get('Gsus#4/2')?.isCustom).toBe(true);
    expect(resolveVoicing('Gsus#4/2', customMap)?.isCustom).toBe(true);

    const aliasMap = parseCustomVoicings('Gsus4/2: 3x0202');
    expect(resolveVoicing('Gsus#4/2', aliasMap)?.frets).toEqual([3, -1, 0, 2, 0, 2]);
    expect(resolveVoicing('Gsus#4/2', aliasMap)?.isCustom).toBe(true);
  });

  it('joins mid-word hyphenated syllables cleanly under chord diagrams in SheetPreview plan and PDF', async () => {
    const raw = `
Title: Hyphen & Extension Check
[Intro] E9 (for 4 measures)

[Verse 1]
        G#m7b5  Amaj7   D7/F#  Gsus#4/2  G2
No way  No-     vem-    ber    will      see our goodbye
F#m7    E/G#    Em7     D/F#    A2
Feb-ru- ar- y,  won't you be my Valentine?
    `;
    const song = parseSong(raw);
    const plan = planSheet(song, {
      preset: 'inline_all',
      diagramScope: 'all',
      displayMode: 'shapes',
      capo: 0,
    });

    expect(plan.sections[0].label).toBe('Intro');
    expect(plan.sections[0].lines[0].tokens[0].chord).toBe('E9');
    expect(plan.sections[0].lines[0].tokens[1].text).toBe('(for 4 measures)');

    const verse = plan.sections[1];
    expect(verse.lines[0].text).toBe('No way No-vem-ber will see our goodbye');
    const novToken = verse.lines[0].tokens.find((t) => t.text.includes('No-vem-ber'));
    expect(novToken?.chords?.map((c) => c.chord)).toEqual(['G#m7b5', 'Amaj7', 'D7/F#']);
    expect(novToken?.chords?.every((c) => c.showDiagram && !!c.voicing)).toBe(true);

    expect(verse.lines[1].text).toBe("Feb-ru-ar-y, won't you be my Valentine?");
    const febToken = verse.lines[1].tokens.find((t) => t.text.includes('Feb-ru-ar-y,'));
    expect(febToken?.chords?.map((c) => c.chord)).toEqual(['F#m7', 'E/G#']);

    const element = React.createElement(SongPDFDocument, {
      song,
      preset: 'inline_all',
      diagramSize: 'standard',
      diagramScope: 'all',
      displayMode: 'shapes',
      scale: 1,
      pageSize: 'A4',
      gridSize: 20,
      showGrid: true,
      chordGridOffsets: { '1:0:1:0': 2 },
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);
    expect(buf.byteLength).toBeGreaterThan(1500);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('repairs un-hyphenated mid-word splits in planSheet so words stay whole under chords', () => {
    const raw = `
G#m7b5      Amaj7   D7/F#   Gsus#4/2  G2
Who         knows   what will be?
E7/G#       Amaj7  D7/F#        Gsus#4/2
But I'll    make you this guarantee
    `;
    const song = parseSong(raw);
    const plan = planSheet(song, {
      preset: 'inline_all',
      diagramScope: 'all',
      displayMode: 'shapes',
      capo: 0,
    });
    const lines = plan.sections[0].lines;
    expect(lines[0].tokens.map((t) => t.text)).toEqual([
      'Who ',
      'knows ',
      'what ',
      'will be?',
      '',
    ]);
    expect(lines[1].tokens.map((t) => t.text)).toEqual([
      "But I'll ",
      'make ',
      'you this ',
      'guarantee',
    ]);
  });
});

describe('Firebase Auth & Firestore song persistence helpers', () => {
  it('degrades gracefully when Firebase env vars are unset and maps auth error codes cleanly', () => {
    expect(typeof isFirebaseConfigured()).toBe('boolean');
    expect(formatFirebaseAuthError({ code: 'auth/invalid-credential' })).toContain(
      'Invalid email or password',
    );
    expect(formatFirebaseAuthError({ code: 'auth/email-already-in-use' })).toContain(
      'already exists',
    );
    expect(formatFirebaseAuthError({ code: 'auth/weak-password' })).toContain('6 characters');
  });

  it('serializes, deserializes, and merges SavedSong entries by recency without losing grid or voicing state', () => {
    const sampleSong = {
      id: 'song-123',
      title: "St. Patrick's Day",
      artist: 'John Mayer',
      lastPlayedKey: 'E',
      shapeKey: 'E',
      capo: 0,
      rawInput: '[Intro] E9 (for 4 measures)',
      preset: 'inline_all' as const,
      diagramSize: 'standard' as const,
      diagramScope: 'all' as const,
      displayMode: 'shapes' as const,
      scale: 1.0,
      pageSize: 'A4' as const,
      customOverrides: { 'Gsus#4/2': '3x0202' },
      gridSize: 28,
      showGrid: true,
      chordGridOffsets: { '0:0:0:0': 2 },
      updatedAt: '2026-11-16T10:00:00.000Z',
    };

    const serialized = serializeSongForFirestore(sampleSong);
    const roundTripped = deserializeFirestoreSong('song-123', serialized);
    expect(roundTripped).toEqual(sampleSong);

    const olderCloud = {
      ...sampleSong,
      title: 'Old Title',
      updatedAt: '2026-11-15T10:00:00.000Z',
    };
    const newerCloud = {
      ...sampleSong,
      id: 'song-456',
      title: 'Cloud Song',
      updatedAt: '2026-11-16T12:00:00.000Z',
    };

    const merged = mergeSongsByRecency([sampleSong], [olderCloud, newerCloud]);
    expect(merged.map((s) => s.id)).toEqual(['song-456', 'song-123']);
    expect(merged[1].title).toBe("St. Patrick's Day");
  });

  it('provisions the two starter template songs for new accounts and isolates libraries across account switches', () => {
    const starterSongs = getStarterSongs();
    expect(starterSongs.map((s) => s.id)).toEqual(['seed-amazing-grace', 'seed-build-my-life']);

    // Brand-new account with empty cloud library receives both starter template songs
    const newAccountPlan = planSignInLibrary({
      uid: 'user-new',
      previousUid: null,
      localSongs: starterSongs,
      cloudSongs: [],
    });
    expect(newAccountPlan.library.map((s) => s.id).sort()).toEqual([
      'seed-amazing-grace',
      'seed-build-my-life',
    ]);
    expect(newAccountPlan.toUpload.map((s) => s.id).sort()).toEqual([
      'seed-amazing-grace',
      'seed-build-my-life',
    ]);

    // Switching from user-a to user-b never uploads user-a's custom songs into user-b's account
    const userACustomSong = {
      ...starterSongs[0],
      id: 'song-user-a-private',
      title: "User A's Private Song",
      updatedAt: '2026-11-17T10:00:00.000Z',
    };
    const switchedAccountPlan = planSignInLibrary({
      uid: 'user-b',
      previousUid: 'user-a',
      localSongs: [userACustomSong, ...starterSongs],
      cloudSongs: [],
    });
    expect(switchedAccountPlan.library.some((s) => s.id === 'song-user-a-private')).toBe(false);
    expect(switchedAccountPlan.library.map((s) => s.id).sort()).toEqual([
      'seed-amazing-grace',
      'seed-build-my-life',
    ]);
  });

  it('serializes publicSongs documents and forks public songs with a fresh private ID and isPublic: false', () => {
    const starter = getStarterSongs()[0];
    const pubPayload = serializePublicSongForFirestore(
      'uid-author-1',
      'Robin Liu',
      starter,
      '2026-11-18T12:00:00.000Z',
    );
    expect(pubPayload.isPublic).toBe(true);
    expect(pubPayload.authorUid).toBe('uid-author-1');
    expect(pubPayload.authorName).toBe('Robin Liu');
    expect(pubPayload.publishedAt).toBe('2026-11-18T12:00:00.000Z');

    const publicSong = deserializeFirestoreSong(starter.id, pubPayload)!;
    expect(publicSong).not.toBeNull();
    expect(publicSong.isPublic).toBe(true);
    expect(publicSong.authorUid).toBe('uid-author-1');
    expect(publicSong.authorName).toBe('Robin Liu');

    const forked = createForkedSongCopy(publicSong);
    expect(forked.id).not.toBe(publicSong.id);
    expect(forked.isPublic).toBe(false);
    expect(forked.authorUid).toBeUndefined();
    expect(forked.authorName).toBeUndefined();
    expect(forked.publishedAt).toBeUndefined();
    expect(forked.title).toBe(publicSong.title);
    expect(forked.rawInput).toBe(publicSong.rawInput);

    // Graceful no-op subscription when Firestore client is not initialized in Node test env
    let initialPublicList: unknown[] | null = null;
    const unsub = subscribeToPublicSongs((songs) => {
      initialPublicList = songs;
    });
    expect(initialPublicList).toEqual([]);
    unsub();
  });

  it('normalizes Spotify & iTunes track catalog results and merges catalog artwork with direct PNW Chords URLs', () => {
    const spotifyTracks = parseSpotifyTracksResponse({
      tracks: {
        items: [
          {
            id: 'sp-1',
            name: 'Build My Life',
            duration_ms: 356000,
            external_urls: { spotify: 'https://open.spotify.com/track/sp-1' },
            artists: [{ name: 'Pat Barrett' }],
            album: {
              name: 'Pat Barrett',
              images: [
                { url: 'https://i.scdn.co/image/large.jpg', width: 640, height: 640 },
                { url: 'https://i.scdn.co/image/small.jpg', width: 64, height: 64 },
              ],
            },
          },
          // Duplicate title + artist row should be deduplicated
          {
            id: 'sp-1-dup',
            name: 'Build My Life',
            duration_ms: 356000,
            external_urls: { spotify: 'https://open.spotify.com/track/sp-1-dup' },
            artists: [{ name: 'Pat Barrett' }],
            album: { name: 'Live', images: [] },
          },
        ],
      },
    });

    expect(spotifyTracks).toHaveLength(1);
    expect(spotifyTracks[0]).toEqual({
      id: 'sp-1',
      title: 'Build My Life',
      artist: 'Pat Barrett',
      album: 'Pat Barrett',
      artworkUrl: 'https://i.scdn.co/image/small.jpg',
      durationMs: 356000,
      url: 'https://open.spotify.com/track/sp-1',
      provider: 'spotify',
    });

    const itunesTracks = parseItunesTracksResponse({
      results: [
        {
          trackId: 99123,
          trackName: 'Goodness of God (Live)',
          artistName: 'Bethel Music & Jenn Johnson',
          collectionName: 'Victory (Live)',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
          trackTimeMillis: 296000,
          trackViewUrl: 'https://music.apple.com/us/album/goodness-of-god/99123',
        },
      ],
    });

    expect(itunesTracks).toHaveLength(1);
    expect(itunesTracks[0]).toMatchObject({
      id: '99123',
      title: 'Goodness of God (Live)',
      artist: 'Bethel Music & Jenn Johnson',
      album: 'Victory (Live)',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
      provider: 'itunes',
    });

    // Merging a Spotify catalog match with an exact PNW Chords match keeps artwork + album while upgrading to direct chord URL
    const merged = rankAndDedupeSearchResults(
      [
        spotifyTracks[0],
        {
          title: 'Build My Life',
          artist: 'Pat Barrett',
          url: 'https://www.pnwchords.com/build-my-life-pat-barrett/',
          provider: 'pnwchords',
        },
      ],
      'Build My Life Pat Barrett',
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].provider).toBe('pnwchords');
    expect(merged[0].url).toBe('https://www.pnwchords.com/build-my-life-pat-barrett/');
    expect(merged[0].artworkUrl).toBe('https://i.scdn.co/image/small.jpg');
    expect(merged[0].album).toBe('Pat Barrett');
  });

  it('parses Ultimate Guitar search results and ranks the best free Chords match for a catalog track', () => {
    expect(cleanCatalogTitle('Goodness of God (Live) - Remastered 2021')).toBe('Goodness of God');
    expect(cleanCatalogTitle('Firm Foundation (He Won’t) feat. Chandler Moore')).toBe(
      'Firm Foundation',
    );
    expect(primaryCatalogArtist('Bethel Music & Jenn Johnson')).toBe('Bethel Music');
    expect(primaryCatalogArtist('Maverick City Music, Elevation Worship')).toBe(
      'Maverick City Music',
    );

    const results = [
      {
        song_name: 'Build My Life',
        artist_name: 'Pat Barrett',
        marketing_type: 'TabPro',
        tab_url: 'https://www.ultimate-guitar.com/pro/?tab_id=5064349',
        votes: 99,
        rating: 4.7,
      },
      {
        song_name: 'Build My Life',
        artist_name: 'Housefires',
        type: 'Chords',
        tab_url: 'https://tabs.ultimate-guitar.com/tab/housefires/build-my-life-chords-1857672',
        votes: 3123,
        rating: 4.87,
      },
      {
        song_name: 'Build My Life',
        artist_name: 'Pat Barrett',
        type: 'Chords',
        tab_url: 'https://tabs.ultimate-guitar.com/tab/pat-barrett/build-my-life-chords-2431895',
        votes: 934,
        rating: 4.89,
      },
      {
        song_name: 'Build My Life',
        artist_name: 'Pat Barrett',
        type: 'Official',
        tab_url: 'https://tabs.ultimate-guitar.com/tab/pat-barrett/build-my-life-official-5064349',
        votes: 99,
        rating: 4.7,
      },
      {
        song_name: 'Another Song',
        artist_name: 'Pat Barrett',
        type: 'Chords',
        tab_url: 'https://tabs.ultimate-guitar.com/tab/pat-barrett/another-song-chords-1',
        votes: 5000,
        rating: 5,
      },
    ];
    const encoded = JSON.stringify({ store: { page: { data: { results } } } }).replace(
      /"/g,
      '&quot;',
    );
    const html = `<html><body><div class="js-store" data-content="${encoded}"></div></body></html>`;

    const candidates = parseUltimateGuitarSearchHtml(html);
    // Only free "Chords" entries are kept (no Pro / Official)
    expect(candidates.map((c) => c.url)).toEqual([
      'https://tabs.ultimate-guitar.com/tab/housefires/build-my-life-chords-1857672',
      'https://tabs.ultimate-guitar.com/tab/pat-barrett/build-my-life-chords-2431895',
      'https://tabs.ultimate-guitar.com/tab/pat-barrett/another-song-chords-1',
    ]);

    // Artist match outranks higher vote counts; non-matching titles are dropped
    const ranked = rankUltimateGuitarCandidates(candidates, 'Build My Life (Live)', 'Pat Barrett');
    expect(ranked.map((c) => c.artist)).toEqual(['Pat Barrett', 'Housefires']);
    expect(ranked[0].url).toBe(
      'https://tabs.ultimate-guitar.com/tab/pat-barrett/build-my-life-chords-2431895',
    );
  });
});
