import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "../Glyph";
import {
  BLOCK_LENGTH, DIGITS, GLYPH_CELL, ORDERS, PROTOCOL_VERSION, TOTAL_TRIALS, codeOf, conditionLabel, conditionNotations,
  conditions, describeSymbol, digitOf, makePlan, notationLabels, notationOf, romanValues, score, trainingPlan,
  type Code, type Trial
} from "../protocol";

interface TrialResult extends Trial {
  trial: number;
  answer: number[];
  missed: number[];
  extra: number[];
  accuracy: number;
  exact: boolean;
  actualDurationMs: number;
  responseMs: number;
  timestamp: string;
}

interface Session {
  id: string;
  participant: string;
  orderIndex: number;
  protocol: string;
  status: "active" | "completed" | "stopped";
  totalPlanned: number;
  startedAt: string;
  endedAt?: string;
  plan: Trial[];
  results: TrialResult[];
}

interface Store {
  active: Session | null;
  /** Finished sessions that have not reached the server yet. */
  pending: Session[];
}

type Phase = "participant" | "ready" | "countdown" | "stimulus" | "answer" | "result" | "complete";
type UploadState = "idle" | "sending" | "ok" | "error";

const STORE_KEY = "memory-test-v1";

function loadStore(): Store {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Store | null;
    if (saved && Array.isArray(saved.pending) && (saved.active === null || saved.active.protocol === PROTOCOL_VERSION)) {
      return saved;
    }
  } catch { /* corrupted or unavailable storage — start fresh */ }
  return { active: null, pending: [] };
}

async function postSession(session: Session): Promise<boolean> {
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: { ...session, plan: undefined,
        results: session.results.map((result) => ({ ...result, condition: result.id })) } })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function SymbolSet({ codes, cell, empty = "Ничего не выбрано" }: { codes: Code[]; cell: number; empty?: string }) {
  if (!codes.length) return <p className="muted set-empty">{empty}</p>;
  return (
    <div className="symbol-set">
      {[...codes].sort((a, b) => a - b).map((code) => (
        <span className="symbol-chip" key={code}><Glyph digit={digitOf(code)} notation={notationOf(code)} cell={cell} /></span>
      ))}
    </div>
  );
}

