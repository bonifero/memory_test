import { useCallback, useEffect, useState } from "react";
import { SessionsView } from "./SessionsView";
import { StatsView } from "./StatsView";

type Tab = "stats" | "sessions";
const tabFromHash = (): Tab => (window.location.hash === "#sessions" ? "sessions" : "stats");

export function AdminApp() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [unauthorized, setUnauthorized] = useState(false);
  const onUnauthorized = useCallback(() => setUnauthorized(true), []);

  useEffect(() => {
    document.title = "Админка — исследование памяти";
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app-shell wide">
      <header className="hero compact">
        <div>
          <p className="eyebrow">Панель администратора</p>
          <h1>Результаты исследования</h1>
          <p className="subtitle">Проверка гипотез: пиктограммы против римских цифр, крупные символы против мелких.</p>
        </div>
        <div className="hero-aside">
          <a className="button ghost" href="/">← К тестированию</a>
        </div>
      </header>

      <nav className="tabs" aria-label="Разделы">
        <a href="#stats" className={tab === "stats" ? "active" : ""} aria-current={tab === "stats" ? "page" : undefined}>Статистика</a>
        <a href="#sessions" className={tab === "sessions" ? "active" : ""} aria-current={tab === "sessions" ? "page" : undefined}>Результаты по участникам</a>
      </nav>

      {unauthorized && (
        <p className="notice warn">Сессия авторизации истекла. <a href="/admin">Обновите страницу</a> и войдите снова.</p>
      )}

      {tab === "stats" ? <StatsView onUnauthorized={onUnauthorized} /> : <SessionsView onUnauthorized={onUnauthorized} />}
    </div>
  );
}
