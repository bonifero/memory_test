import { Fragment, useCallback, useEffect, useState } from "react";
import { Glyph } from "../Glyph";
import { GLYPH_CELL, TOTAL_TRIALS, conditionById, conditionLabel, type Notation } from "../protocol";
import { adminFetch, adminUrl, UnauthorizedError, type SessionDetail, type SessionSummary } from "./api";
import { fmtDate, fmtPct, fmtSeconds } from "./format";

function Symbols({ json, notation }: { json: string; notation: Notation }) {
  const digits = JSON.parse(json) as number[];
  if (!digits.length) return <span className="muted">пусто</span>;
  return (
    <span className="mini-symbols">
      {[...digits].sort((a, b) => a - b).map((d) => <Glyph key={d} digit={d} notation={notation} cell={GLYPH_CELL.admin} />)}
    </span>
  );
}

function SessionDetails({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    adminFetch<SessionDetail>(`/sessions/${encodeURIComponent(id)}`).then(setDetail).catch((e: Error) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
      setError(e.message);
    });
  }, [id, onUnauthorized]);
  if (error) return <p className="notice warn">{error}</p>;
  if (!detail) return <p className="muted">Загрузка…</p>;
  if (!detail.trials.length) return <p className="muted">В сессии нет сохранённых испытаний.</p>;
  return (
    <table className="data-table inner">
      <thead>
        <tr><th>№</th><th>Блок</th><th>Условие</th><th>Набор</th><th>Показано</th><th>Ответ</th>
          <th>Пропущено</th><th>Лишних</th><th>Точность</th><th>Время ответа</th></tr>
      </thead>
      <tbody>
        {detail.trials.map((t) => (
          <tr key={t.id}>
            <td>{t.trial}</td>
            <td>{t.block}.{t.block_trial}</td>
            <td><span className="cond-pill">{t.condition}</span> {conditionLabel(conditionById[t.condition])}</td>
            <td>{t.set_size} · {t.duration_ms / 1000} с</td>
            <td><Symbols json={t.shown} notation={t.notation} /></td>
            <td><Symbols json={t.answer} notation={t.notation} /></td>
            <td>{t.missed_count}</td>
            <td>{t.extra_count}</td>
            <td><strong className={t.exact ? "text-success" : ""}>{fmtPct(t.accuracy)}</strong></td>
            <td>{fmtSeconds(t.response_ms)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SessionsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const list = await adminFetch<SessionSummary[]>(`/sessions?q=${encodeURIComponent(q)}`);
      setSessions(list);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((s) => s.id === id))));
      setError("");
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  const remove = async (ids: string[]) => {
    const names = sessions.filter((s) => ids.includes(s.id)).map((s) => s.participant);
    const text = ids.length === 1
      ? `Удалить результаты «${names[0]}»? Действие нельзя отменить.`
      : `Удалить результаты ${ids.length} сессий? Действие нельзя отменить.`;
    if (!window.confirm(text)) return;
    try {
      await adminFetch("/sessions/delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids })
      });
      if (expanded && ids.includes(expanded)) setExpanded(null);
      await load(query);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = sessions.length > 0 && sessions.every((s) => selected.has(s.id));
  const selectedIds = [...selected];

  return (
    <div className="sessions-view">
      <div className="toolbar panel">
        <label className="field inline grow">
          <span className="visually-hidden">Поиск по имени</span>
          <input type="search" placeholder="Поиск по имени…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <span className="muted small">{selected.size ? `Выбрано ${selected.size}` : `Сессий: ${sessions.length}`}</span>
        <a className="button secondary small"
          href={adminUrl(`/export.csv${selected.size ? `?ids=${encodeURIComponent(selectedIds.join(","))}` : ""}`)}>
          {selected.size ? "Скачать выбранные CSV" : "Скачать все CSV"}
        </a>
        <button type="button" className="button danger small" disabled={!selected.size} onClick={() => void remove(selectedIds)}>
          Удалить выбранные
        </button>
      </div>

      {error && <p className="notice warn">{error}</p>}

      <section className="panel flush">
        <div className="table-wrap">
          <table className="data-table sessions-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" aria-label="Выбрать все" checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.id)))} />
                </th>
                <th>Участник</th><th>Начало</th><th>Статус</th><th>Пройдено</th><th>Точность</th>
                <th title="Римские · мелкие">A</th><th title="Римские · крупные">B</th>
                <th title="Пиктограммы · мелкие">C</th><th title="Пиктограммы · крупные">D</th><th />
              </tr>
            </thead>
            <tbody>
              {!loading && sessions.length === 0 && (
                <tr><td colSpan={11} className="empty-cell">{query ? "Никого не найдено." : "Пока нет результатов."}</td></tr>
              )}
              {sessions.map((s) => (
                <Fragment key={s.id}>
                  <tr className={`${selected.has(s.id) ? "is-selected" : ""} ${expanded === s.id ? "is-expanded" : ""}`}>
                    <td className="col-check">
                      <input type="checkbox" aria-label={`Выбрать ${s.participant}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                    <td>
                      <button type="button" className="link-button" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                        <span className="chevron" aria-hidden="true">{expanded === s.id ? "▾" : "▸"}</span>{s.participant}
                      </button>
                    </td>
                    <td>{fmtDate(s.started_at)}</td>
                    <td><span className={`status-pill ${s.status}`}>{s.status === "completed" ? "Завершена" : "Досрочно"}</span></td>
                    <td>{s.trials_count} / {s.total_planned ?? TOTAL_TRIALS}</td>
                    <td><strong>{fmtPct(s.mean_accuracy)}</strong></td>
                    <td>{fmtPct(s.acc_a, 0)}</td><td>{fmtPct(s.acc_b, 0)}</td><td>{fmtPct(s.acc_c, 0)}</td><td>{fmtPct(s.acc_d, 0)}</td>
                    <td className="col-actions">
                      <button type="button" className="icon-button" title="Удалить" aria-label={`Удалить ${s.participant}`}
                        onClick={() => void remove([s.id])}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr className="detail-row"><td colSpan={11}><SessionDetails id={s.id} onUnauthorized={onUnauthorized} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
