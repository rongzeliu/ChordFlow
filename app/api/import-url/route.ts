import { NextResponse } from 'next/server';
import { parsePnwChordsHtml } from '@/lib/importers/pnwChords';
import { detectSupportedImportUrl } from '@/lib/importers/textCleaner';
import { parseUltimateGuitarHtml } from '@/lib/importers/ultimateGuitar';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const rawUrl = body.url?.trim() ?? '';

    if (!rawUrl) {
      return NextResponse.json(
        { error: 'Please enter a PNW Chords or Ultimate Guitar song URL.' },
        { status: 400 },
      );
    }

    const detected = detectSupportedImportUrl(rawUrl);
    if (!detected) {
      return NextResponse.json(
        {
          error:
            'Unsupported URL. Please enter a valid http(s) link from pnwchords.com or ultimate-guitar.com.',
        },
        { status: 400 },
      );
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
    const imported =
      detected.provider === 'pnwchords'
        ? parsePnwChordsHtml(html, detected.url)
        : parseUltimateGuitarHtml(html, detected.url);

    return NextResponse.json(imported);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to fetch or parse the provided chord URL.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
