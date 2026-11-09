# ChordFlow (FretCast)

**Smart Chord Sheet & Inline Fretboard PDF Generator for Rehearsal, Worship, and Study**

ChordFlow eliminates the friction of scrolling back and forth to a top chord glossary when playing songs with non-standard voicings (alternate tunings, open-drone worship shapes like `G*`, `Cadd9*`, `D/F#*`, slash chords, or up-the-neck shapes). Paste an Ultimate Guitar chord sheet or ChordPro file, choose a rehearsal layout preset, pick your desired concert key, and export a print-calibrated vector PDF.

---

## Key Features

### 1. Universal Chord Sheet & Voicing Parser (`lib/parser.ts`)
- **Custom Voicing Extraction**: Parses explicit fret-string headers (`[ch]G*[/ch]: 320033`, `D/F#* = 2-x-0-2-3-2`, `Cm7*: x 3 5 5 4 3`), ChordPro `{define: ...}` directives, and 6-line vertical ASCII neck blocks (`e|---3---|`, `B|---3---|`, …).
- **Exact Lyric-to-Chord Alignment**: Tokenizes two-line Ultimate Guitar blocks by slicing lyrics at strict character column indices above each syllable, alongside inline bracketed ChordPro notation (`[G*]Amazing grace how [D/F#*]sweet`).
- **Standard Chord Library Fallback**: Automatically resolves non-custom chords through a built-in open-position dictionary and movable E-shape / A-shape barre generator (`lib/chordLibrary.ts`).

### 2. Parametric Vector Fretboard Engine (`lib/fretboard.ts`)
- **Shared Geometry**: A single renderer-agnostic coordinate engine drives both the browser DOM `<svg>` ([`FretboardSvg`](components/FretboardSvg.tsx)) and the `@react-pdf/renderer` `<Svg>` ([`PDFFretboardSvg`](components/pdf/PDFFretboardSvg.tsx)), ensuring identical rendering on screen and in print.
- **Complete Neck Notation**: Supports double-thick nuts for open position (`baseFret === 1`), `${baseFret}fr` offset indicators when frets exceed 4, horizontal barre spans, open string circles (`○`), and muted string markers (`×`).

### 3. Four Calibrated Layout & Print Presets (`lib/sheet.ts`)
| Preset | Target Use Case | Fretboard Placement | Layout |
| :--- | :--- | :--- | :--- |
| **1. Study (`inline_all`)** | Learning unfamiliar custom shapes | Mini-fretboard SVG rendered directly above every chord appearance | Single-column with expanded line spacing |
| **2. Rehearsal (`first_occurrence_only`)** | Intermediate practice & quick memorization | Inline diagram only the first time each unique chord appears; text only thereafter | Adaptive line height |
| **3. Glossary (`top_glossary`)** | Mastered songs & reference charts | Consolidated chord grid at the top of Page 1; chord names over lyrics below | Compact single-column |
| **4. Lead sheet (`worship_two_column`)** | Band distribution & live worship services | Top voicing glossary with dual-key Capo summary (`Capo 3: G Shapes / Concert Key: B♭`) | Balanced two-column layout with boxed section headers |

### 4. Target Key → Automatic Capo Calculator & Saved Songs Library
- **Target Key Selector**: Pick the concert key you want to play in (e.g., `B♭`, `F♯`, `C`), and ChordFlow calculates the exact **Capo position** (`Fret 3 · G shapes`) and updates both the live sheet and exported PDF.
- **Saved Songs Library (`/saved`)**: Save songs with their last played key, capo position, and custom voicing overrides into LocalStorage (`lib/store.ts`), and search your library by title, artist, or key.

---

## Tech Stack

- **Framework**: Next.js (App Router, TypeScript) + React
- **Styling**: Tailwind CSS v4 + Lucide Icons
- **PDF Compilation**: `@react-pdf/renderer` (vector `<Svg>` primitives, `wrap={false}` section protection, A4 & Letter calibration)
- **State & Persistence**: Zustand (`persist` middleware backed by `localStorage`)
- **Testing**: Vitest (`lib/parser.test.ts`)

---

## Getting Started

### Prerequisites
- Node.js 20+ and `npm`

### Installation & Development

```bash
# Install dependencies
npm install

# Start the development server at http://localhost:3000
npm run dev
```

### Scripts

```bash
npm run dev        # Start Next.js dev server
npm run build      # Create optimized production build
npm start          # Start production server
npm test           # Run Vitest unit & PDF compilation test suite
npm run typecheck  # Run TypeScript compiler checks
```

---

## Project Structure

```text
.
├── app/
│   ├── api/ug/route.ts             # Stub API route for UG URL imports
│   ├── saved/page.tsx              # Saved songs library with search bar
│   ├── globals.css                 # Base styles & Tailwind import
│   ├── layout.tsx                  # Root layout & metadata
│   └── page.tsx                    # Main split-screen workspace route
├── components/
│   ├── pdf/
│   │   ├── PDFDownloadButton.tsx   # Client-side PDF compilation & download trigger
│   │   ├── PDFFretboardSvg.tsx     # @react-pdf/renderer vector fretboard component
│   │   └── SongPDFDocument.tsx     # Declarative A4/Letter PDF document
│   ├── ChordFlowWorkspace.tsx      # Split-screen editor, options & custom voicing builder
│   ├── FretboardSvg.tsx            # Browser DOM SVG fretboard component
│   ├── SheetPreview.tsx            # Live WYSIWYG paper preview
│   └── ui.tsx                      # Shared accessible UI primitives
├── lib/
│   ├── chordLibrary.ts             # Standard open & movable barre chord dictionary
│   ├── fretboard.ts                # Parametric fretboard SVG coordinate math
│   ├── music.ts                    # Chord parsing, transposition & Capo calculator
│   ├── parser.ts                   # UG / ChordPro / ASCII neck parsing engine
│   ├── parser.test.ts              # Vitest unit & PDF rendering tests
│   ├── sheet.ts                    # Renderer-agnostic sheet layout planner
│   ├── store.ts                    # Persisted Zustand workspace & saved song store
│   ├── templates.ts                # Pre-populated worship & study song templates
│   └── voicing.ts                  # 6-string fret parsing, baseFret & barre detection
└── types/
    └── chord.ts                    # Core TypeScript interfaces
```
