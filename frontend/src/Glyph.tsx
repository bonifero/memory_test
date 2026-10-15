import type { ReactElement } from "react";
import { describeSymbol, romanValues, shapes, type Notation, type Shape } from "./protocol";

const UNIT = 20;

function shapeNode(shape: Shape, key: number, x: number, y: number): ReactElement {
  const at = (points: [number, number][]) => points.map(([px, py]) => `${x + px},${y + py}`).join(" ");
  const regular = (vertices: number, outer: number, inner = outer) =>
    at(Array.from({ length: vertices }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / vertices;
      const radius = i % 2 ? inner : outer;
      return [10 + Math.cos(angle) * radius, 10.5 + Math.sin(angle) * radius] as [number, number];
    }));
  switch (shape) {
    case "ring": return <circle key={key} cx={x + 10} cy={y + 10} r={7.5} fill="none" stroke="currentColor" strokeWidth={2.4} />;
    case "circle": return <circle key={key} cx={x + 10} cy={y + 10} r={8.5} />;
    case "heart": return <path key={key} transform={`translate(${x} ${y})`}
      d="M10 18.2 2.9 11.1a4.7 4.7 0 0 1 7.1-6.1 4.7 4.7 0 0 1 7.1 6.1Z" />;
    case "triangle": return <polygon key={key} points={at([[10, 1.5], [19, 17.5], [1, 17.5]])} />;
    case "square": return <rect key={key} x={x + 2.5} y={y + 2.5} width={15} height={15} rx={1} />;
    case "star": return <polygon key={key} points={regular(10, 9.5, 4)} />;
    case "hexagon": return <polygon key={key} points={regular(6, 9.2)} />;
    case "diamond": return <polygon key={key} points={at([[10, 0.8], [18.5, 10], [10, 19.2], [1.5, 10]])} />;
    case "cross": return <polygon key={key} points={at([[7, 1.5], [13, 1.5], [13, 7], [18.5, 7], [18.5, 13], [13, 13],
      [13, 18.5], [7, 18.5], [7, 13], [1.5, 13], [1.5, 7], [7, 7]])} />;
    case "pentagon": return <polygon key={key} points={regular(5, 9.3)} />;
  }
}

/** Layout: up to 5 figures in one row, more are split into two balanced rows. */
function pictogramRows(count: number): number[] {
  if (count <= 5) return [count];
  const first = Math.ceil(count / 2);
  return [first, count - first];
}

interface GlyphProps {
  digit: number;
  notation: Notation;
  /** Size of one pictogram figure in px; the symbol box is 2 rows (2.25 × cell) tall. */
  cell: number;
}

export function Glyph({ digit, notation, cell }: GlyphProps) {
  const height = cell * 2.25;
  if (notation === "roman") {
    return (
      <span className="glyph glyph-roman" style={{ height, fontSize: height * 1.12 }} aria-label={romanValues[digit]}>
        {romanValues[digit]}
      </span>
    );
  }
  const count = digit || 1;
  const rows = pictogramRows(count);
  const gap = UNIT * 0.25;
  const perRow = Math.max(...rows);
  const width = perRow * UNIT + (perRow - 1) * gap;
  const boxHeight = 2 * UNIT + gap;
  const top = rows.length === 1 ? (boxHeight - UNIT) / 2 : 0;
  const nodes: ReactElement[] = [];
  rows.forEach((inRow, row) => {
    const offset = (width - (inRow * UNIT + (inRow - 1) * gap)) / 2;
    for (let i = 0; i < inRow; i++) {
      nodes.push(shapeNode(shapes[digit], nodes.length, offset + i * (UNIT + gap), top + row * (UNIT + gap)));
    }
  });
  const scale = height / boxHeight;
  return (
    <svg className="glyph glyph-pictogram" viewBox={`0 0 ${width} ${boxHeight}`} width={width * scale} height={height}
      fill="currentColor" role="img" aria-label={describeSymbol("pictograms", digit)}>
      {nodes}
    </svg>
  );
}
