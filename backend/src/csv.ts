import type { TrialWithSession } from "./db.js";
import { cellIds, cellOf, cells, conditionIds, conditions, digitOf, notationOf, pictogramNames, romanValues, setSizes,
  type SymbolSize } from "./protocol.js";
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
const sizeMarks: Record<SymbolSize, string> = { small: "м", large: "к" };
const symbol = (code: number) =>
  notationOf(code) === "roman" ? romanValues[digitOf(code)] : `${digitOf(code) || 1}×${pictogramNames[digitOf(code)]}`;
const symbols = (json: string, sizes?: SymbolSize[]) =>
  (JSON.parse(json) as number[]).map((code, i) => (sizes?.[i] ? `${symbol(code)}(${sizeMarks[sizes[i]]})` : symbol(code))).join(" ");

export function trialsCsv(trials: TrialWithSession[]): string {
  const header = ["Сессия", "Имя", "Статус", "Начало", "Порядок блоков", "Испытание", "Условие", "Описание условия",
    "Блок", "Испытание в блоке", "Объём набора", "Время показа, мс", "Фактический показ, мс",
    "Время ответа, мс", "Показано (м — мелкий, к — крупный)", "Ответ", "Пропущены", "Лишние", "Кол-во пропусков",
    "Кол-во лишних", "Точность, %", "Без ошибок",
    ...cellIds.flatMap((id) => [`${cells[id].label}: показано`, `${cells[id].label}: вспомнено`]), "Записано"];
  return toCsv([header, ...trials.map((t) => {
    const shown = JSON.parse(t.shown) as number[];
    const sizes = JSON.parse(t.shown_sizes ?? "[]") as SymbolSize[];
    const answer = new Set(JSON.parse(t.answer) as number[]);
    const perCell = cellIds.flatMap((id) => {
      const inCell = shown.filter((code, i) => sizes[i] && cellOf(notationOf(code), sizes[i]) === id);
      return [inCell.length, inCell.filter((code) => answer.has(code)).length];
    });
    return [
      t.session_id, t.participant, statusLabels[t.status] ?? t.status, t.started_at, t.order_index + 1, t.trial,
      t.condition, conditions[t.condition]?.label, t.block, t.block_trial, t.set_size,
      t.duration_ms, t.actual_duration_ms, t.response_ms, symbols(t.shown, sizes), symbols(t.answer), symbols(t.missed),
      symbols(t.extra), t.missed_count, t.extra_count, t.accuracy, Boolean(t.exact), ...perCell, t.timestamp
    ];
  })]);
}

const verdictLabels = {
  confirmed: "подтверждается", not_confirmed: "не подтверждается",
  opposite: "значимый эффект в обратную сторону", insufficient: "недостаточно данных"
};

export function statsCsv(stats: Stats): string {
  const o = stats.overview;
  const it = stats.interaction;
  const recallRow = (label: string, key: keyof Stats["recall"]) => {
    const r = stats.recall[key];
    return [label, r.items, r.pooled, r.n, r.mean, r.sd, r.ciLow, r.ciHigh, r.median];
  };
  const rows: Cell[][] = [
    ["Сводка"],
    ["Сессий", o.sessions], ["Завершено", o.completed], ["Досрочно", o.stopped], ["Испытаний", o.trials],
    ["Показано символов", o.symbols], ["Вспомнено символов, %", o.meanRecall],
    ["Средняя точность испытания, %", o.meanAccuracy], ["Без ошибок, %", o.exactShare],
    ["Пропусков за испытание", o.meanMissed], ["Лишних за испытание", o.meanExtra],
    [],
    ["Гипотезы (парный t-тест по участникам, α = 0,05; доля вспомненных символов каждого вида)"],
    ["Гипотеза", "Уровень A", "Среднее A, %", "Уровень B", "Среднее B, %", "Разница, п.п.", "95% ДИ от", "95% ДИ до",
      "t", "df", "p", "dz", "Участников", "В пользу гипотезы", "Вывод"],
    ...stats.hypotheses.map((h) => [`${h.id}. ${h.title}`, h.levelA, h.meanA, h.levelB, h.meanB, h.test.meanDiff,
      h.test.ciLow, h.test.ciHigh, h.test.t, h.test.df, h.test.p, h.test.dz, h.test.n, h.test.supporting,
      verdictLabels[h.verdict]]),
    ...([["Эффект размера, римские: RL − RS", it.sizeEffectRoman], ["Эффект размера, пиктограммы: PL − PS", it.sizeEffectPictograms],
      ["Взаимодействие: (PL − PS) − (RL − RS)", it.test]] as const).map(([label, t]) =>
      [label, "", "", "", "", t.meanDiff, t.ciLow, t.ciHigh, t.t, t.df, t.p, t.dz, t.n]),
    [],
    ["Вспомнено символов по видам, %"],
    ["Вид", "Показано символов", "Вспомнено (все символы), %", "Участников", "Среднее по участникам, %", "SD",
      "95% ДИ от", "95% ДИ до", "Медиана"],
    ...cellIds.map((id) => recallRow(`${id}. ${cells[id].label}`, id)),
    recallRow("Все римские цифры", "roman"), recallRow("Все пиктограммы", "pictograms"),
    recallRow("Все мелкие символы", "small"), recallRow("Все крупные символы", "large"),
    [],
    ["Вспомнено по объёму набора, %"],
    ["Вид", ...setSizes.map((s) => `${s} символов`)],
    ...cellIds.map((id) => [`${id}. ${cells[id].label}`,
      ...setSizes.map((s) => (stats.recallBySetSize[id] as Record<number, { mean: number | null }>)[s].mean)]),
    [],
    ["Блоки (точность испытания)"],
    ["Блок", "Испытаний", "Средняя точность, %", "SD", "95% ДИ от", "95% ДИ до", "Медиана", "Без ошибок, %",
      "Пропусков", "Лишних", "Время ответа, мс", ...setSizes.map((s) => `${s} символов, %`)],
    ...conditionIds.map((id) => {
      const g = stats.groups[id];
      return [`${id}. ${conditions[id].label}`, g.n, g.mean, g.sd, g.ciLow, g.ciHigh, g.median, g.exactShare,
        g.meanMissed, g.meanExtra, g.meanResponseMs,
        ...setSizes.map((s) => (stats.bySetSize[id] as Record<number, { mean: number | null }>)[s].mean)];
    }),
    [],
    ["Участники"],
    ["Имя", "Сессия", "Статус", "Начало", "Испытаний", "Средняя точность, %",
      ...conditionIds.map((id) => `Блок ${id}, %`), ...cellIds.map((id) => `${id}, % вспомнено`),
      "Пиктограммы − римские, п.п.", "Крупные − мелкие, п.п.", "За H1", "За H2"],
    ...stats.participants.map((p) => [p.participant, p.sessionId, statusLabels[p.status] ?? p.status, p.startedAt,
      p.trials, p.meanAccuracy, ...conditionIds.map((id) => p.byCondition[id]), ...cellIds.map((id) => p.byCell[id]),
      p.notationDiff, p.sizeDiff, p.notationDiff === null ? null : p.notationDiff > 0, p.sizeDiff === null ? null : p.sizeDiff > 0])
  ];
  return toCsv(rows);
}