function SymbolTable() {
  return (
    <table className="symbol-table">
      <thead><tr><th>Число</th><th>Римская запись</th><th>Пиктограмма</th></tr></thead>
      <tbody>
        {DIGITS.map((digit) => (
          <tr key={digit}>
            <td>{digit}</td>
            <td className="roman-cell">{romanValues[digit]}</td>
            <td><Glyph digit={digit} notation="pictograms" cell={GLYPH_CELL.table} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TestApp() {
  const [store, setStore] = useState<Store>(loadStore);
  const [phase, setPhase] = useState<Phase>(() =>
    !store.active ? "participant" : store.active.status === "active" ? "ready" : "complete");
  const [message, setMessage] = useState(store.active?.status === "active"
    ? "Сохранённый прогресс восстановлен. Следующее испытание начнётся с обратного отсчёта." : "");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [training, setTraining] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<TrialResult | null>(null);
  const [upload, setUpload] = useState<UploadState>(() =>
    store.active && store.pending.some((p) => p.id === store.active!.id) ? "sending" : "ok");
  const [storageWarning, setStorageWarning] = useState(false);

  const shownAt = useRef(0);
  const actualDuration = useRef(0);
  const answerStartedAt = useRef(0);

  const session = store.active;
  const current: Trial | undefined = training !== null ? trainingPlan[training] : session?.plan[session.results.length];

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, [store]);

  const sendPending = useCallback(async (sessions: Session[]) => {
    for (const item of sessions) {
      if (await postSession(item)) {
        setStore((prev) => ({ ...prev, pending: prev.pending.filter((p) => p.id !== item.id) }));
      } else {
        return false;
      }
    }
    return true;
  }, []);

  // Retry uploads that failed in a previous visit.
  useEffect(() => {
    if (!store.pending.length) return;
    void sendPending(store.pending).then((ok) => setUpload(ok ? "ok" : "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown 3-2-1, then the stimulus.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) { setPhase("stimulus"); return; }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, countdown]);

  // Stimulus exposure.
  useEffect(() => {
    if (phase !== "stimulus" || !current) return;
    shownAt.current = performance.now();
    const timer = window.setTimeout(() => {
      actualDuration.current = Math.round(performance.now() - shownAt.current);
      answerStartedAt.current = performance.now();
      setPhase("answer");
    }, current.durationMs);
    return () => window.clearTimeout(timer);
  }, [phase, current]);

  const beginTrial = () => {
    setSelected([]);
    setCountdown(3);
    setMessage("");
    setPhase("countdown");
  };

  // A trial interrupted by leaving the tab is not recorded and is repeated later.
  useEffect(() => {
    const interrupt = () => {
      if (!document.hidden || !["countdown", "stimulus", "answer"].includes(phase)) return;
      setSelected([]);
      if (training !== null) {
        setTraining(null);
        setMessage("Тренировка прервана при уходе со страницы. Можно запустить её заново.");
      } else {
        setMessage("Испытание прервано при уходе со страницы и не записано. Нажмите «Продолжить», чтобы повторить его.");
      }
      setPhase("ready");
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, [phase, training]);

  const confirmParticipant = async () => {
    const participant = name.trim();
    if (!participant) { setNameError(true); return; }
    setNameError(false);
    let orderIndex = Math.floor(Math.random() * ORDERS.length);
    try {
      const response = await fetch("/api/sessions/next-order");
      if (response.ok) orderIndex = (await response.json()).orderIndex;
    } catch { /* offline — random order is still balanced on average */ }
    const newSession: Session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      participant, orderIndex, protocol: PROTOCOL_VERSION, status: "active", totalPlanned: TOTAL_TRIALS,
      startedAt: new Date().toISOString(), plan: makePlan(orderIndex), results: []
    };
    setStore((prev) => ({ ...prev, active: newSession }));
    setMessage("");
    setUpload("idle");
    setPhase("ready");
  };

  const finishSession = (finished: Session) => {
    setStore((prev) => ({ active: finished, pending: [...prev.pending.filter((p) => p.id !== finished.id), finished] }));
    setUpload("sending");
    void postSession(finished).then((ok) => {
      setUpload(ok ? "ok" : "error");
      if (ok) setStore((prev) => ({ ...prev, pending: prev.pending.filter((p) => p.id !== finished.id) }));
    });
    setPhase("complete");
  };

  const submitAnswer = () => {
    if (!current || phase !== "answer") return;
    const answer = [...selected].sort((a, b) => a - b);
    const result: TrialResult = {
      ...current, ...score(current.shown, answer), answer,
      trial: training !== null ? training + 1 : session!.results.length + 1,
      actualDurationMs: actualDuration.current,
      responseMs: Math.round(performance.now() - answerStartedAt.current),
      timestamp: new Date().toISOString()
    };
    setLastResult(result);
    if (training !== null) {
      setTraining(training + 1);
    } else if (session) {
      const results = [...session.results, result];
      const done = results.length === TOTAL_TRIALS;
      setStore((prev) => ({ ...prev, active: { ...session, results,
        ...(done ? { status: "completed" as const, endedAt: result.timestamp } : {}) } }));
    }
    setPhase("result");
  };

  const nextTrial = () => {
    if (training !== null) {
      if (training >= trainingPlan.length) {
        setTraining(null);
        setMessage("Тренировка завершена. Можно начинать тестирование.");
        setPhase("ready");
      } else {
        beginTrial();
      }
      return;
    }
    if (!session) return;
    if (session.status === "completed") { finishSession(session); return; }
    if (current?.blockTrial === 1) {
      setMessage("Блок завершён. Сделайте небольшой перерыв и продолжайте, когда будете готовы.");
      setPhase("ready");
    } else {
      beginTrial();
    }
  };

  const finishEarly = () => {
    setSelected([]);
    if (training !== null) {
      setTraining(null);
      setMessage("Тренировка прервана. Можно начать её заново или перейти к тестированию.");
      setPhase("ready");
      return;
    }
    if (!session || session.status !== "active") return;
    if (!window.confirm("Завершить тестирование досрочно? Будут сохранены только уже отправленные ответы.")) return;
    finishSession({ ...session, status: "stopped", endedAt: new Date().toISOString() });
  };

  const newParticipant = () => {
    setStore((prev) => ({ ...prev, active: null }));
    setName("");
    setLastResult(null);
    setUpload("idle");
    setMessage("");
    setPhase("participant");
  };

  const toggle = (code: Code) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const progress = training !== null
    ? `Тренировка ${Math.min(training + 1, trainingPlan.length)} / ${trainingPlan.length}`
    : `${session?.results.length ?? 0} / ${TOTAL_TRIALS}`;
  const showFinish = training !== null || (session?.status === "active" && phase !== "participant" && phase !== "complete");

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Лабораторная работа · ПЧМИ</p>
          <h1>Кратковременная память</h1>
          <p className="subtitle">Римские цифры и пиктограммы: влияние формы и размера символов на запоминание.</p>
        </div>
        <div className="hero-aside">
          <div className="progress-badge"><span>{training !== null ? "Режим" : "Пройдено"}</span><strong>{progress}</strong></div>
          {showFinish && (
            <button type="button" className="button ghost" onClick={finishEarly}>
              {training !== null ? "Выйти из тренировки" : "Завершить досрочно"}
            </button>
          )}
        </div>
      </header>

      {storageWarning && (
        <p className="notice warn">Браузер не может сохранить прогресс. Не закрывайте страницу до конца тестирования.</p>
      )}

      {phase === "participant" && (
        <section className="panel narrow">
          <p className="eyebrow">Новый участник</p>
          <h2>Как зовут тестируемого?</h2>
          <form className="name-form" onSubmit={(event) => { event.preventDefault(); void confirmParticipant(); }}>
            <label className="field">
              <span>Имя тестируемого</span>
              <input autoFocus value={name} maxLength={100} placeholder="Например, Иван Петров"
                onChange={(event) => setName(event.target.value)} aria-invalid={nameError} />
            </label>
            {nameError && <p className="field-error">Введите имя тестируемого.</p>}
            <button type="submit" className="button primary">Продолжить</button>
          </form>
        </section>
      )}

      {phase === "ready" && session && current && (
        <div className="ready-grid">
          <section className="panel">
            <div className="participant-row">
              <div><span className="muted">Тестируемый</span><strong>{session.participant}</strong></div>
              <div><span className="muted">Следующее испытание</span>
                <strong>Блок {current.block} из 4 · испытание {current.blockTrial} из {BLOCK_LENGTH}</strong></div>
            </div>
            <p className={`notice ${message ? "info" : ""}`}>
              {message || "Нажмите кнопку, когда будете готовы. После отсчёта 3–2–1 появится набор."}
            </p>
            <div className="next-condition">
              <span className="muted">Условие</span>
              <strong>{conditionLabel(current)}</strong>
              <span className="muted">{current.size} символов · показ {current.durationMs / 1000} с</span>
            </div>
            <div className="actions">
              <button type="button" className="button primary" onClick={beginTrial}>
                {session.results.length ? "Продолжить тестирование" : "Начать тестирование"}
              </button>
              {session.results.length === 0 && (
                <button type="button" className="button secondary" onClick={() => { setTraining(0); beginTrial(); }}>
                  Начать тренировку
                </button>
              )}
            </div>
            <h3>Как проходить тест</h3>
            <ol className="steps">
              <li>Перед каждым набором появится отсчёт 3–2–1.</li>
              <li>Запомните символы: 3 символа показываются 3 секунды, 5 — 5 секунд, 8 — 8 секунд.
                В каждом наборе символы разного размера, а в двух блоках ещё и римские цифры вместе с пиктограммами.</li>
              <li>Отметьте все символы, которые увидели. Порядок не важен. Если в наборе были и римские цифры, и пиктограммы,
                отмечайте символ в том виде, в каком он был показан. Если ничего не запомнили, отправьте пустой ответ.</li>
              <li>Посмотрите число пропусков и лишних ответов и переходите дальше.</li>
            </ol>
            <h3>Порядок блоков</h3>
            <ol className="block-plan">
              {ORDERS[session.orderIndex].map((index, position) => (
                <li key={index} className={position + 1 < current.block ? "done" : position + 1 === current.block ? "current" : ""}>
                  {conditionLabel(conditions[index])}
                </li>
              ))}
            </ol>
          </section>
          <aside className="panel">
            <h3>Обозначения</h3>
            <p className="muted small">Число фигур в пиктограмме равно цифре. Ноль — пустое кольцо, в римской записи — N.
              Все символы одного цвета, отличаются только форма и размер.</p>
            <SymbolTable />
          </aside>
        </div>
      )}

      {phase === "countdown" && current && (
        <section className="panel stage">
          <p className="eyebrow">{current.training ? "Тренировка · " : ""}{conditionLabel(current)}</p>
          <p className="muted">Приготовьтесь</p>
          <div className="countdown" key={countdown}>{countdown}</div>
        </section>
      )}

      {phase === "stimulus" && current && (
        <section className="panel stage">
          <p className="eyebrow">Запомните набор</p>
          <div className="stimulus-grid">
            {current.shown.map((code, i) => (
              <div className="stimulus-card" key={code}>
                <Glyph digit={digitOf(code)} notation={notationOf(code)} cell={GLYPH_CELL[current.shownSizes[i]]} />
              </div>
            ))}
          </div>
          <div className="timer-track"><div className="timer-bar" style={{ animationDuration: `${current.durationMs}ms` }} /></div>
        </section>
      )}

      {phase === "answer" && current && (
        <section className="panel stage">
          <p className="eyebrow">{current.training ? "Тренировка · " : ""}{conditionLabel(current)}</p>
          <h2>Какие символы были в наборе?</h2>
          <p className="muted">Порядок выбора не учитывается. Можно отправить пустой ответ.</p>
          {conditionNotations(current.id).map((notation, _i, notations) => (
            <div className="answer-group" key={notation}>
              {notations.length > 1 && <h3>{notationLabels[notation]}</h3>}
              <div className="answer-grid">
                {DIGITS.map((digit) => {
                  const code = codeOf(notation, digit);
                  const isSelected = selected.includes(code);
                  return (
                    <button type="button" key={code} className={`answer-option${isSelected ? " selected" : ""}`}
                      aria-pressed={isSelected} aria-label={describeSymbol(notation, digit)} onClick={() => toggle(code)}>
                      <Glyph digit={digit} notation={notation} cell={GLYPH_CELL.answer} />
                      <span className="check" aria-hidden="true">✓</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="actions center">
            <span className="counter">Выбрано {selected.length}</span>
            <button type="button" className="button primary" onClick={submitAnswer}>Сохранить ответ</button>
          </div>
        </section>
      )}

      {phase === "result" && lastResult && (
        <section className="panel stage">
          <p className="eyebrow">{lastResult.training ? "Тренировка · " : ""}{conditionLabel(lastResult)}</p>
          <h2 className={lastResult.exact ? "text-success" : "text-amber"}>
            {lastResult.exact ? "Без ошибок!" : `Точность ${lastResult.accuracy.toLocaleString("ru-RU")}%`}
          </h2>
          <div className="result-metrics">
            <div className="metric"><span>Пропущено</span><strong>{lastResult.missed.length}</strong></div>
            <div className="metric"><span>Лишних</span><strong>{lastResult.extra.length}</strong></div>
            <div className="metric"><span>Точность</span><strong>{lastResult.accuracy.toLocaleString("ru-RU")}%</strong></div>
          </div>
          <div className="compare">
            <div><h3>Показанный набор</h3>
              <SymbolSet codes={lastResult.shown} cell={GLYPH_CELL.table} /></div>
            <div><h3>Ответ участника</h3>
              <SymbolSet codes={lastResult.answer} cell={GLYPH_CELL.table} /></div>
          </div>
          <div className="actions center">
            <button type="button" className="button primary" onClick={nextTrial}>
              {training !== null
                ? (training >= trainingPlan.length ? "Завершить тренировку" : "Следующая тренировка")
                : session?.status === "completed" ? "Завершить тестирование"
                  : current?.blockTrial === 1 ? "Перейти к следующему блоку" : "Следующее испытание"}
            </button>
            {training === null && session?.status === "active" && (
              <button type="button" className="button secondary" onClick={() => {
                setMessage("Можно сделать перерыв. Прогресс сохранён.");
                setPhase("ready");
              }}>Сделать перерыв</button>
            )}
          </div>
        </section>
      )}

      {phase === "complete" && session && (
        <section className="panel">
          <p className="eyebrow">{session.status === "stopped" ? "Завершено досрочно" : "Все блоки пройдены"}</p>
          <h2>Спасибо за участие, {session.participant}!</h2>
          <p className="muted">Пройдено испытаний: {session.results.length} из {TOTAL_TRIALS}.</p>
          <p className={`notice ${upload === "ok" ? "success" : upload === "error" ? "warn" : "info"}`} role="status">
            {upload === "sending" && "Отправка результатов на сервер…"}
            {upload === "ok" && "Результаты сохранены на сервере."}
            {upload === "error" && "Не удалось отправить результаты. Они сохранены в браузере и будут отправлены при следующем открытии страницы."}
            {upload === "idle" && "Результаты сохраняются."}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Условие</th><th>Испытаний</th><th>Пропущено</th><th>Лишних</th><th>Средняя точность</th></tr></thead>
              <tbody>
                {conditions.map((condition) => {
                  const list = session.results.filter((r) => r.id === condition.id);
                  const avg = list.length ? list.reduce((s, r) => s + r.accuracy, 0) / list.length : null;
                  return (
                    <tr key={condition.id}>
                      <td>{conditionLabel(condition)}</td>
                      <td>{list.length}</td>
                      <td>{list.reduce((s, r) => s + r.missed.length, 0)}</td>
                      <td>{list.reduce((s, r) => s + r.extra.length, 0)}</td>
                      <td>{avg === null ? "—" : `${avg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="button primary" onClick={newParticipant}>Следующий участник</button>
          </div>
        </section>
      )}
    </div>
  );
}
