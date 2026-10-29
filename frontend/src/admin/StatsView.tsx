import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChartConfiguration, TooltipItem } from "chart.js";
import { conditionById, conditions, SET_SIZES, type ConditionId } from "../protocol";
import { adminFetch, adminUrl, filterQuery, type CellId, type FactorKey, type Filter, type Hypothesis, type PairedTest,
  type Stats, type Verdict, UnauthorizedError } from "./api";
import { ChartView, chartColors } from "./ChartView";
import { fmtDate, fmtDiff, fmtNum, fmtP, fmtPct, fmtSeconds, fmtT } from "./format";

const verdictView: Record<Verdict, { label: string; icon: string; tone: string }> = {
  confirmed: { label: "Подтверждается", icon: "✓", tone: "good" },
  not_confirmed: { label: "Не подтверждается", icon: "–", tone: "neutral" },
  opposite: { label: "Значимый эффект в обратную сторону", icon: "✕", tone: "bad" },
  insufficient: { label: "Недостаточно данных", icon: "…", tone: "warn" }
};

const percentAxis = {
  min: 0, max: 100,
  grid: { color: chartColors.grid },
  border: { display: false },
  ticks: { callback: (value: string | number) => `${value}%` },
  title: { display: true, text: "Средняя точность" }
};
const recallAxis = { ...percentAxis, title: { display: true, text: "Вспомнено символов" } };
const categoryAxis = { grid: { display: false }, border: { color: chartColors.grid } };

function percentTooltip(item: TooltipItem<"bar" | "line">) {
  const dataset = item.dataset as unknown as { label?: string; ci?: ([number, number] | null)[]; n?: number[]; unit?: string };
  const ci = dataset.ci?.[item.dataIndex];
  const n = dataset.n?.[item.dataIndex];
  return [`${dataset.label ?? ""}: ${fmtPct(item.parsed.y)}`,
    ...(ci ? [`95% ДИ: ${fmtNum(ci[0])}–${fmtNum(ci[1])}%`] : []),
    ...(n !== undefined ? [`${dataset.unit ?? "испытаний"}: ${n}`] : [])];
}

function testLine(test: PairedTest) {
  if (test.t === null) return `участников с парными данными: ${test.n}`;
  return `t(${test.df}) = ${fmtT(test.t)}, p = ${fmtP(test.p)}, dz = ${fmtNum(test.dz, 2)}`;
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const view = verdictView[verdict];
  return <span className={`verdict ${view.tone}`}><span aria-hidden="true">{view.icon}</span>{view.label}</span>;
}

function HypothesisCard({ h, minParticipants }: { h: Hypothesis; minParticipants: number }) {
  return (
    <article className="panel hypothesis">
      <div className="hypothesis-head">
        <span className="hypothesis-id">{h.id}</span>
        {/*<VerdictBadge verdict={h.verdict} />*/}
      </div>
      <h3>{h.title}</h3>
      <div className="versus">
        <div><span>{h.levelA}</span><strong>{fmtPct(h.meanA)}</strong></div>
        <span className="versus-sep">vs</span>
        <div><span>{h.levelB}</span><strong>{fmtPct(h.meanB)}</strong></div>
      </div>
      <dl className="facts">
        <div><dt>Разница</dt><dd>{fmtDiff(h.test.meanDiff)}</dd></div>
        <div><dt>95% ДИ разницы</dt><dd>{h.test.ciLow === null ? "—" : `${fmtNum(h.test.ciLow)} … ${fmtNum(h.test.ciHigh)}`}</dd></div>
        <div><dt>Парный t-тест</dt><dd>{testLine(h.test)}</dd></div>
        <div><dt>В пользу гипотезы</dt><dd>{h.test.supporting} из {h.test.n} участников</dd></div>
      </dl>
      {h.verdict === "insufficient" && (
        <p className="muted small">Для вывода нужно минимум {minParticipants} участника с результатами по обоим уровням фактора.</p>
      )}
    </article>
  );
}

