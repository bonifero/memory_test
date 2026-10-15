const number = (value: number, digits: number) =>
  value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtNum = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : number(value, digits);

export const fmtPct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "—" : `${number(value, digits)}%`;

export const fmtDiff = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value), digits)} п.п.`;

export const fmtP = (p: number | null) =>
  p === null ? "—" : p < 0.001 ? "< 0,001" : number(p, 3);

export const fmtT = (t: number | null) =>
  t === null ? "—" : Number.isFinite(t) ? number(t, 2) : t > 0 ? "+∞" : "−∞";

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtSeconds = (ms: number | null) => (ms === null ? "—" : `${number(ms / 1000, 1)} с`);
