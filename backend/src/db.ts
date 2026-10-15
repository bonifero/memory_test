import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { PROTOCOL_VERSION, conditionNotations, score, type ConditionId, type SymbolSize } from "./protocol.js";

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    participant TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    status TEXT NOT NULL,
    total_planned INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    trial INTEGER NOT NULL,
    case_id TEXT NOT NULL,
    condition TEXT NOT NULL,
    notation TEXT NOT NULL,
    symbol_size TEXT NOT NULL,
    block INTEGER NOT NULL,
    block_trial INTEGER NOT NULL,
    set_size INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    actual_duration_ms INTEGER NOT NULL,
    response_ms INTEGER NOT NULL,
    shown TEXT NOT NULL,
    answer TEXT NOT NULL,
    missed TEXT NOT NULL,
    extra TEXT NOT NULL,
    missed_count INTEGER NOT NULL,
    extra_count INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    exact INTEGER NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS trials_session_idx ON trials(session_id);
`);
// Mixed sets: size of every shown symbol, aligned with `shown`. NULL for sessions of older protocols.
if (!(db.prepare("PRAGMA table_info(trials)").all() as { name: string }[]).some((c) => c.name === "shown_sizes")) {
  db.exec("ALTER TABLE trials ADD COLUMN shown_sizes TEXT");
}

export interface TrialInput {
  trial: number;
  caseId: string;
  condition: ConditionId;
  block: number;
  blockTrial: number;
  size: number;
  durationMs: number;
  actualDurationMs: number;
  responseMs: number;
  shown: number[];
  shownSizes: SymbolSize[];
  answer: number[];
  timestamp: string;
}

export interface SessionInput {
  id: string;
  participant: string;
  orderIndex: number;
  protocol: string;
  status: "completed" | "stopped";
  totalPlanned: number;
  startedAt: string;
  endedAt?: string;
  results: TrialInput[];
}

export interface SessionRow {
  id: string;
  participant: string;
  order_index: number;
  protocol: string;
  status: string;
  total_planned: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface TrialRow {
  id: number;
  session_id: string;
  trial: number;
  case_id: string;
  condition: ConditionId;
  /** "roman", "pictograms" or "mixed" when the set has both. */
  notation: string;
  /** Always "mixed" in the current protocol; per-symbol sizes are in `shown_sizes`. */
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
  missed: string;
  extra: string;
  missed_count: number;
  extra_count: number;
  accuracy: number;
  exact: number;
  timestamp: string;
}

export type TrialWithSession = TrialRow & Pick<SessionRow, "participant" | "status" | "started_at" | "order_index">;

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, participant, order_index, protocol, status, total_planned, started_at, ended_at)
  VALUES (@id, @participant, @orderIndex, @protocol, @status, @totalPlanned, @startedAt, @endedAt)
  ON CONFLICT(id) DO UPDATE SET participant = excluded.participant, status = excluded.status, ended_at = excluded.ended_at
`);
const deleteTrials = db.prepare("DELETE FROM trials WHERE session_id = ?");
const insertTrial = db.prepare(`
  INSERT INTO trials (session_id, trial, case_id, condition, notation, symbol_size, block, block_trial, set_size,
    duration_ms, actual_duration_ms, response_ms, shown, shown_sizes, answer, missed, extra, missed_count, extra_count,
    accuracy, exact, timestamp)
  VALUES (@sessionId, @trial, @caseId, @condition, @notation, @symbolSize, @block, @blockTrial, @size,
    @durationMs, @actualDurationMs, @responseMs, @shown, @shownSizes, @answer, @missed, @extra, @missedCount, @extraCount,
    @accuracy, @exact, @timestamp)
`);

// Re-sending the same session (retry after a network error) replaces its trials.
export const saveSession = db.transaction((session: SessionInput) => {
  upsertSession.run({ ...session, endedAt: session.endedAt ?? null });
  deleteTrials.run(session.id);
  for (const trial of session.results) {
    // Score on the server so stored numbers never depend on the client.
    const result = score(trial.shown, trial.answer);
    const notations = conditionNotations(trial.condition);
    insertTrial.run({
      ...trial,
      sessionId: session.id,
      notation: notations.length > 1 ? "mixed" : notations[0],
      symbolSize: "mixed",
      shown: JSON.stringify(trial.shown),
      shownSizes: JSON.stringify(trial.shownSizes),
      answer: JSON.stringify(trial.answer),
      missed: JSON.stringify(result.missed),
      extra: JSON.stringify(result.extra),
      missedCount: result.missed.length,
      extraCount: result.extra.length,
      accuracy: result.accuracy,
      exact: result.exact ? 1 : 0
    });
  }
});

export function countSessions(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
}

export function listSessions(query: string) {
  return db.prepare(`
    SELECT s.*, COUNT(t.id) AS trials_count, AVG(t.accuracy) AS mean_accuracy,
      AVG(CASE WHEN t.condition = 'A' THEN t.accuracy END) AS acc_a,
      AVG(CASE WHEN t.condition = 'B' THEN t.accuracy END) AS acc_b,
      AVG(CASE WHEN t.condition = 'C' THEN t.accuracy END) AS acc_c,
      AVG(CASE WHEN t.condition = 'D' THEN t.accuracy END) AS acc_d
    FROM sessions s LEFT JOIN trials t ON t.session_id = s.id
    WHERE s.participant LIKE @q ESCAPE '\\'
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all({ q: `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%` });
}

export function getSession(id: string) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!session) return undefined;
  const trials = db.prepare("SELECT * FROM trials WHERE session_id = ? ORDER BY trial").all(id) as TrialRow[];
  return { ...session, trials };
}

export function deleteSessions(ids: string[]): number {
  const remove = db.prepare("DELETE FROM sessions WHERE id = ?");
  return db.transaction(() => ids.reduce((sum, id) => sum + remove.run(id).changes, 0))();
}

export interface TrialFilter {
  completedOnly?: boolean;
  from?: string;
  to?: string;
  ids?: string[];
}

export function selectTrials(filter: TrialFilter): TrialWithSession[] {
  // Statistics only make sense for one protocol: older sessions used different conditions.
  const where: string[] = ["s.protocol = @protocol"];
  const params: Record<string, unknown> = { protocol: PROTOCOL_VERSION };
  if (filter.completedOnly) where.push("s.status = 'completed'");
  if (filter.from) { where.push("s.started_at >= @from"); params.from = filter.from; }
  if (filter.to) { where.push("s.started_at < @to"); params.to = filter.to; }
  if (filter.ids?.length) {
    where.push(`s.id IN (${filter.ids.map((_, i) => `@id${i}`).join(", ")})`);
    filter.ids.forEach((id, i) => { params[`id${i}`] = id; });
  }
  return db.prepare(`
    SELECT t.*, s.participant, s.status, s.started_at, s.order_index
    FROM trials t JOIN sessions s ON s.id = t.session_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.started_at, t.trial
  `).all(params) as TrialWithSession[];
}

export function selectSessions(filter: TrialFilter): SessionRow[] {
  const where: string[] = ["protocol = @protocol"];
  const params: Record<string, unknown> = { protocol: PROTOCOL_VERSION };
  if (filter.completedOnly) where.push("status = 'completed'");
  if (filter.from) { where.push("started_at >= @from"); params.from = filter.from; }
  if (filter.to) { where.push("started_at < @to"); params.to = filter.to; }
  return db.prepare(`SELECT * FROM sessions WHERE ${where.join(" AND ")}`)
    .all(params) as SessionRow[];
}
