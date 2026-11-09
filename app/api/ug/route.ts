import { NextResponse } from 'next/server';

/**
 * Stub API route for Ultimate Guitar URL ingestion (`window.UGAPP.store.page.data.tab_view`).
 * Direct client scraping is blocked by CORS/Cloudflare; pasteboard text/ChordPro is the primary flow.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const url = body.url?.trim() ?? '';

    if (!url) {
      return NextResponse.json(
        { error: 'Missing Ultimate Guitar URL.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        status: 'stub',
        url,
        message:
          'Direct Ultimate Guitar URL scraping is stubbed in local offline mode due to Cloudflare protection. Paste raw UG chord text (including [ch] tags or top glossary definitions) or ChordPro directly into the editor.',
      },
      { status: 501 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to process URL request.' },
      { status: 500 },
    );
  }
}
