import { maskAccountNumbers } from '../../common/util';
import { amountDirection, parseAmount, parseDate } from './normalize';

export interface StatementLine {
  rowIndex: number;
  kind: 'LINE' | 'OPENING_BALANCE' | 'ENDING_BALANCE';
  date: string | null;
  description: string;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedStatement {
  lines: StatementLine[];
  openingBalance: string | null;
  endingBalance: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
}

const COLUMN_PATTERNS: Record<'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance' | 'direction', RegExp> = {
  date: /^(tanggal|tgl|date|tanggal transaksi|transaction date|posting date|tgl\.? transaksi|value date)/i,
  description: /(keterangan|deskripsi|description|uraian|remark|narasi|detail|transaksi$|berita)/i,
  debit: /^(debit|debet|db|mutasi debit|pengeluaran|keluar|withdrawal|uang keluar)/i,
  credit: /^(kredit|credit|cr|mutasi kredit|pemasukan|masuk|deposit|uang masuk)/i,
  amount: /^(jumlah|nominal|amount|mutasi|nilai)/i,
  balance: /^(saldo|balance|saldo akhir)/i,
  direction: /^(d\/k|db\/cr|dk|type|jenis|tipe)$/i,
};

type ColumnMap = Partial<Record<keyof typeof COLUMN_PATTERNS, number>>;

function detectHeader(rows: string[][]): { headerIndex: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const map: ColumnMap = {};
    rows[i].forEach((cell, col) => {
      const c = String(cell ?? '').trim();
      if (!c) return;
      for (const [key, re] of Object.entries(COLUMN_PATTERNS) as [keyof typeof COLUMN_PATTERNS, RegExp][]) {
        if (map[key] === undefined && re.test(c)) {
          map[key] = col;
          break;
        }
      }
    });
    const hasAmount = map.debit !== undefined || map.credit !== undefined || map.amount !== undefined;
    if (map.date !== undefined && hasAmount) return { headerIndex: i, map };
  }
  return null;
}

/**
 * Parser tabel mutasi generik untuk CSV/XLSX e-statement. Mengenali kolom berdasarkan
 * nama header (Bahasa Indonesia/Inggris), mendukung kolom debit/kredit terpisah maupun
 * satu kolom nominal dengan penanda DB/CR.
 */
