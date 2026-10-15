// Must stay in sync with frontend/src/protocol.ts.
export type Notation = "roman" | "pictograms";
export type SymbolSize = "small" | "large";
export type ConditionId = "A" | "B" | "C" | "D";

export interface Kind {
  notation: Notation;
  symbolSize: SymbolSize;
}

/** Every set mixes two kinds of symbols, about half of each. */
export const conditions: Record<ConditionId, { kinds: [Kind, Kind]; label: string }> = {
  A: { label: "Римские · крупные и мелкие",
    kinds: [{ notation: "roman", symbolSize: "small" }, { notation: "roman", symbolSize: "large" }] },
  B: { label: "Пиктограммы · крупные и мелкие",
    kinds: [{ notation: "pictograms", symbolSize: "small" }, { notation: "pictograms", symbolSize: "large" }] },
  C: { label: "Мелкие римские + крупные пиктограммы",
    kinds: [{ notation: "roman", symbolSize: "small" }, { notation: "pictograms", symbolSize: "large" }] },
  D: { label: "Мелкие пиктограммы + крупные римские",
    kinds: [{ notation: "pictograms", symbolSize: "small" }, { notation: "roman", symbolSize: "large" }] }
};
export const conditionIds = Object.keys(conditions) as ConditionId[];
export const conditionNotations = (id: ConditionId): Notation[] => [...new Set(conditions[id].kinds.map((k) => k.notation))];

/** Symbol kinds across all conditions: notation × size. */
export type CellId = "RS" | "RL" | "PS" | "PL";
export const cells: Record<CellId, Kind & { label: string }> = {
  RS: { notation: "roman", symbolSize: "small", label: "Римские · мелкие" },
  RL: { notation: "roman", symbolSize: "large", label: "Римские · крупные" },
  PS: { notation: "pictograms", symbolSize: "small", label: "Пиктограммы · мелкие" },
  PL: { notation: "pictograms", symbolSize: "large", label: "Пиктограммы · крупные" }
};
export const cellIds = Object.keys(cells) as CellId[];
export const cellOf = (notation: Notation, size: SymbolSize): CellId =>
  `${notation === "roman" ? "R" : "P"}${size === "small" ? "S" : "L"}` as CellId;

export const PROTOCOL_VERSION = "mixed-v1";
export const setSizes = [3, 5, 8] as const;
export const totalTrials = 12;

/** A symbol is one number: roman numerals are 0–9, pictograms are 10–19. */
export const digitOf = (code: number) => code % 10;
export const notationOf = (code: number): Notation => (code >= 10 ? "pictograms" : "roman");

export const notationLabels: Record<Notation, string> = { roman: "Римские цифры", pictograms: "Пиктограммы" };
export const sizeLabels: Record<SymbolSize, string> = { small: "Мелкие", large: "Крупные" };
export const romanValues = ["N", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export const pictogramNames = ["кольцо", "круг", "сердце", "треугольник", "квадрат", "звезда",
  "шестиугольник", "ромб", "крест", "пятиугольник"];

export function score(shown: number[], answer: number[]) {
  const target = new Set(shown);
  const chosen = new Set(answer);
  const missed = shown.filter((code) => !chosen.has(code));
  const extra = [...chosen].filter((code) => !target.has(code));
  const accuracy = shown.length ? Math.max(0, shown.length - missed.length - extra.length) / shown.length : 0;
  return { missed, extra, accuracy: Math.round(accuracy * 1000) / 10, exact: missed.length === 0 && extra.length === 0 };
}