const cells: { id: CellId; label: string; notation: "roman" | "pictograms"; small: boolean }[] = [
  { id: "RS", label: "Римские · мелкие", notation: "roman", small: true },
  { id: "RL", label: "Римские · крупные", notation: "roman", small: false },
  { id: "PS", label: "Пиктограммы · мелкие", notation: "pictograms", small: true },
  { id: "PL", label: "Пиктограммы · крупные", notation: "pictograms", small: false }
];

const recallRows: { key: CellId | FactorKey; label: string; factor?: boolean }[] = [
  ...cells.map((c) => ({ key: c.id, label: `${c.id}. ${c.label}` })),
  { key: "roman", label: "Все римские цифры", factor: true },
  { key: "pictograms", label: "Все пиктограммы", factor: true },
  { key: "small", label: "Все мелкие символы", factor: true },
  { key: "large", label: "Все крупные символы", factor: true }
];

/** Splits a long block label into chart label lines. */
const labelLines = (id: ConditionId) => {
  const [first, ...rest] = conditionById[id].label.split(/ · | \+ /);
  return [`${id}. ${first}`, ...rest];
};

export function StatsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [filter, setFilter] = useState<Filter>({ completedOnly: true, from: "", to: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await adminFetch<Stats>(`/stats${filterQuery(filter)}`));
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter, onUnauthorized]);

  useEffect(() => { void load(); }, [load]);

  const charts = useMemo(() => {
    if (!stats) return null;
    const g = stats.groups;
    const r = stats.recall;
    const ciOf = (key: CellId | FactorKey): [number, number] | null =>
      r[key].ciLow === null ? null : [r[key].ciLow!, r[key].ciHigh!];
    const factorBar = (keys: [FactorKey, FactorKey], labels: [string, string]): ChartConfiguration => ({
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Вспомнено",
          data: keys.map((k) => r[k].mean),
          backgroundColor: chartColors.emerald,
          borderRadius: 4,
          borderSkipped: "bottom",
          maxBarThickness: 72,
          ci: keys.map(ciOf),
          n: keys.map((k) => r[k].n),
          unit: "участников"
        } as never]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: percentTooltip } } },
        scales: { y: recallAxis, x: categoryAxis }
      }
    });
    const interaction: ChartConfiguration = {
      type: "line",
      data: {
        labels: ["Мелкие", "Крупные"],
        datasets: [
          { label: "Римские цифры", data: [r.RS.mean, r.RL.mean], borderColor: chartColors.amber, backgroundColor: chartColors.amber,
            borderWidth: 2, pointRadius: 6, pointHoverRadius: 8, pointBorderColor: "#fff", pointBorderWidth: 2,
            n: [r.RS.n, r.RL.n], unit: "участников", ci: [ciOf("RS"), ciOf("RL")] } as never,
          { label: "Пиктограммы", data: [r.PS.mean, r.PL.mean], borderColor: chartColors.emerald, backgroundColor: chartColors.emerald,
            borderWidth: 2, pointRadius: 6, pointHoverRadius: 8, pointBorderColor: "#fff", pointBorderWidth: 2,
            n: [r.PS.n, r.PL.n], unit: "участников", ci: [ciOf("PS"), ciOf("PL")] } as never
        ]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 24, right: 24 } },
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: percentTooltip } } },
        scales: { y: recallAxis, x: { ...categoryAxis, offset: true, title: { display: true, text: "Размер символов" } } }
      }
    };
    const setSize: ChartConfiguration = {
      type: "line",
      data: {
        labels: SET_SIZES.map((s) => `${s} символов`),
        datasets: cells.map((c) => {
          const color = c.notation === "roman" ? chartColors.amber : chartColors.emerald;
          return {
            label: `${c.id}. ${c.label}`,
            data: SET_SIZES.map((s) => stats.recallBySetSize[c.id][s]?.mean ?? null),
            n: SET_SIZES.map((s) => stats.recallBySetSize[c.id][s]?.n ?? 0),
            unit: "символов",
            borderColor: color, backgroundColor: color, borderWidth: 2,
            borderDash: c.small ? [6, 4] : [],
            pointStyle: c.small ? "rectRot" : "circle",
            pointRadius: 5, pointHoverRadius: 7, pointBorderColor: "#fff", pointBorderWidth: 1.5
          } as never;
        })
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: percentTooltip } } },
        scales: { y: recallAxis, x: { ...categoryAxis, title: { display: true, text: "Объём набора (время показа = числу символов, с)" } } }
      }
    };
    const errors: ChartConfiguration = {
      type: "bar",
      data: {
        labels: conditions.map((c) => labelLines(c.id)),
        datasets: [
          { label: "Пропущено", data: conditions.map((c) => g[c.id].meanMissed), backgroundColor: chartColors.slate,
            borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 40 },
          { label: "Лишние", data: conditions.map((c) => g[c.id].meanExtra), backgroundColor: chartColors.amber,
            borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 40 }
        ]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtNum(item.parsed.y, 2)} за испытание` } } },
        scales: {
          y: { beginAtZero: true, grid: { color: chartColors.grid }, border: { display: false },
            title: { display: true, text: "Среднее за испытание" } },
          x: categoryAxis
        }
      }
    };
    return {
      notation: factorBar(["roman", "pictograms"], ["Римские цифры", "Пиктограммы"]),
      size: factorBar(["small", "large"], ["Мелкие", "Крупные"]),
      interaction, setSize, errors
    };
  }, [stats]);

  const o = stats?.overview;
  const it = stats?.interaction;

  return (
    <div className="stats-view">
      <div className="toolbar panel">
        <label className="check-field">
          <input type="checkbox" checked={filter.completedOnly}
            onChange={(e) => setFilter({ ...filter, completedOnly: e.target.checked })} />
          Только завершённые сессии
        </label>
        <label className="field inline"><span>С</span>
          <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></label>
        <label className="field inline"><span>по</span>
          <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></label>
        <div className="toolbar-spacer" />
        <button type="button" className="button secondary small" onClick={() => void load()} disabled={loading}>
          {loading ? "Обновление…" : "Обновить"}
        </button>
        <a className="button secondary small" href={adminUrl(`/stats.csv${filterQuery(filter)}`)}>Статистика CSV</a>
        <a className="button primary small" href={adminUrl(`/export.csv${filterQuery(filter)}`)}>Сырые данные CSV</a>
      </div>

      {error && <p className="notice warn">{error}</p>}

      {stats && o && it && charts && (
        <>
          <section className="kpi-grid">
            <div className="kpi"><span>Сессий</span><strong>{o.sessions}</strong>
              <small>{o.completed} завершено · {o.stopped} досрочно</small></div>
            <div className="kpi"><span>Испытаний</span><strong>{o.trials}</strong>
              <small>участников с данными: {o.withTrials}</small></div>
            <div className="kpi"><span>Вспомнено символов</span><strong>{fmtPct(o.meanRecall)}</strong>
              <small>показано: {o.symbols}</small></div>
            <div className="kpi"><span>Средняя точность</span><strong>{fmtPct(o.meanAccuracy)}</strong>
              <small>без ошибок: {fmtPct(o.exactShare)}</small></div>
            <div className="kpi"><span>Ошибок за испытание</span><strong>{fmtNum(o.meanMissed, 2)} / {fmtNum(o.meanExtra, 2)}</strong>
              <small>пропуски / лишние</small></div>
          </section>

          {o.trials === 0 ? (
            <section className="panel empty-state">
              <h2>Пока нет данных</h2>
              <p className="muted">Результаты появятся после того, как тестируемые пройдут тест. Проверьте фильтры выше.</p>
            </section>
          ) : (
            <>
              <section className="hypothesis-grid">
                {stats.hypotheses.map((h) => <HypothesisCard key={h.id} h={h} minParticipants={stats.minParticipants} />)}
              </section>
              <p className="muted small method-note">
                В каждом наборе символы двух видов, поэтому факторы сравниваются по отдельным символам: для каждого участника
                считается доля вспомненных символов каждого вида (римские/пиктограммы × мелкие/крупные), уровень фактора —
                среднее двух его видов. Проверка — парный t-тест по участникам (α = {fmtNum(stats.alpha, 2)}); для плана 2×2
                с повторными измерениями это эквивалентно главному эффекту дисперсионного анализа (F = t²). dz — величина
                эффекта Коэна для парных данных. Лишние ответы нельзя отнести к размеру, они учитываются только в точности испытания.
              </p>

              <section className="chart-grid two">
                <article className="panel">
                  <h3>H1. Форма символа</h3>
                  <p className="muted small">Доля вспомненных символов, среднее по участникам, усы — 95% доверительный интервал.</p>
                  <ChartView config={charts.notation} label="Вспомнено: римские цифры и пиктограммы" />
                </article>
                <article className="panel">
                  <h3>H2. Размер символа</h3>
                  <p className="muted small">Доля вспомненных символов, среднее по участникам, усы — 95% доверительный интервал.</p>
                  <ChartView config={charts.size} label="Вспомнено: мелкие и крупные символы" />
                </article>
              </section>

              <section className="chart-grid two">
                <article className="panel">
                  <h3>Взаимодействие: форма × размер</h3>
                  <p className="muted small">Параллельные линии — размер одинаково влияет на обе формы записи.</p>
                  <ChartView config={charts.interaction} label="Вспомнено по размеру для римских цифр и пиктограмм" />
                  <dl className="facts compact">
                    <div><dt>Эффект размера, римские</dt><dd>{fmtDiff(it.sizeEffectRoman.meanDiff)} · {testLine(it.sizeEffectRoman)}</dd></div>
                    <div><dt>Эффект размера, пиктограммы</dt><dd>{fmtDiff(it.sizeEffectPictograms.meanDiff)} · {testLine(it.sizeEffectPictograms)}</dd></div>
                    <div><dt>Разница эффектов</dt><dd>{fmtDiff(it.test.meanDiff)} · {testLine(it.test)}</dd></div>
                  </dl>
                </article>
                <article className="panel">
                  <h3>Вспомнено по объёму набора</h3>
                  <p className="muted small">Доля вспомненных символов по всем показам. Цвет — форма записи, пунктир — мелкие
                    символы, сплошная — крупные.</p>
                  <ChartView config={charts.setSize} label="Вспомнено по объёму набора для четырёх видов символов" height={300} />
                </article>
              </section>

              <section className="panel">
                <h3>Вспомнено по видам символов</h3>
                <p className="muted small">Среднее, SD и ДИ — по участникам; «все символы» — доля по всем показам вместе.</p>
                <div className="table-wrap">
                  <table className="data-table numeric">
                    <thead>
                      <tr><th>Вид</th><th>Показано символов</th><th>Вспомнено (все символы)</th><th>Участников</th>
                        <th>Среднее по участникам</th><th>SD</th><th>95% ДИ</th><th>Медиана</th></tr>
                    </thead>
                    <tbody>
                      {recallRows.map(({ key, label, factor }) => {
                        const row = stats.recall[key];
                        return (
                          <tr key={key} className={factor ? "factor-row" : ""}>
                            <td>{label}</td><td>{row.items}</td><td>{fmtPct(row.pooled)}</td><td>{row.n}</td>
                            <td><strong>{fmtPct(row.mean)}</strong></td><td>{fmtNum(row.sd)}</td>
                            <td>{row.ciLow === null ? "—" : `${fmtNum(row.ciLow)}–${fmtNum(row.ciHigh)}`}</td>
                            <td>{fmtPct(row.median)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel">
                <h3>Показатели по блокам</h3>
                <p className="muted small">Точность испытания = (показано − пропущено − лишние) / показано.</p>
                <div className="table-wrap">
                  <table className="data-table numeric">
                    <thead>
                      <tr><th>Блок</th><th>Испытаний</th><th>Средняя точность</th><th>SD</th><th>95% ДИ</th>
                        <th>Медиана</th><th>Без ошибок</th><th>Пропусков</th><th>Лишних</th><th>Время ответа</th></tr>
                    </thead>
                    <tbody>
                      {conditions.map((c) => {
                        const row = stats.groups[c.id];
                        return (
                          <tr key={c.id}>
                            <td>{c.id}. {c.label}</td><td>{row.n}</td><td><strong>{fmtPct(row.mean)}</strong></td><td>{fmtNum(row.sd)}</td>
                            <td>{row.ciLow === null ? "—" : `${fmtNum(row.ciLow)}–${fmtNum(row.ciHigh)}`}</td>
                            <td>{fmtPct(row.median)}</td><td>{fmtPct(row.exactShare)}</td>
                            <td>{fmtNum(row.meanMissed, 2)}</td><td>{fmtNum(row.meanExtra, 2)}</td>
                            <td>{fmtSeconds(row.meanResponseMs)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="chart-grid two">
                <article className="panel">
                  <h3>Структура ошибок</h3>
                  <p className="muted small">Среднее число пропущенных и лишних символов за одно испытание.</p>
                  <ChartView config={charts.errors} label="Пропуски и лишние ответы по блокам" />
                </article>
                <article className="panel">
                  <h3>Точность испытаний по объёму набора</h3>
                  <div className="table-wrap">
                    <table className="data-table numeric">
                      <thead><tr><th>Блок</th>{SET_SIZES.map((s) => <th key={s}>{s} симв.</th>)}</tr></thead>
                      <tbody>
                        {(Object.keys(stats.bySetSize) as ConditionId[]).map((id) => (
                          <tr key={id}>
                            <td>{id}. {conditionById[id].label}</td>
                            {SET_SIZES.map((s) => <td key={s}>{fmtPct(stats.bySetSize[id][s]?.mean ?? null)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>

              <section className="panel">
                <h3>Результаты по участникам</h3>
                <p className="muted small">Доля вспомненных символов каждого вида и личные эффекты участника.
                  «За H1» — участник лучше запомнил пиктограммы, «За H2» — крупные символы.</p>
                <div className="table-wrap">
                  <table className="data-table numeric">
                    <thead>
                      <tr><th>Участник</th><th>Дата</th><th>Испытаний</th><th>Точность</th>
                        {cells.map((c) => <th key={c.id} title={c.label}>{c.id}</th>)}
                        <th>Пикт. − рим.</th><th>Крупн. − мелк.</th><th>За H1</th><th>За H2</th></tr>
                    </thead>
                    <tbody>
                      {stats.participants.map((p) => (
                        <tr key={p.sessionId}>
                          <td>{p.participant}{p.status === "stopped" && <span className="tag">досрочно</span>}</td>
                          <td>{fmtDate(p.startedAt)}</td><td>{p.trials}</td><td><strong>{fmtPct(p.meanAccuracy)}</strong></td>
                          {cells.map((c) => <td key={c.id}>{fmtPct(p.byCell[c.id])}</td>)}
                          <td>{fmtDiff(p.notationDiff)}</td><td>{fmtDiff(p.sizeDiff)}</td>
                          <td><Support value={p.notationDiff} /></td><td><Support value={p.sizeDiff} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="muted small">Обновлено {fmtDate(stats.generatedAt)}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Support({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  return value > 0
    ? <span className="support yes" title="В пользу гипотезы">✓ да</span>
    : <span className="support no" title="Не в пользу гипотезы">✕ нет</span>;
}
