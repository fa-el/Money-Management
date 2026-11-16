export const TIMEZONE = "Asia/Jakarta";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export function formatMoney(value: string | number | null | undefined, currency = "IDR") {
  const n = Number(value ?? 0);
  if (currency !== "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  }
  return rupiah.format(n);
}

export function formatCompact(value: number) {
  return compact.format(value);
}

/** Tanggal dari kolom DATE ("2026-11-01T00:00:00.000Z") atau timestamp. */
export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "-";
  const s = typeof value === "string" ? value : value.toISOString();
  // Kolom DATE disimpan pada 00:00 UTC — tampilkan apa adanya tanpa geser zona
  const isDateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(s);
  return new Intl.DateTimeFormat("id-ID", { ...opts, timeZone: isDateOnly ? "UTC" : TIMEZONE }).format(new Date(isDateOnly ? s.slice(0, 10) : s));
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" untuk hari ini di zona aplikasi. */
export function today() {
  return localDate(new Date());
}

export function localDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

/** Nilai untuk <input type="datetime-local"> dari ISO timestamp (zona aplikasi). */
export function toDatetimeLocal(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Nilai datetime-local (dianggap waktu Asia/Jakarta, UTC+7) -> ISO string. */
export function fromDatetimeLocal(value: string) {
  return `${value}:00+07:00`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthRange(offset = 0, base = today()) {
  const [y, m] = base.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function monthLabel(date: string) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatBytes(n: number | string) {
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

/** Input nominal: buang pemisah ribuan, pakai titik untuk desimal. */
export function parseAmountInput(value: string) {
  const cleaned = value.replace(/[^\d,]/g, "").replace(",", ".");
  return cleaned;
}
