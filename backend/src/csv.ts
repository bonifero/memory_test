import type { TrialWithSession } from "./db.js";
import { conditions, conditionIds, notationLabels, setSizes, sizeLabels } from "./protocol.js";
import type { Stats } from "./stats.js";

// Semicolon separator, decimal comma and BOM: opens correctly in Excel with Russian locale.
type Cell = string | number | boolean | null | undefined;

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000).replace(".", ",") : "";
  let text = value;
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}

const statusLabels: Record<string, string> = { completed: "завершена", stopped: "досрочно" };
const digits = (json: string) => (JSON.parse(json) as number[]).join(" ");

export function trialsCsv(trials: TrialWithSession[]): string {
  const header = ["Сессия", "Имя", "Статус", "Начало", "Порядок блоков", "Испытание", "Условие", "Обозначение",
    "Размер символов", "Блок", "Испытание в блоке", "Объём набора", "Время показа, мс", "Фактический показ, мс",
    "Время ответа, мс", "Показано", "Ответ", "Пропущены", "Лишние", "Кол-во пропусков", "Кол-во лишних",
    "Точность, %", "Без ошибок", "Записано"];
  return toCsv([header, ...trials.map((t) => [
    t.session_id, t.participant, statusLabels[t.status] ?? t.status, t.started_at, t.order_index + 1, t.trial,
    t.condition, notationLabels[t.notation], sizeLabels[t.symbol_size], t.block, t.block_trial, t.set_size,
    t.duration_ms, t.actual_duration_ms, t.response_ms, digits(t.shown), digits(t.answer), digits(t.missed),
    digits(t.extra), t.missed_count, t.extra_count, t.accuracy, Boolean(t.exact), t.timestamp
  ])]);
}

const verdictLabels = {
  confirmed: "подтверждается", not_confirmed: "не подтверждается",
  opposite: "значимый эффект в обратную сторону", insufficient: "недостаточно данных"
};

export function statsCsv(stats: Stats): string {
  const o = stats.overview;
  const rows: Cell[][] = [
    ["Сводка"],
    ["Сессий", o.sessions], ["Завершено", o.completed], ["Досрочно", o.stopped], ["Испытаний", o.trials],
    ["Средняя точность, %", o.meanAccuracy], ["Без ошибок, %", o.exactShare],
    ["Пропусков за испытание", o.meanMissed], ["Лишних за испытание", o.meanExtra],
    [],
    ["Гипотезы (парный t-тест по участникам, α = 0,05)"],
    ["Гипотеза", "Уровень A", "Среднее A, %", "Уровень B", "Среднее B, %", "Разница, п.п.", "95% ДИ от", "95% ДИ до",
      "t", "df", "p", "dz", "Участников", "В пользу гипотезы", "Вывод"],
    ...stats.hypotheses.map((h) => [`${h.id}. ${h.title}`, h.levelA, h.meanA, h.levelB, h.meanB, h.test.meanDiff,
      h.test.ciLow, h.test.ciHigh, h.test.t, h.test.df, h.test.p, h.test.dz, h.test.n, h.test.supporting,
      verdictLabels[h.verdict]]),
    ["Взаимодействие: (D − C) − (B − A)", "", "", "", "", stats.interaction.test.meanDiff, stats.interaction.test.ciLow,
      stats.interaction.test.ciHigh, stats.interaction.test.t, stats.interaction.test.df, stats.interaction.test.p,
      stats.interaction.test.dz, stats.interaction.test.n],
    [],
    ["Условия"],
    ["Группа", "Испытаний", "Средняя точность, %", "SD", "95% ДИ от", "95% ДИ до", "Медиана", "Без ошибок, %",
      "Пропусков", "Лишних", "Время ответа, мс"],
    ...([...conditionIds.map((id) => [id, `${id}. ${conditions[id].label}`] as const),
      ["roman", notationLabels.roman], ["pictograms", notationLabels.pictograms],
      ["small", sizeLabels.small], ["large", sizeLabels.large]] as const).map(([key, label]) => {
      const g = stats.groups[key];
      return [label, g.n, g.mean, g.sd, g.ciLow, g.ciHigh, g.median, g.exactShare, g.meanMissed, g.meanExtra, g.meanResponseMs];
    }),
    [],
    ["Точность по объёму набора, %"],
    ["Условие", ...setSizes.map((s) => `${s} символов`)],
    ...conditionIds.map((id) => [`${id}. ${conditions[id].label}`,
      ...setSizes.map((s) => (stats.bySetSize[id] as Record<number, { mean: number | null }>)[s].mean)]),
    [],
    ["Участники"],
    ["Имя", "Сессия", "Статус", "Начало", "Испытаний", "Средняя точность, %", ...conditionIds.map((id) => `${id}, %`),
      "Пиктограммы − римские, п.п.", "Крупные − мелкие, п.п.", "За H1", "За H2"],
    ...stats.participants.map((p) => [p.participant, p.sessionId, statusLabels[p.status] ?? p.status, p.startedAt,
      p.trials, p.meanAccuracy, ...conditionIds.map((id) => p.byCondition[id]), p.notationDiff, p.sizeDiff,
      p.notationDiff === null ? null : p.notationDiff > 0, p.sizeDiff === null ? null : p.sizeDiff > 0])
  ];
  return toCsv(rows);
}
