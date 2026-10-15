import type { ConditionId } from "../protocol";

export class UnauthorizedError extends Error {}

/** Admin API lives under /admin/api so the browser reuses the Basic credentials of the /admin page. */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/admin/api${path}`, { credentials: "same-origin", ...init });
  if (response.status === 401) throw new UnauthorizedError("Требуется авторизация");
  if (!response.ok) throw new Error(`Ошибка сервера: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const adminUrl = (path: string) => `/admin/api${path}`;

export interface Filter {
  completedOnly: boolean;
  from: string;
  to: string;
}

export function filterQuery(filter: Filter, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (filter.completedOnly) params.set("completedOnly", "1");
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface SessionSummary {
  id: string;
  participant: string;
  order_index: number;
  protocol: string;
  status: "completed" | "stopped";
  total_planned: number;
  started_at: string;
  ended_at: string | null;
  trials_count: number;
  mean_accuracy: number | null;
  acc_a: number | null;
  acc_b: number | null;
  acc_c: number | null;
  acc_d: number | null;
}

export interface TrialRow {
  id: number;
  trial: number;
  condition: ConditionId;
  /** Older protocols only: one notation and size for the whole set. */
  notation: string;
  symbol_size: string;
  block: number;
  block_trial: number;
  set_size: number;
  duration_ms: number;
  actual_duration_ms: number;
  response_ms: number;
  shown: string;
  shown_sizes: string | null;
  answer: string;
  missed_count: number;
  extra_count: number;
  accuracy: number;
  exact: number;
}

export interface SessionDetail extends Omit<SessionSummary, "trials_count" | "mean_accuracy" | "acc_a" | "acc_b" | "acc_c" | "acc_d"> {
  trials: TrialRow[];
}

export interface Description {
  n: number;
  mean: number | null;
  sd: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  median: number | null;
}

export interface GroupStats extends Description {
  exactShare: number | null;
  meanMissed: number | null;
  meanExtra: number | null;
  meanResponseMs: number | null;
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

export type Verdict = "confirmed" | "not_confirmed" | "opposite" | "insufficient";

export interface Hypothesis {
  id: string;
  title: string;
  levelA: string;
  levelB: string;
  meanA: number | null;
  meanB: number | null;
  test: PairedTest;
  verdict: Verdict;
}

export type CellId = "RS" | "RL" | "PS" | "PL";
export type FactorKey = "roman" | "pictograms" | "small" | "large";

export interface RecallStats extends Description {
  items: number;
  pooled: number | null;
}

export interface ParticipantStats {
  sessionId: string;
  participant: string;
  status: string;
  startedAt: string;
  trials: number;
  meanAccuracy: number | null;
  byCondition: Record<ConditionId, number | null>;
  byCell: Record<CellId, number | null>;
  notationDiff: number | null;
  sizeDiff: number | null;
  interactionDiff: number | null;
}

export interface Stats {
  generatedAt: string;
  alpha: number;
  minParticipants: number;
  overview: {
    sessions: number;
    completed: number;
    stopped: number;
    withTrials: number;
    trials: number;
    symbols: number;
    meanAccuracy: number | null;
    meanRecall: number | null;
    meanMissed: number | null;
    meanExtra: number | null;
    exactShare: number | null;
  };
  groups: Record<ConditionId, GroupStats>;
  recall: Record<CellId | FactorKey, RecallStats>;
  bySetSize: Record<ConditionId, Record<string, { n: number; mean: number | null }>>;
  recallBySetSize: Record<CellId, Record<string, { n: number; mean: number | null }>>;
  hypotheses: Hypothesis[];
  interaction: { test: PairedTest; sizeEffectRoman: PairedTest; sizeEffectPictograms: PairedTest };
  participants: ParticipantStats[];
}
