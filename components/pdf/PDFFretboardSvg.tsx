import { Circle, G, Line, Rect, Svg, Text } from '@react-pdf/renderer';
import type { ChordVoicing, DiagramSize } from '@/types/chord';
import { buildFretboardGeometry, DIAGRAM_WIDTH } from '@/lib/fretboard';

interface PDFFretboardSvgProps {
  voicing: ChordVoicing;
  size?: DiagramSize;
  scale?: number;
  color?: string;
}

/** @react-pdf/renderer twin of components/FretboardSvg — pure vector primitives for print. */
export function PDFFretboardSvg({ voicing, size = 'compact', scale = 1, color = '#1c1917' }: PDFFretboardSvgProps) {
  const g = buildFretboardGeometry(voicing, size);
  const width = DIAGRAM_WIDTH[size] * scale;
  const height = (width * g.height) / g.width;

  return (
    <Svg width={width} height={height} viewBox={g.viewBox}>
      {g.nut && <Rect x={g.nut.x} y={g.nut.y} width={g.nut.width} height={g.nut.height} fill={color} />}
      {g.frets.map((l, i) => (
        <Line key={`f${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.width} />
      ))}
      {g.strings.map((l, i) => (
        <Line key={`s${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.width} />
      ))}
      {g.baseFretLabel && (
        <Text
          x={g.baseFretLabel.x}
          y={g.baseFretLabel.y}
          textAnchor={g.baseFretLabel.anchor}
          style={{ fontSize: g.baseFretLabel.fontSize, fontFamily: 'Helvetica-Bold' }}
          fill={color}
        >
          {g.baseFretLabel.text}
        </Text>
      )}
      {g.markers.map((m, i) =>
        m.kind === 'open' ? (
          <Circle key={`m${i}`} cx={m.x} cy={m.y} r={m.size} fill="none" stroke={color} strokeWidth={1.4} />
        ) : (
          <G key={`m${i}`}>
            <Line x1={m.x - m.size} y1={m.y - m.size} x2={m.x + m.size} y2={m.y + m.size} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
            <Line x1={m.x - m.size} y1={m.y + m.size} x2={m.x + m.size} y2={m.y - m.size} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          </G>
        ),
      )}
      {g.barre && (
        <Rect x={g.barre.x} y={g.barre.y} width={g.barre.width} height={g.barre.height} rx={g.barre.rx} ry={g.barre.rx} fill={color} />
      )}
      {g.dots.map((d, i) => (
        <Circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={color} />
      ))}
      {g.fingerLabels.map((l, i) => (
        <Text key={`l${i}`} x={l.x} y={l.y} textAnchor={l.anchor} style={{ fontSize: l.fontSize, fontFamily: 'Helvetica' }} fill={color}>
          {l.text}
        </Text>
      ))}
    </Svg>
  );
}
