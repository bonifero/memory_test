// Must stay in sync with frontend/src/protocol.ts.
export type Notation = "roman" | "pictograms";
export type SymbolSize = "small" | "large";
export type ConditionId = "A" | "B" | "C" | "D";

export const conditions: Record<ConditionId, { notation: Notation; symbolSize: SymbolSize; label: string }> = {
  A: { notation: "roman", symbolSize: "small", label: "Римские · мелкие" },
  B: { notation: "roman", symbolSize: "large", label: "Римские · крупные" },
  C: { notation: "pictograms", symbolSize: "small", label: "Пиктограммы · мелкие" },
  D: { notation: "pictograms", symbolSize: "large", label: "Пиктограммы · крупные" }
};
export const conditionIds = Object.keys(conditions) as ConditionId[];
export const setSizes = [3, 5, 8] as const;
export const totalTrials = 12;

export const notationLabels: Record<Notation, string> = { roman: "Римские цифры", pictograms: "Пиктограммы" };
export const sizeLabels: Record<SymbolSize, string> = { small: "Мелкие", large: "Крупные" };
export const romanValues = ["N", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export const pictogramNames = ["кольцо", "круг", "сердце", "треугольник", "квадрат", "звезда",
  "шестиугольник", "ромб", "крест", "пятиугольник"];

export function score(shown: number[], answer: number[]) {
  const target = new Set(shown);
  const chosen = new Set(answer);
  const missed = shown.filter((digit) => !chosen.has(digit));
  const extra = [...chosen].filter((digit) => !target.has(digit));
  const accuracy = shown.length ? Math.max(0, shown.length - missed.length - extra.length) / shown.length : 0;
  return { missed, extra, accuracy: Math.round(accuracy * 1000) / 10, exact: missed.length === 0 && extra.length === 0 };
}
