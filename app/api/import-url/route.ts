import { NextResponse } from 'next/server';
import { parsePnwChordsHtml } from '@/lib/importers/pnwChords';
import {
  generateSongChordsWithGemini,
  resolveCatalogSongChordSheet,
} from '@/lib/importers/search';
import { detectSupportedImportUrl } from '@/lib/importers/textCleaner';
import { parseUltimateGuitarHtml } from '@/lib/importers/ultimateGuitar';
import { parseWorshipTogetherHtml } from '@/lib/importers/worshipTogether';
import {
  extractYouTubeChordsWithGemini,
  MissingGeminiApiKeyError,
} from '@/lib/importers/youtube';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      title?: string;
      artist?: string;
    };
    const rawUrl = body.url?.trim() ?? '';
    const title = body.title?.trim() ?? '';
    const artist = body.artist?.trim() ?? '';

    // Two-stage catalog selection: resolve by canonical Song Title + Artist (and optional URL)
    if (title && artist) {
      const resolved = await resolveCatalogSongChordSheet({
        title,
        artist,
        url: rawUrl || undefined,
      });
      return NextResponse.json(resolved);
    }

    if (!rawUrl) {
      return NextResponse.json(
        {
          error:
            'Please enter a song title/artist or paste a YouTube, PNW Chords, Ultimate Guitar, or WorshipTogether URL.',
        },
        { status: 400 },
      );
    }

    const detected = detectSupportedImportUrl(rawUrl);
    if (!detected) {
      return NextResponse.json(
        {
          error:
            'Unsupported URL. Please enter a valid http(s) link from youtube.com, youtu.be, pnwchords.com, ultimate-guitar.com, or worshiptogether.com.',
        },
        { status: 400 },
      );
    }

    if (detected.provider === 'youtube') {
      const imported = await extractYouTubeChordsWithGemini(detected.url);
      return NextResponse.json(imported);
    }

    const response = await fetch(detected.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });

    if (response.status === 403 || response.status === 429) {
      return NextResponse.json(
        {
          error:
            'The site blocked automated server fetching (anti-bot protection). Copy the page text (Cmd+A / Ctrl+A → Copy), paste it into the Song box below, and click "Clean & Format Pasted Text".',
          code: 'ANTI_BOT_BLOCKED',
        },
        { status: 403 },
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Could not load that song page (HTTP ${response.status}). Check that the URL points to a valid public chord sheet.`,
        },
        { status: response.status },
      );
    }

    const html = await response.text();
    try {
      const imported =
        detected.provider === 'pnwchords'
          ? parsePnwChordsHtml(html, detected.url)
          : detected.provider === 'worshiptogether'
            ? parseWorshipTogetherHtml(html, detected.url)
            : parseUltimateGuitarHtml(html, detected.url);

      return NextResponse.json(imported);
    } catch (parseErr) {
      // If WorshipTogether page requires login and GEMINI_API_KEY is available, infer title from URL slug
      if (detected.provider === 'worshiptogether' && process.env.GEMINI_API_KEY?.trim()) {
        const slug = new URL(detected.url).pathname
          .split('/')
          .filter(Boolean)
          .pop()
          ?.replace(/[-_]+/g, ' ')
          .trim();
        if (slug) {
          const generated = await generateSongChordsWithGemini(slug, 'Worship Together', detected.url);
          return NextResponse.json(generated);
        }
      }
      throw parseErr;
    }
  } catch (err) {
    if (err instanceof MissingGeminiApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: 'MISSING_GEMINI_API_KEY' },
        { status: 503 },
      );
    }
    const message =
      err instanceof Error ? err.message : 'Unable to fetch or parse the provided chord URL.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
