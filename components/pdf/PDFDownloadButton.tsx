'use client';

import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Download, Loader2 } from 'lucide-react';
import { SongPDFDocument, type SongPDFDocumentProps } from './SongPDFDocument';

export function PDFDownloadButton(props: SongPDFDocumentProps) {
  const [compiling, setCompiling] = useState(false);

  const handleDownload = async () => {
    try {
      setCompiling(true);
      const blob = await pdf(<SongPDFDocument {...props} />).toBlob();
      const url = URL.createObjectURL(blob);
      const safeTitle =
        (props.song.title || 'chordflow-sheet')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'chordflow-sheet';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}-${props.preset}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setCompiling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={compiling}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-stone-900 px-4 text-xs font-medium text-white shadow-2xs transition hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-wait disabled:opacity-60"
    >
      {compiling ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {compiling ? 'Exporting…' : 'Export PDF'}
    </button>
  );
}
