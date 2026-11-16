import { Document, Line, Page, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type {
  ChordVoicing,
  DiagramScope,
  DiagramSize,
  DisplayMode,
  LayoutPreset,
  PageSize,
  ParsedSong,
} from '@/types/chord';
import { planSheet } from '@/lib/sheet';
import { fretsToString } from '@/lib/voicing';
import { PDFFretboardSvg } from './PDFFretboardSvg';

export interface SongPDFDocumentProps {
  song: ParsedSong;
  preset: LayoutPreset;
  diagramSize?: DiagramSize;
  diagramScope?: DiagramScope;
  displayMode?: DisplayMode;
  capo?: number;
  scale?: number;
  pageSize?: PageSize;
  gridSize?: number;
  showGrid?: boolean;
  chordGridOffsets?: Record<string, number>;
}

export const PDFChordCard = ({
  chord,
  size = 'standard',
  scale = 1,
}: {
  chord: ChordVoicing;
  size?: DiagramSize;
  scale?: number;
}) => (
  <View
    wrap={false}
    style={{
      alignItems: 'center',
      marginRight: 14 * scale,
      marginBottom: 10 * scale,
    }}
  >
    <Text
      style={{
        fontSize: 9 * scale,
        fontFamily: 'Helvetica-Bold',
        color: '#292524',
        marginBottom: 2 * scale,
      }}
    >
      {chord.name}
    </Text>
    <PDFFretboardSvg voicing={chord} size={size} scale={scale * 1.1} color="#292524" />
    <Text
      style={{
        fontSize: 6.5 * scale,
        fontFamily: 'Courier',
        color: '#78716c',
        marginTop: 2 * scale,
      }}
    >
      {fretsToString(chord.frets)}
    </Text>
  </View>
);

export const SongPDFDocument = ({
  song,
  preset,
  diagramSize = 'compact',
  diagramScope = 'custom',
  displayMode = 'shapes',
  capo,
  scale = 1,
  pageSize = 'A4',
  gridSize = 24,
  showGrid = false,
  chordGridOffsets,
}: SongPDFDocumentProps) => {
  const effectiveCapo = capo ?? song.capo ?? 0;
  const cellPt = Math.max(8, gridSize) * scale;
  const pageDims =
    pageSize === 'LETTER' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
  const verticalGridPositions: number[] = [];
  const horizontalGridPositions: number[] = [];
  if (showGrid) {
    for (let x = 0; x <= pageDims.width; x += cellPt) verticalGridPositions.push(x);
    for (let y = 0; y <= pageDims.height; y += cellPt) horizontalGridPositions.push(y);
  }
  const plan = planSheet(song, {
    preset,
    diagramScope,
    displayMode,
    capo: effectiveCapo,
  });

  const isTwoColumn = preset === 'worship_two_column';
  const showTopGlossary =
    (preset === 'top_glossary' || preset === 'worship_two_column') && plan.glossary.length > 0;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 48,
      paddingHorizontal: 52,
      fontFamily: 'Helvetica',
      color: '#1c1917',
      backgroundColor: '#ffffff',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 22,
    },
    titleBlock: {
      flexDirection: 'column',
      maxWidth: '68%',
    },
    title: {
      fontSize: 18 * scale,
      fontFamily: 'Helvetica-Bold',
      color: '#1c1917',
    },
    artist: {
      fontSize: 10 * scale,
      color: '#78716c',
      marginTop: 3,
    },
    metaPrimary: {
      fontSize: 9 * scale,
      color: '#78716c',
    },
    glossaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 18,
    },
    columnsContainer: {
      flexDirection: isTwoColumn ? 'row' : 'column',
      justifyContent: 'space-between',
    },
    column: {
      width: isTwoColumn ? '47.5%' : '100%',
    },
    sectionBlock: {
      marginBottom: 16 * scale,
    },
    sectionHeaderPlain: {
      fontSize: 8.5 * scale,
      fontFamily: 'Helvetica-Bold',
      color: '#a8a29e',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6 * scale,
    },
    sectionHeaderBoxed: {
      alignSelf: 'flex-start',
      fontSize: 8.5 * scale,
      fontFamily: 'Helvetica-Bold',
      color: '#44403c',
      borderWidth: 0.75,
      borderColor: '#a8a29e',
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6 * scale,
    },
    lyricLineContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      marginBottom: 4 * scale,
    },
    lyricLineWithDiagram: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      marginBottom: 8 * scale,
    },
    tokenBox: {
      flexDirection: 'column',
      justifyContent: 'flex-end',
    },
    chordContainer: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: 1.5,
      paddingRight: 5,
    },
    chordText: {
      fontSize: 9.5 * scale,
      fontFamily: 'Helvetica-Bold',
      color: '#44403c',
    },
    chordTextCustom: {
      fontSize: 9.5 * scale,
      fontFamily: 'Helvetica-Bold',
      color: '#b45309',
    },
    lyricText: {
      fontSize: 10.5 * scale,
      lineHeight: 1.3,
      color: '#1c1917',
    },
    commentText: {
      fontSize: 9.5 * scale,
      fontFamily: 'Helvetica-Oblique',
      color: '#78716c',
      marginBottom: 4 * scale,
    },
    tabText: {
      fontSize: 8.5 * scale,
      fontFamily: 'Courier',
      color: '#44403c',
      marginBottom: 2,
    },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 52,
      right: 52,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7.5,
      color: '#a8a29e',
    },
  });

  const leftSections: { sec: (typeof plan.sections)[number]; sIdx: number }[] = [];
  const rightSections: { sec: (typeof plan.sections)[number]; sIdx: number }[] = [];
  if (isTwoColumn) {
    const totalWeight = plan.sections.reduce((acc, s) => acc + Math.max(2, s.lines.length + 1), 0);
    let running = 0;
    plan.sections.forEach((sec, sIdx) => {
      const w = Math.max(2, sec.lines.length + 1);
      if (running < totalWeight / 2 || leftSections.length === 0) {
        leftSections.push({ sec, sIdx });
      } else {
        rightSections.push({ sec, sIdx });
      }
      running += w;
    });
  } else {
    plan.sections.forEach((sec, sIdx) => leftSections.push({ sec, sIdx }));
  }

  const renderSection = ({
    sec,
    sIdx,
  }: {
    sec: (typeof plan.sections)[number];
    sIdx: number;
  }) => (
    <View key={sIdx} style={styles.sectionBlock} wrap={false}>
      {sec.label && (
        <Text style={isTwoColumn ? styles.sectionHeaderBoxed : styles.sectionHeaderPlain}>
          {sec.label}
        </Text>
      )}
      {sec.lines.map((line, lIdx) => {
        if (line.kind === 'comment') {
          return (
            <Text key={lIdx} style={styles.commentText}>
              {line.text}
            </Text>
          );
        }
        if (line.kind === 'tab') {
          return (
            <Text key={lIdx} style={styles.tabText}>
              {line.text}
            </Text>
          );
        }
        return (
          <View
            key={lIdx}
            style={line.hasDiagram ? styles.lyricLineWithDiagram : styles.lyricLineContainer}
            wrap={false}
          >
            {line.tokens.map((token, tIdx) => {
              const chordHeaders =
                token.chords ??
                (token.label
                  ? [
                      {
                        chord: token.chord ?? token.label,
                        label: token.label,
                        isCustom: token.isCustom,
                        voicing: token.voicing,
                        showDiagram: token.showDiagram,
                      },
                    ]
                  : []);
              return (
                <View key={tIdx} style={styles.tokenBox}>
                  {chordHeaders.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      {chordHeaders.map((c, cIdx) => {
                        const chordKey = `${sIdx}:${lIdx}:${tIdx}:${cIdx}`;
                        const offsetCols = chordGridOffsets?.[chordKey] ?? 0;
                        const offsetPt = offsetCols * cellPt;
                        return (
                          <View
                            key={`${c.chord}-${cIdx}`}
                            style={[
                              styles.chordContainer,
                              {
                                paddingRight:
                                  token.isHyphenated && cIdx === chordHeaders.length - 1 ? 1 : 5,
                              },
                              offsetPt !== 0
                                ? { position: 'relative', left: offsetPt }
                                : {},
                            ]}
                          >
                            {c.showDiagram && c.voicing && (
                              <PDFFretboardSvg
                                voicing={c.voicing}
                                size={diagramSize}
                                scale={scale}
                                color="#292524"
                              />
                            )}
                            <Text style={c.isCustom ? styles.chordTextCustom : styles.chordText}>
                              {c.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.lyricText}>{token.text || ' '}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );

  return (
    <Document title={`${plan.title} — ChordFlow`} author={plan.artist || 'ChordFlow'}>
      <Page size={pageSize} style={styles.page}>
        {showGrid && (
          <Svg
            fixed
            width={pageDims.width}
            height={pageDims.height}
            viewBox={`0 0 ${pageDims.width} ${pageDims.height}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {verticalGridPositions.map((x, idx) => (
              <Line
                key={`vg-${idx}`}
                x1={x}
                y1={0}
                x2={x}
                y2={pageDims.height}
                stroke="#1A382B"
                strokeOpacity={0.07}
                strokeWidth={0.5}
              />
            ))}
            {horizontalGridPositions.map((y, idx) => (
              <Line
                key={`hg-${idx}`}
                x1={0}
                y1={y}
                x2={pageDims.width}
                y2={y}
                stroke="#1A382B"
                strokeOpacity={0.07}
                strokeWidth={0.5}
              />
            ))}
          </Svg>
        )}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{plan.title}</Text>
            {plan.artist ? <Text style={styles.artist}>{plan.artist}</Text> : null}
          </View>
          <Text style={styles.metaPrimary}>{plan.keyInfo.summary}</Text>
        </View>

        {showTopGlossary && (
          <View style={styles.glossaryGrid} wrap={false}>
            {plan.glossary.map((c) => (
              <PDFChordCard key={c.name} chord={c} size={diagramSize} scale={scale} />
            ))}
          </View>
        )}

        <View style={styles.columnsContainer}>
          <View style={styles.column}>{leftSections.map(renderSection)}</View>
          {isTwoColumn && <View style={styles.column}>{rightSections.map(renderSection)}</View>}
        </View>

        <View style={styles.footer} fixed>
          <Text>{plan.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
