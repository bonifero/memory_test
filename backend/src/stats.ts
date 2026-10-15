import { cellIds, cellOf, cells, conditionIds, conditions, notationOf, setSizes, type CellId, type ConditionId,
  type SymbolSize } from "./protocol.js";
import type { SessionRow, TrialWithSession } from "./db.js";

// ---------- Basic descriptive statistics ----------

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

export function sd(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------- Student's t distribution ----------

function logGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const eps = 1e-14;
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic. */
export function tTestPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Critical t value for a two-sided interval, e.g. 2.262 for df = 9, alpha = 0.05. */
export function tCritical(df: number, alpha = 0.05): number {
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const midpoint = (lo + hi) / 2;
    if (tTestPValue(midpoint, df) > alpha) lo = midpoint; else hi = midpoint;
  }
  return (lo + hi) / 2;
}

export interface Description {
  n: number;
  mean: number | null;
  sd: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  median: number | null;
}

export function describe(values: number[]): Description {
  const m = mean(values);
  const s = sd(values);
  const half = s !== null ? tCritical(values.length - 1) * s / Math.sqrt(values.length) : null;
  return {
    n: values.length,
    mean: m,
    sd: s,
    ciLow: m !== null && half !== null ? m - half : null,
    ciHigh: m !== null && half !== null ? m + half : null,
    median: median(values)
  };
}

export interface PairedTest {
  n: number;
  meanDiff: number | null;
  sdDiff: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  t: number | null;
  df: number | null;
  p: number | null;
  dz: number | null;
  supporting: number;
}

/** Paired t-test over per-participant differences (H0: mean difference = 0). */
export function pairedTest(diffs: number[]): PairedTest {
  const n = diffs.length;
  const d = describe(diffs);
  const supporting = diffs.filter((v) => v > 0).length;
  if (n < 2 || d.sd === null || d.mean === null) {
    return { n, meanDiff: d.mean, sdDiff: d.sd, ciLow: null, ciHigh: null, t: null, df: null, p: null, dz: null, supporting };
  }
  const df = n - 1;
  if (d.sd === 0) {
    const t = d.mean === 0 ? 0 : Math.sign(d.mean) * Infinity;
    return { n, meanDiff: d.mean, sdDiff: 0, ciLow: d.mean, ciHigh: d.mean, t, df,
      p: d.mean === 0 ? 1 : 0, dz: null, supporting };
  }
  const t = d.mean / (d.sd / Math.sqrt(n));
  return { n, meanDiff: d.mean, sdDiff: d.sd, ciLow: d.ciLow, ciHigh: d.ciHigh, t, df,
    p: tTestPValue(t, df), dz: d.mean / d.sd, supporting };
}

export type Verdict = "confirmed" | "not_confirmed" | "opposite" | "insufficient";

export const MIN_PARTICIPANTS = 3;
export const ALPHA = 0.05;

export function verdict(test: PairedTest): Verdict {
  if (test.n < MIN_PARTICIPANTS || test.p === null || test.meanDiff === null) return "insufficient";
  if (test.p < ALPHA) return test.meanDiff > 0 ? "confirmed" : "opposite";
  return "not_confirmed";
}

// ---------- Experiment-specific aggregation ----------

/**
 * Every set mixes two kinds of symbols, so notation and size are compared on single symbols:
 * recall of a kind = share of shown symbols of that kind that the participant marked.
 * Extra answers cannot be attributed to a size and only count in the trial accuracy.
 */
interface Item { cell: CellId; size: number; recalled: boolean }

function itemsOf(trial: TrialWithSession): Item[] {
  const shown = JSON.parse(trial.shown) as number[];
  const sizes = JSON.parse(trial.shown_sizes ?? "[]") as SymbolSize[];
  const answer = new Set(JSON.parse(trial.answer) as number[]);
  return shown.flatMap((code, i) => sizes[i]
    ? [{ cell: cellOf(notationOf(code), sizes[i]), size: trial.set_size, recalled: answer.has(code) }] : []);
}

const recallOf = (items: Item[]) => (items.length ? (items.filter((i) => i.recalled).length / items.length) * 100 : null);

type FactorKey = "roman" | "pictograms" | "small" | "large";
const factorCells: Record<FactorKey, [CellId, CellId]> = {
  roman: ["RS", "RL"], pictograms: ["PS", "PL"], small: ["RS", "PS"], large: ["RL", "PL"]
};
const factorKeys = Object.keys(factorCells) as FactorKey[];
/** Factor level = mean of its two cells, so both levels of the other factor weigh equally. */
const factorOf = (byCell: Record<CellId, number | null>, key: FactorKey) => {
  const [a, b] = factorCells[key].map((c) => byCell[c]);
  return a === null || b === null ? null : (a + b) / 2;
};

export interface ParticipantStats {
  sessionId: string;
  participant: string;
  status: string;
  startedAt: string;
  trials: number;
  meanAccuracy: number | null;
  byCondition: Record<ConditionId, number | null>;
  byCell: Record<CellId, number | null>;
  roman: number | null;
  pictograms: number | null;
  small: number | null;
  large: number | null;
  notationDiff: number | null;
  sizeDiff: number | null;
  interactionDiff: number | null;
}

