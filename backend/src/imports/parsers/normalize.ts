/**
 * Utilitas normalisasi nilai dari dokumen keuangan Indonesia
 * (format angka "1.234.567,89" maupun "1,234,567.89", tanggal dd/mm/yyyy, dst).
 */

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
};

/** Mengubah teks nominal menjadi string desimal "1234.56". Mengembalikan null bila tidak valid. */
export function parseAmount(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.abs(input).toFixed(2) : null;
  let s = String(input).trim();
  if (!s || s === '-') return null;
  s = s.replace(/\b(rp|idr)\.?/gi, '').replace(/\b(db|cr|dr|d|k|c)\b\.?$/i, '').replace(/[()\s]/g, '').replace(/^[-+]/, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Separator desimal = yang muncul terakhir
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 2 && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    normalized = decimals > 0 && decimals <= 2 && s.indexOf('.') === lastDot ? s : s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized).toFixed(2);
}

/** Tanda D/CR di belakang nominal (format mutasi BCA dll). */
export function amountDirection(input: unknown): 'DEBIT' | 'CREDIT' | null {
  const s = String(input ?? '').trim();
  if (/\b(db|dr|d|debit|debet)\.?$/i.test(s) || /^-/.test(s) || /^\(.*\)$/.test(s)) return 'DEBIT';
  if (/\b(cr|k|c|kredit|credit)\.?$/i.test(s)) return 'CREDIT';
  return null;
}

/** Mengubah teks tanggal menjadi "YYYY-MM-DD". `fallbackYear` dipakai bila tahun tidak tertulis. */
export function parseDate(input: unknown, fallbackYear?: number): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date && !isNaN(input.getTime())) return input.toISOString().slice(0, 10);
  const s = String(input).trim().toLowerCase();
  let y: number | undefined, m: number | undefined, d: number | undefined;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), fallbackYear];
  } else if ((match = s.match(/^(\d{1,2})[\s-]+([a-z]+)\.?[\s-]*(\d{2,4})?/))) {
    d = Number(match[1]);
    m = MONTHS[match[2]];
    y = match[3] ? Number(match[3]) : fallbackYear;
    if (y && y < 100) y += 2000;
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeDescription(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
