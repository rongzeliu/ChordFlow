import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChordFlow (FretCast) — Smart Chord Sheet & Inline Fretboard PDF Generator',
  description:
    'Ingests Ultimate Guitar plaintext and ChordPro sheets with custom voicings, rendering inline or top-anchored SVG fretboard diagrams and compiling print-calibrated PDFs.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