function participantStats(trials: TrialWithSession[]): ParticipantStats[] {
  const bySession = new Map<string, TrialWithSession[]>();
  for (const trial of trials) {
    if (!bySession.has(trial.session_id)) bySession.set(trial.session_id, []);
    bySession.get(trial.session_id)!.push(trial);
  }
  return [...bySession.values()].map((list) => {
    const items = list.flatMap(itemsOf);
    const byCondition = Object.fromEntries(conditionIds.map((id) =>
      [id, mean(list.filter((t) => t.condition === id).map((t) => t.accuracy))])) as Record<ConditionId, number | null>;
    const byCell = Object.fromEntries(cellIds.map((id) =>
      [id, recallOf(items.filter((i) => i.cell === id))])) as Record<CellId, number | null>;
    const [roman, pictograms, small, large] = factorKeys.map((key) => factorOf(byCell, key));
    const { RS, RL, PS, PL } = byCell;
    return {
      sessionId: list[0].session_id,
      participant: list[0].participant,
      status: list[0].status,
      startedAt: list[0].started_at,
      trials: list.length,
      meanAccuracy: mean(list.map((t) => t.accuracy)),
      byCondition,
      byCell,
      roman, pictograms, small, large,
      notationDiff: roman !== null && pictograms !== null ? pictograms - roman : null,
      sizeDiff: small !== null && large !== null ? large - small : null,
      // Size effect for pictograms minus size effect for roman numerals.
      interactionDiff: RS !== null && RL !== null && PS !== null && PL !== null ? (PL - PS) - (RL - RS) : null
    };
  });
}

function hypothesis(id: string, title: string, levelA: string, levelB: string,
  participants: ParticipantStats[], pick: (p: ParticipantStats) => [number | null, number | null]) {
  const pairs = participants.map(pick).filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null);
  const test = pairedTest(pairs.map(([a, b]) => a - b));
  return {
    id, title, levelA, levelB,
    meanA: mean(pairs.map(([a]) => a)),
    meanB: mean(pairs.map(([, b]) => b)),
    test,
    verdict: verdict(test)
  };
}

const present = (values: (number | null)[]) => values.filter((v): v is number => v !== null);

export function computeStats(trials: TrialWithSession[], sessions: SessionRow[]) {
  const accuracies = trials.map((t) => t.accuracy);
  const items = trials.flatMap(itemsOf);
  const participants = participantStats(trials);

  const groups = Object.fromEntries(conditionIds.map((key) => {
    const list = trials.filter((t) => t.condition === key);
    return [key, {
      ...describe(list.map((t) => t.accuracy)),
      exactShare: list.length ? (list.filter((t) => t.exact).length / list.length) * 100 : null,
      meanMissed: mean(list.map((t) => t.missed_count)),
      meanExtra: mean(list.map((t) => t.extra_count)),
      meanResponseMs: mean(list.map((t) => t.response_ms))
    }];
  })) as Record<ConditionId, Description & { exactShare: number | null; meanMissed: number | null;
    meanExtra: number | null; meanResponseMs: number | null }>;

  // Recall of symbol kinds: described over participants (n = participants), plus the pooled share over all symbols.
  const recall = Object.fromEntries([
    ...cellIds.map((id) => {
      const list = items.filter((i) => i.cell === id);
      return [id, { ...describe(present(participants.map((p) => p.byCell[id]))), items: list.length, pooled: recallOf(list) }];
    }),
    ...factorKeys.map((key) => {
      const list = items.filter((i) => factorCells[key].includes(i.cell));
      return [key, { ...describe(present(participants.map((p) => p[key]))), items: list.length, pooled: recallOf(list) }];
    })
  ]) as Record<CellId | FactorKey, Description & { items: number; pooled: number | null }>;

  const bySetSize = Object.fromEntries(conditionIds.map((id) => [id,
    Object.fromEntries(setSizes.map((size) => {
      const list = trials.filter((t) => t.condition === id && t.set_size === size);
      return [size, { n: list.length, mean: mean(list.map((t) => t.accuracy)) }];
    }))]));

  const recallBySetSize = Object.fromEntries(cellIds.map((id) => [id,
    Object.fromEntries(setSizes.map((size) => {
      const list = items.filter((i) => i.cell === id && i.size === size);
      return [size, { n: list.length, mean: recallOf(list) }];
    }))]));

  const h1 = hypothesis("H1", "Пиктограммы запоминаются лучше римских цифр", "Пиктограммы", "Римские цифры",
    participants, (p) => [p.pictograms, p.roman]);
  const h2 = hypothesis("H2", "Крупные символы запоминаются лучше мелких", "Крупные", "Мелкие",
    participants, (p) => [p.large, p.small]);
  const interactionTest = pairedTest(participants.flatMap((p) => p.interactionDiff === null ? [] : [p.interactionDiff]));
  const sizeEffect = (small: CellId, large: CellId) => pairedTest(participants.flatMap((p) =>
    p.byCell[small] === null || p.byCell[large] === null ? [] : [p.byCell[large]! - p.byCell[small]!]));

  return {
    generatedAt: new Date().toISOString(),
    alpha: ALPHA,
    minParticipants: MIN_PARTICIPANTS,
    overview: {
      sessions: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      stopped: sessions.filter((s) => s.status === "stopped").length,
      withTrials: participants.length,
      trials: trials.length,
      symbols: items.length,
      meanAccuracy: mean(accuracies),
      meanRecall: recallOf(items),
      meanMissed: mean(trials.map((t) => t.missed_count)),
      meanExtra: mean(trials.map((t) => t.extra_count)),
      exactShare: trials.length ? (trials.filter((t) => t.exact).length / trials.length) * 100 : null
    },
    conditions: Object.fromEntries(conditionIds.map((id) => [id, conditions[id]])),
    cells,
    groups,
    recall,
    bySetSize,
    recallBySetSize,
    hypotheses: [h1, h2],
    interaction: {
      test: interactionTest,
      sizeEffectRoman: sizeEffect("RS", "RL"),
      sizeEffectPictograms: sizeEffect("PS", "PL")
    },
    participants
  };
}

export type Stats = ReturnType<typeof computeStats>;