export function parseStatementTable(rows: string[][]): ParsedStatement {
  const warnings: string[] = [];
  const header = detectHeader(rows);
  if (!header) {
    throw new Error(
      'Format tidak dikenali: header kolom tanggal dan nominal (debit/kredit/jumlah) tidak ditemukan dalam 30 baris pertama.',
    );
  }
  const { headerIndex, map } = header;
  const headers = rows[headerIndex].map((h, i) => String(h || `kolom_${i + 1}`).trim());

  // Cari tahun dari teks periode di atas header (mis. "Periode: 01/11/2026 - 30/11/2026")
  const preamble = rows.slice(0, headerIndex).flat().join(' ');
  const periodMatch = preamble.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|s\.?d\.?|sampai|to)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  let periodStart = periodMatch ? parseDate(periodMatch[1]) : null;
  let periodEnd = periodMatch ? parseDate(periodMatch[2]) : null;
  const fallbackYear = Number((periodEnd ?? periodStart ?? new Date().toISOString()).slice(0, 4));

  // Kolom penanda DB/CR tanpa judul tepat di sebelah kolom nominal (format mutasi BCA, dll.)
  if (map.amount !== undefined && map.direction === undefined) {
    const next = map.amount + 1;
    const sample = rows.slice(headerIndex + 1, headerIndex + 40).map((r) => String(r?.[next] ?? '').trim()).filter(Boolean);
    if (sample.length && sample.every((v) => /^(db|cr|dr|d|k|c|debit|debet|kredit|credit)$/i.test(v))) map.direction = next;
  }

  const lines: StatementLine[] = [];
  let previousBalance: string | null = null;
  let openingBalance: string | null = null;
  let endingBalance: string | null = null;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;
    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => (raw[h] = row[idx] ?? ''));
    const cell = (k: keyof ColumnMap) => (map[k] !== undefined ? String(row[map[k]!] ?? '').trim() : '');

    const description = maskAccountNumbers(cell('description') || row.filter((_, idx) => idx !== map.date).join(' ').trim());
    const text = `${cell('date')} ${description}`.toLowerCase();
    const balance = parseAmount(cell('balance'));

    if (/saldo\s*awal|opening\s*balance|beginning\s*balance/.test(text)) {
      openingBalance = balance ?? parseAmount(cell('credit')) ?? parseAmount(cell('amount'));
      previousBalance = openingBalance;
      lines.push({ rowIndex: i, kind: 'OPENING_BALANCE', date: parseDate(cell('date'), fallbackYear), description, debit: null, credit: null, balance: openingBalance, raw });
      continue;
    }
    if (/saldo\s*akhir|closing\s*balance|ending\s*balance/.test(text)) {
      endingBalance = balance ?? parseAmount(cell('credit')) ?? parseAmount(cell('amount'));
      lines.push({ rowIndex: i, kind: 'ENDING_BALANCE', date: parseDate(cell('date'), fallbackYear), description, debit: null, credit: null, balance: endingBalance, raw });
      continue;
    }
    if (/^(total|jumlah|mutasi\s*(debet|debit|kredit|credit))\b/.test(description.toLowerCase()) && !cell('date')) continue;

    const date = parseDate(cell('date'), fallbackYear);
    if (!date) continue; // baris lanjutan/catatan kaki

    let debit: string | null = null;
    let credit: string | null = null;
    if (map.debit !== undefined || map.credit !== undefined) {
      debit = parseAmount(cell('debit'));
      credit = parseAmount(cell('credit'));
      if (debit && Number(debit) === 0) debit = null;
      if (credit && Number(credit) === 0) credit = null;
    } else {
      const amountText = cell('amount');
      const amount = parseAmount(amountText);
      const dir =
        amountDirection(amountText) ??
        (map.direction !== undefined ? amountDirection(cell('direction')) ?? (/^(d|db|dr|debit|debet)/i.test(cell('direction')) ? 'DEBIT' : 'CREDIT') : null);
      // Tanpa penanda arah: simpulkan dari perubahan saldo berjalan
      const inferred =
        !dir && balance && previousBalance ? (Number(balance) < Number(previousBalance) ? 'DEBIT' : 'CREDIT') : null;
      if (amount) {
        if ((dir ?? inferred) === 'DEBIT') debit = amount;
        else if ((dir ?? inferred) === 'CREDIT') credit = amount;
        else {
          debit = amount;
          warnings.push(`Baris ${i + 1}: arah transaksi tidak diketahui, dianggap debit — mohon periksa.`);
        }
      }
    }
    if (!debit && !credit) continue;
    if (balance) previousBalance = balance;

    lines.push({ rowIndex: i, kind: 'LINE', date, description, debit, credit, balance, raw });
  }

  const dates = lines.filter((l) => l.kind === 'LINE' && l.date).map((l) => l.date!).sort();
  periodStart = periodStart ?? dates[0] ?? null;
  periodEnd = periodEnd ?? dates[dates.length - 1] ?? null;

  // Bila saldo awal tidak tertulis, turunkan dari saldo berjalan baris pertama
  const txLines = lines.filter((l) => l.kind === 'LINE');
  if (!openingBalance && txLines[0]?.balance) {
    const first = txLines[0];
    openingBalance = (Number(first.balance) + Number(first.debit ?? 0) - Number(first.credit ?? 0)).toFixed(2);
  }
  if (!endingBalance && txLines.length && txLines[txLines.length - 1].balance) {
    endingBalance = txLines[txLines.length - 1].balance;
  }
  if (!txLines.length) warnings.push('Tidak ada baris transaksi yang terbaca.');
  return { lines, openingBalance, endingBalance, periodStart, periodEnd, warnings };
}
