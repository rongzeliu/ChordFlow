import { NextResponse } from 'next/server';
import { searchSongsAcrossProviders } from '@/lib/importers/search';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json(
      { error: 'Please provide a search query (?q=...).', results: [] },
      { status: 400 },
    );
  }

  try {
    const results = await searchSongsAcrossProviders(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Song search failed.';
    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
