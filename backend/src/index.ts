import express, { type ErrorRequestHandler, type Request } from "express";
import { z } from "zod";
import { basicAuth } from "./auth.js";
import { config } from "./config.js";
import { statsCsv, trialsCsv } from "./csv.js";
import { countSessions, db, deleteSessions, getSession, listSessions, saveSession, selectSessions,
  selectTrials, type TrialFilter } from "./db.js";
import { PROTOCOL_VERSION, conditionNotations, conditions, notationOf, setSizes, totalTrials } from "./protocol.js";
import { computeStats } from "./stats.js";

// Roman numerals are 0–9, pictograms 10–19.
const code = z.number().int().min(0).max(19);
const trialSchema = z.object({
  trial: z.number().int().min(1).max(totalTrials),
  caseId: z.string().max(40),
  condition: z.enum(["A", "B", "C", "D"]),
  block: z.number().int().min(1).max(4),
  blockTrial: z.number().int().min(1).max(3),
  size: z.number().int().refine((v) => (setSizes as readonly number[]).includes(v)),
  durationMs: z.number().int().min(0).max(60_000),
  actualDurationMs: z.number().int().min(0).max(600_000),
  responseMs: z.number().int().min(0).max(86_400_000),
  shown: z.array(code).min(1).max(10),
  shownSizes: z.array(z.enum(["small", "large"])).min(1).max(10),
  answer: z.array(code).max(20),
  timestamp: z.string().max(40)
}).refine((t) => t.shownSizes.length === t.shown.length && new Set(t.shown.map((c) => c % 10)).size === t.shown.length,
  "shownSizes must match shown, digits must be distinct"
).refine((t) => t.shown.every((c, i) => conditions[t.condition].kinds.some((k) =>
  k.notation === notationOf(c) && k.symbolSize === t.shownSizes[i])), "shown symbols do not match the condition"
).refine((t) => t.answer.every((c) => conditionNotations(t.condition).includes(notationOf(c))),
  "answer contains a notation that was not offered");

const sessionSchema = z.object({
  id: z.string().min(1).max(100),
  participant: z.string().trim().min(1).max(100),
  orderIndex: z.number().int().min(0).max(3),
  protocol: z.literal(PROTOCOL_VERSION),
  status: z.enum(["completed", "stopped"]),
  totalPlanned: z.number().int().min(1).max(100),
  startedAt: z.string().max(40),
  endedAt: z.string().max(40).optional(),
  results: z.array(trialSchema).max(totalTrials)
});

const filterSchema = z.object({
  completedOnly: z.enum(["0", "1"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ids: z.string().max(10_000).optional()
});

function parseFilter(req: Request): TrialFilter {
  const query = filterSchema.parse(req.query);
  // "to" is inclusive in the UI, so compare against the start of the next day.
  const to = query.to ? new Date(Date.parse(query.to) + 86_400_000).toISOString().slice(0, 10) : undefined;
  return {
    completedOnly: query.completedOnly === "1",
    from: query.from,
    to,
    ids: query.ids ? query.ids.split(",").filter(Boolean) : undefined
  };
}

function sendCsv(res: express.Response, name: string, body: string) {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${name}"`);
  res.send(body);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ status: "ok" });
});

// Latin-square order is assigned round-robin across all saved sessions.
app.get("/api/sessions/next-order", (_req, res) => {
  res.json({ orderIndex: countSessions() % 4 });
});

app.post("/api/sessions", (req, res) => {
  const session = sessionSchema.parse(req.body?.session);
  saveSession(session);
  res.status(201).json({ id: session.id, saved: session.results.length });
});

const admin = express.Router();
admin.use(basicAuth);

admin.get("/auth-check", (_req, res) => { res.status(204).end(); });

admin.get("/sessions", (req, res) => {
  res.json(listSessions(typeof req.query.q === "string" ? req.query.q.trim() : ""));
});

admin.get("/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  res.json(session);
});

admin.delete("/sessions/:id", (req, res) => {
  res.json({ deleted: deleteSessions([req.params.id]) });
});

admin.post("/sessions/delete", (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().max(100)).min(1).max(1000) }).parse(req.body);
  res.json({ deleted: deleteSessions(ids) });
});

admin.get("/export.csv", (req, res) => {
  const filter = parseFilter(req);
  sendCsv(res, "memory-test-results.csv", trialsCsv(selectTrials(filter)));
});

admin.get("/stats", (req, res) => {
  const filter = parseFilter(req);
  res.json(computeStats(selectTrials(filter), selectSessions(filter)));
});

admin.get("/stats.csv", (req, res) => {
  const filter = parseFilter(req);
  sendCsv(res, "memory-test-stats.csv", statsCsv(computeStats(selectTrials(filter), selectSessions(filter))));
});

app.use("/api/admin", admin);

app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.issues });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend listening on :${config.port}, database ${config.dbPath}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
