import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

/** "YYYY-MM-DD" -> Date (UTC midnight), cocok untuk kolom DATE. */
export function toDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Format tanggal tidak valid: ${value}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new BadRequestException(`Tanggal tidak valid: ${value}`);
  return d;
}

/** Date (kolom DATE) -> "YYYY-MM-DD". */
export function dateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Tanggal lokal (zona aplikasi) dari sebuah timestamp, format "YYYY-MM-DD". */
export function localDateString(d: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function todayLocal(): string {
  return localDateString(new Date());
}

/** Tambah hari/minggu/bulan/tahun ke tanggal "YYYY-MM-DD" (aman untuk akhir bulan). */
export function addPeriod(dateStr: string, frequency: string, count = 1): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  switch (frequency) {
    case 'DAILY':
      base.setUTCDate(base.getUTCDate() + count);
      break;
    case 'WEEKLY':
      base.setUTCDate(base.getUTCDate() + 7 * count);
      break;
    case 'MONTHLY':
    case 'YEARLY': {
      const months = frequency === 'MONTHLY' ? count : 12 * count;
      const target = new Date(Date.UTC(y, m - 1 + months, 1));
      const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      target.setUTCDate(Math.min(d, lastDay));
      return dateOnlyString(target);
    }
    default:
      throw new Error(`Frekuensi tidak dikenal: ${frequency}`);
  }
  return dateOnlyString(base);
}

export function decimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Format nominal Rupiah untuk pesan notifikasi. */
export function formatRupiah(value: Prisma.Decimal | number | string): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(
    Number(value),
  );
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function paginate<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

/** Samarkan deretan angka panjang (nomor rekening/kartu): 1234567890 -> ******7890 */
export function maskAccountNumbers(text: string): string {
  return text.replace(/\b\d[\d\s-]{6,}\d\b/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 8) return match;
    return '*'.repeat(digits.length - 4) + digits.slice(-4);
  });
}
