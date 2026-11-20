import { GoogleGenAI, Type } from '@google/genai';
import {
  formatChordFlowDocument,
  normalizeSongBodyLines,
  resolveShapeKey,
} from './textCleaner';
import type { ImportedSongResponse } from './types';

export interface GeminiYouTubeChordLine {
  chords?: string;
  lyrics?: string;
}

export interface GeminiYouTubeSection {
  label: string;
  lines: GeminiYouTubeChordLine[];
}

export interface GeminiYouTubeChordSheet {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tuning?: string;
  sections?: GeminiYouTubeSection[];
  formattedBody?: string;
}

export class MissingGeminiApiKeyError extends Error {
  constructor(
    message = 'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to your environment variables (.env.local) to enable YouTube chord extraction.',
  ) {
    super(message);
    this.name = 'MissingGeminiApiKeyError';
  }
}

const YOUTUBE_EXTRACTION_PROMPT = `You are an expert guitarist and music transcriber for ChordFlow.
Analyze this YouTube music video (both audio and any visible guitar fretboard, capo position, or on-screen chord/lyric overlays) and transcribe a complete, accurate guitar chord and lyric sheet.

Follow these strict rules:
1. Identify the song's Title, Artist, Key (guitar shape key), Capo fret (0 to 11 if visible/audible, otherwise 0), and Tuning (default "E A D G B E").
2. Organize the song into clear sections such as "Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro".
3. For each line in a section:
   - Provide standard guitar chord symbols in \`chords\` (e.g. G, D/F#, Em7, Cadd9, Amaj7, Gsus4, F#m7) padded with spaces so each chord sits above the exact word/syllable where the chord changes in \`lyrics\`.
   - For instrumental lines (such as Intro/Outro/Solo), provide the chord progression in \`chords\` (e.g. "E9 (for 4 measures)" or "G  D/F#  Em7  C") and leave \`lyrics\` empty.
   - Never invent non-chord words on a chord line.`;

/**
 * Converts a structured `GeminiYouTubeChordSheet` payload into a normalized `ImportedSongResponse`
 * matching ChordFlow's canonical plain-text schema.
 */
export function formatGeminiYouTubeSheet(
  payload: GeminiYouTubeChordSheet,
  sourceUrl: string,
): ImportedSongResponse {
  const title = (payload.title || 'Untitled Song').trim();
  const artist = (payload.artist || 'Unknown Artist').trim();
  const rawCapo = typeof payload.capo === 'number' && Number.isFinite(payload.capo) ? payload.capo : 0;
  const capo = Math.max(0, Math.min(11, Math.round(rawCapo)));
  const tuning = (payload.tuning || 'E A D G B E').trim();

  const rawBodyLines: string[] = [];

  if (Array.isArray(payload.sections) && payload.sections.length > 0) {
    for (const sec of payload.sections) {
      const cleanLabel = (sec.label || 'Verse').replace(/^\[|\]$/g, '').trim() || 'Verse';
      rawBodyLines.push(`[${cleanLabel}]`);
      for (const line of sec.lines ?? []) {
        const chords = (line.chords ?? '').replace(/\s+$/, '');
        const lyrics = (line.lyrics ?? '').replace(/\s+$/, '');
        if (chords.trim()) rawBodyLines.push(chords);
        if (lyrics.trim()) rawBodyLines.push(lyrics);
      }
      rawBodyLines.push('');
    }
  } else if (payload.formattedBody?.trim()) {
    rawBodyLines.push(...payload.formattedBody.replace(/\r\n?/g, '\n').split('\n'));
  }

  const bodyLines = normalizeSongBodyLines(rawBodyLines);
  if (bodyLines.length === 0) {
    throw new Error('Gemini returned an empty chord sheet for this YouTube video.');
  }

  const shapeKey = resolveShapeKey(bodyLines, payload.key, capo) || 'G';
  const formattedText = formatChordFlowDocument(
    {
      title,
      artist,
      key: shapeKey,
      capo,
      tuning,
    },
    bodyLines,
  );

  return {
    title,
    artist,
    key: shapeKey,
    capo,
    tuning,
    formattedText,
    provider: 'youtube',
    sourceUrl,
  };
}

export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
] as const;

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('NOT_FOUND') ||
    msg.includes('404') ||
    msg.includes('is not found for API version') ||
    msg.includes('not supported for generateContent')
  );
}

/**
 * Calls `ai.models.generateContent` trying `GEMINI_MODEL` (if set) and then
 * `GEMINI_FALLBACK_MODELS` in order, falling back automatically on 404 / NOT_FOUND.
 */
export async function generateContentWithGeminiFallback(
  ai: GoogleGenAI,
  request: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
) {
  const envModel = process.env.GEMINI_MODEL?.trim();
  const candidates = Array.from(
    new Set([...(envModel ? [envModel] : []), ...GEMINI_FALLBACK_MODELS]),
  );

  let lastError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    try {
      return await ai.models.generateContent({
        ...request,
        model,
      });
    } catch (err) {
      lastError = err;
      if (i < candidates.length - 1 && isModelNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('No compatible Gemini model was available.');
}

/**
 * Extracts chords, lyrics, key, and capo from a YouTube video URL using Gemini
 * (`gemini-3.8-flash` by default, with automatic fallback).
 */
export async function extractYouTubeChordsWithGemini(
  youtubeUrl: string,
): Promise<ImportedSongResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingGeminiApiKeyError();
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await generateContentWithGeminiFallback(ai, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: youtubeUrl,
              mimeType: 'video/*',
            },
          },
          {
            text: YOUTUBE_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          artist: { type: Type.STRING },
          key: { type: Type.STRING },
          capo: { type: Type.INTEGER },
          tuning: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                lines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      chords: { type: Type.STRING },
                      lyrics: { type: Type.STRING },
                    },
                  },
                },
              },
              required: ['label', 'lines'],
            },
          },
          formattedBody: { type: Type.STRING },
        },
        required: ['title', 'artist', 'sections'],
      },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini did not return any transcription output for this YouTube video.');
  }

  let parsed: GeminiYouTubeChordSheet;
  try {
    parsed = JSON.parse(text) as GeminiYouTubeChordSheet;
  } catch {
    throw new Error('Failed to parse structured chord transcription from Gemini.');
  }

  return formatGeminiYouTubeSheet(parsed, youtubeUrl);
}
