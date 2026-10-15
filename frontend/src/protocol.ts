// Experiment protocol. Conditions must stay in sync with backend/src/protocol.ts.
export type Notation = "roman" | "pictograms";
export type SymbolSize = "small" | "large";
export type ConditionId = "A" | "B" | "C" | "D";

/** One kind of symbol inside a set: a notation shown at a given size. */
export interface Kind {
  notation: Notation;
  symbolSize: SymbolSize;
}

/** Every set mixes two kinds of symbols, about half of each. */
export interface Condition {
  id: ConditionId;
  kinds: [Kind, Kind];
  label: string;
}

/**
 * A symbol is encoded as one number: roman numerals are 0–9, pictograms are 10–19.
 * The same encoding is used for shown symbols and for answers.
 */
export type Code = number;

export interface Trial {
  id: ConditionId;
  caseId: string;
  size: number;
  durationMs: number;
  shown: Code[];
  /** Size of every shown symbol, aligned with `shown`. */
  shownSizes: SymbolSize[];
  block: number;
  blockTrial: number;
  training?: boolean;
}

export const PROTOCOL_VERSION = "mixed-v1";
export const TOTAL_TRIALS = 12;
export const BLOCK_LENGTH = 3;
export const SET_SIZES = [3, 5, 8];
export const DIGITS = Array.from({ length: 10 }, (_, i) => i);

export const conditions: Condition[] = [
  { id: "A", label: "Римские · крупные и мелкие",
    kinds: [{ notation: "roman", symbolSize: "small" }, { notation: "roman", symbolSize: "large" }] },
  { id: "B", label: "Пиктограммы · крупные и мелкие",
    kinds: [{ notation: "pictograms", symbolSize: "small" }, { notation: "pictograms", symbolSize: "large" }] },
  { id: "C", label: "Мелкие римские + крупные пиктограммы",
    kinds: [{ notation: "roman", symbolSize: "small" }, { notation: "pictograms", symbolSize: "large" }] },
  { id: "D", label: "Мелкие пиктограммы + крупные римские",
    kinds: [{ notation: "pictograms", symbolSize: "small" }, { notation: "roman", symbolSize: "large" }] }
];
export const conditionById = Object.fromEntries(conditions.map((c) => [c.id, c])) as Record<ConditionId, Condition>;
export const conditionLabel = (c: Pick<Condition, "id">) => conditionById[c.id].label;
/** Notations offered on the answer screen: one group of 10 options per notation in the condition. */
export const conditionNotations = (id: ConditionId): Notation[] => [...new Set(conditionById[id].kinds.map((k) => k.notation))];

// Balanced Latin square: every condition appears in every position once.
export const ORDERS = [[0, 1, 3, 2], [1, 2, 0, 3], [2, 3, 1, 0], [3, 0, 2, 1]];

export const notationLabels: Record<Notation, string> = { roman: "Римские цифры", pictograms: "Пиктограммы" };
export const sizeLabels: Record<SymbolSize, string> = { small: "Мелкие", large: "Крупные" };

export const codeOf = (notation: Notation, digit: number): Code => digit + (notation === "pictograms" ? 10 : 0);
export const digitOf = (code: Code) => code % 10;
export const notationOf = (code: Code): Notation => (code >= 10 ? "pictograms" : "roman");

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

/**
 * How many symbols of the first kind each set of a block gets. Odd sets are split unevenly in opposite
 * directions (3 → 2+1, 5 → 2+3), so over a block of 3 + 5 + 8 symbols each kind is shown exactly 8 times.
 */
function firstKindCounts(): number[] {
  return Math.random() < 0.5 ? [2, 2, 4] : [1, 3, 4];
}

function makeSet(condition: Condition, size: number, firstKind: number): Pick<Trial, "shown" | "shownSizes"> {
  const digits = shuffle(DIGITS).slice(0, size);
  const items = shuffle(digits.map((digit, i) => {
    const kind = condition.kinds[i < firstKind ? 0 : 1];
    return { code: codeOf(kind.notation, digit), size: kind.symbolSize };
  }));
  return { shown: items.map((item) => item.code), shownSizes: items.map((item) => item.size) };
}

export function makePlan(orderIndex: number): Trial[] {
  return ORDERS[orderIndex % ORDERS.length].flatMap((conditionIndex, blockIndex) => {
    const condition = conditions[conditionIndex];
    const counts = firstKindCounts();
    return SET_SIZES.map((size, index) => ({
      id: condition.id,
      caseId: `${condition.id}-${size}`,
      size,
      durationMs: size * 1000,
      ...makeSet(condition, size, counts[index]),
      block: blockIndex + 1,
      blockTrial: index + 1
    }));
  });
}

export const trainingPlan: Trial[] = [
  { id: "A", caseId: "T-A-5", size: 5, durationMs: 5000, shown: [1, 3, 5, 7, 9],
    shownSizes: ["small", "large", "large", "small", "large"], block: 0, blockTrial: 1, training: true },
  { id: "C", caseId: "T-C-5", size: 5, durationMs: 5000, shown: [10, 2, 14, 16, 8],
    shownSizes: ["large", "small", "large", "large", "small"], block: 0, blockTrial: 2, training: true }
];

export function score(shown: Code[], answer: Code[]) {
  const target = new Set(shown);
  const chosen = new Set(answer);
  const missed = shown.filter((code) => !chosen.has(code));
  const extra = [...chosen].filter((code) => !target.has(code));
  const accuracy = shown.length ? Math.max(0, shown.length - missed.length - extra.length) / shown.length : 0;
  return { missed, extra, accuracy: Math.round(accuracy * 1000) / 10, exact: missed.length === 0 && extra.length === 0 };
}

export const describeSymbol = (notation: Notation, digit: number) =>
  notation === "roman" ? romanValues[digit] : `${digit || 1} × ${shapeNames[digit]}`;
export const describeCode = (code: Code) => describeSymbol(notationOf(code), digitOf(code));
