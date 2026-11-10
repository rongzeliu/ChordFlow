import type { ChordVoicing, DiagramSize } from '@/types/chord';
import { buildFretboardGeometry, DIAGRAM_WIDTH } from '@/lib/fretboard';
import { fretsToString } from '@/lib/voicing';

interface FretboardSvgProps {
  voicing: ChordVoicing;
  size?: DiagramSize;
  /** Multiplier applied to the base diagram width. */
  scale?: number;
  /** CSS length unit for width/height. `pt` keeps the paper preview WYSIWYG with the PDF. */
  unit?: 'pt' | 'px';
  color?: string;
  className?: string;
}

/** Parametric fretboard diagram for the browser DOM. Mirrors components/pdf/PDFFretboardSvg. */
export function FretboardSvg({
  voicing,
  size = 'compact',
  scale = 1,
  unit = 'pt',
  color = '#1c1917',
  className,
}: FretboardSvgProps) {
  const g = buildFretboardGeometry(voicing, size);
  const width = DIAGRAM_WIDTH[size] * scale;
  const height = (width * g.height) / g.width;

  return (
    <svg
      viewBox={g.viewBox}
      width={`${width}${unit}`}
      height={`${height}${unit}`}
      role="img"
      aria-label={`${voicing.name} chord diagram, frets ${fretsToString(voicing.frets)}`}
      className={className}
    >
      {g.nut && <rect {...g.nut} fill={color} />}
      {g.frets.map((l, i) => (
        <line key={`f${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.width} />
      ))}
      {g.strings.map((l, i) => (
        <line key={`s${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.width} />
      ))}
      {g.baseFretLabel && (
        <text
          x={g.baseFretLabel.x}
          y={g.baseFretLabel.y}
          fontSize={g.baseFretLabel.fontSize}
          fontWeight={700}
          textAnchor={g.baseFretLabel.anchor}
          fill={color}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {g.baseFretLabel.text}
        </text>
      )}
      {g.markers.map((m, i) =>
        m.kind === 'open' ? (
          <circle key={`m${i}`} cx={m.x} cy={m.y} r={m.size} fill="none" stroke={color} strokeWidth={1.4} />
        ) : (
          <g key={`m${i}`} stroke={color} strokeWidth={1.6} strokeLinecap="round">
            <line x1={m.x - m.size} y1={m.y - m.size} x2={m.x + m.size} y2={m.y + m.size} />
            <line x1={m.x - m.size} y1={m.y + m.size} x2={m.x + m.size} y2={m.y - m.size} />
          </g>
        ),
      )}
      {g.barre && <rect {...g.barre} ry={g.barre.rx} fill={color} />}
      {g.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={color} />
      ))}
      {g.fingerLabels.map((l, i) => (
        <text
          key={`l${i}`}
          x={l.x}
          y={l.y}
          fontSize={l.fontSize}
          textAnchor={l.anchor}
          fill={color}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}
