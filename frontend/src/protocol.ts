// Experiment protocol. Conditions must stay in sync with backend/src/protocol.ts.
export type Notation = "roman" | "pictograms";
export type SymbolSize = "small" | "large";
export type ConditionId = "A" | "B" | "C" | "D";

export interface Condition {
  id: ConditionId;
  notation: Notation;
  symbolSize: SymbolSize;
}

export interface Trial extends Condition {
  caseId: string;
  size: number;
  durationMs: number;
  shown: number[];
  block: number;
  blockTrial: number;
  training?: boolean;
}

export const PROTOCOL_VERSION = "size-v1";
export const TOTAL_TRIALS = 12;
export const BLOCK_LENGTH = 3;
export const SET_SIZES = [3, 5, 8];
export const DIGITS = Array.from({ length: 10 }, (_, i) => i);

export const conditions: Condition[] = [
  { id: "A", notation: "roman", symbolSize: "small" },
  { id: "B", notation: "roman", symbolSize: "large" },
  { id: "C", notation: "pictograms", symbolSize: "small" },
  { id: "D", notation: "pictograms", symbolSize: "large" }
];
export const conditionById = Object.fromEntries(conditions.map((c) => [c.id, c])) as Record<ConditionId, Condition>;

// Balanced Latin square: every condition appears in every position once.
export const ORDERS = [[0, 1, 3, 2], [1, 2, 0, 3], [2, 3, 1, 0], [3, 0, 2, 1]];

export const notationLabels: Record<Notation, string> = { roman: "Римские цифры", pictograms: "Пиктограммы" };
export const sizeLabels: Record<SymbolSize, string> = { small: "Мелкие", large: "Крупные" };
export const conditionLabel = (c: Condition) => `${notationLabels[c.notation]} · ${sizeLabels[c.symbolSize].toLowerCase()}`;

export const romanValues = ["N", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export type Shape = "ring" | "circle" | "heart" | "triangle" | "square" | "star" | "hexagon" | "diamond" | "cross" | "pentagon";
export const shapes: Shape[] = ["ring", "circle", "heart", "triangle", "square", "star", "hexagon", "diamond", "cross", "pentagon"];
export const shapeNames = ["кольцо", "круг", "сердце", "треугольник", "квадрат", "звезда", "шестиугольник", "ромб",
  "крест", "пятиугольник"];

/**
 * Size of one pictogram figure in px. A symbol is always 2 figure rows tall,
 * so "large" symbols are exactly 3× the height of "small" ones for both notations.
 * Answer options use a neutral size that is the same in every condition.
 */
export const GLYPH_CELL = { small: 14, large: 42, answer: 22, table: 11, admin: 8 } as const;

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function makePlan(orderIndex: number): Trial[] {
  return ORDERS[orderIndex % ORDERS.length].flatMap((conditionIndex, blockIndex) => {
    const condition = conditions[conditionIndex];
    return SET_SIZES.map((size, index) => ({
      ...condition,
      caseId: `${condition.id}-${size}`,
      size,
      durationMs: size * 1000,
      shown: shuffle(DIGITS).slice(0, size),
      block: blockIndex + 1,
      blockTrial: index + 1
    }));
  });
}

export const trainingPlan: Trial[] = [
  { ...conditionById.A, caseId: "T-A-5", size: 5, durationMs: 5000, shown: [1, 3, 5, 7, 9], block: 0, blockTrial: 1, training: true },
  { ...conditionById.D, caseId: "T-D-5", size: 5, durationMs: 5000, shown: [0, 2, 4, 6, 8], block: 0, blockTrial: 2, training: true }
];

export function score(shown: number[], answer: number[]) {
  const target = new Set(shown);
  const chosen = new Set(answer);
  const missed = shown.filter((digit) => !chosen.has(digit));
  const extra = [...chosen].filter((digit) => !target.has(digit));
  const accuracy = shown.length ? Math.max(0, shown.length - missed.length - extra.length) / shown.length : 0;
  return { missed, extra, accuracy: Math.round(accuracy * 1000) / 10, exact: missed.length === 0 && extra.length === 0 };
}

export const describeSymbol = (notation: Notation, digit: number) =>
  notation === "roman" ? romanValues[digit] : `${digit || 1} × ${shapeNames[digit]}`;
