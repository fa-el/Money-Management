import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { addPeriod, APP_TIMEZONE, todayLocal } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CashflowQuery, CategoryReportQuery, ReportQuery } from './reports.dto';

const ZERO = new Prisma.Decimal(0);

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/** Jumlah bulan bila from = tanggal 1 dan to = akhir bulan, selain itu null. */
function fullMonths(from: string, to: string): number | null {
  if (!from.endsWith('-01') || addPeriod(to, 'DAILY', 1).slice(8) !== '01') return null;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * Laporan dihitung langsung dari transaksi berstatus VALID yang tidak dihapus.
 * Transfer tidak dihitung sebagai pemasukan/pengeluaran ruang (bagian 9.2).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  resolveRange(q: ReportQuery) {
    const today = todayLocal();
    const from = q.from ?? `${today.slice(0, 7)}-01`;
    const to = q.to ?? addPeriod(addPeriod(`${today.slice(0, 7)}-01`, 'MONTHLY'), 'DAILY', -1);
    if (to < from) throw new BadRequestException('Tanggal akhir harus setelah tanggal awal');
    if (daysBetween(from, to) > 366 * 5) throw new BadRequestException('Rentang laporan maksimal 5 tahun');
    return { from, to };
  }

  private filters(spaceId: string, from: string, to: string, q: ReportQuery) {
    return Prisma.sql`
      t.finance_space_id = ${spaceId}::uuid AND t.status = 'VALID' AND t.deleted_at IS NULL
      AND t.transaction_date >= (${from}::date::timestamp AT TIME ZONE ${APP_TIMEZONE})
      AND t.transaction_date <  ((${to}::date + 1)::timestamp AT TIME ZONE ${APP_TIMEZONE})
      ${q.accountId ? Prisma.sql`AND (t.account_id = ${q.accountId}::uuid OR t.destination_account_id = ${q.accountId}::uuid)` : Prisma.empty}
      ${q.categoryId ? Prisma.sql`AND t.category_id = ${q.categoryId}::uuid` : Prisma.empty}`;
  }

  private async totals(spaceId: string, from: string, to: string, q: ReportQuery) {
    const [row] = await this.prisma.$queryRaw<
      { income: Prisma.Decimal | null; expense: Prisma.Decimal | null; transfer: Prisma.Decimal | null; count: number }[]
    >`
      SELECT
        SUM(t.amount) FILTER (WHERE t.type = 'INCOME')   AS income,
        SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE')  AS expense,
        SUM(t.amount) FILTER (WHERE t.type = 'TRANSFER') AS transfer,
        COUNT(*)::int AS count
      FROM transactions t WHERE ${this.filters(spaceId, from, to, q)}`;
    const income = new Prisma.Decimal(row?.income ?? 0);
    const expense = new Prisma.Decimal(row?.expense ?? 0);
    return { income, expense, transfer: new Prisma.Decimal(row?.transfer ?? 0), count: row?.count ?? 0 };
  }

  async summary(spaceId: string, q: ReportQuery) {
    const { from, to } = this.resolveRange(q);
    // Periode pembanding: bila rentang berupa bulan penuh, bandingkan dengan bulan-bulan sebelumnya;
    // selain itu gunakan rentang dengan jumlah hari yang sama tepat sebelum `from`.
    const prevTo = addPeriod(from, 'DAILY', -1);
    let prevFrom: string;
    const months = fullMonths(from, to);
    if (months) prevFrom = addPeriod(from, 'MONTHLY', -months);
    else prevFrom = addPeriod(prevTo, 'DAILY', -daysBetween(from, to));

    const [cur, prev, balances] = await Promise.all([
      this.totals(spaceId, from, to, q),
      this.totals(spaceId, prevFrom, prevTo, q),
      this.accounts.summary(spaceId, to < todayLocal() ? to : undefined),
    ]);
    const pct = (a: Prisma.Decimal, b: Prisma.Decimal) =>
      b.eq(0) ? null : Math.round(a.minus(b).div(b.abs()).toNumber() * 1000) / 10;
    const net = cur.income.minus(cur.expense);
    const prevNet = prev.income.minus(prev.expense);
    const totalBalance = q.accountId
      ? balances.data.find((a) => a.id === q.accountId)?.balance ?? '0.00'
      : balances.totalBalance;

    return {
      period: { from, to },
      income: cur.income.toFixed(2),
      expense: cur.expense.toFixed(2),
      net: net.toFixed(2),
      transfer: cur.transfer.toFixed(2),
      transactionCount: cur.count,
      totalBalance,
      savingsRate: cur.income.eq(0) ? null : Math.round(net.div(cur.income).toNumber() * 1000) / 10,
      previous: {
        period: { from: prevFrom, to: prevTo },
        income: prev.income.toFixed(2),
        expense: prev.expense.toFixed(2),
        net: prevNet.toFixed(2),
      },
      change: {
        income: pct(cur.income, prev.income),
        expense: pct(cur.expense, prev.expense),
        net: pct(net, prevNet),
      },
    };
  }

  async cashflow(spaceId: string, q: CashflowQuery) {
    const { from, to } = this.resolveRange(q);
    const span = daysBetween(from, to);
    const groupBy = q.groupBy ?? (span <= 62 ? 'day' : span <= 731 ? 'month' : 'year');
    const unit = Prisma.raw(`'${groupBy}'`);
    const rows = await this.prisma.$queryRaw<{ bucket: Date; income: Prisma.Decimal | null; expense: Prisma.Decimal | null }[]>`
      SELECT date_trunc(${unit}, t.transaction_date AT TIME ZONE ${APP_TIMEZONE})::date AS bucket,
             SUM(t.amount) FILTER (WHERE t.type = 'INCOME')  AS income,
             SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE') AS expense
      FROM transactions t
      WHERE ${this.filters(spaceId, from, to, q)} AND t.type <> 'TRANSFER'
      GROUP BY 1 ORDER BY 1`;
    const map = new Map(rows.map((r) => [r.bucket.toISOString().slice(0, 10), r]));

    // Isi periode kosong agar grafik kontinu
    const step = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[groupBy];
    const truncate = (d: string) => {
      if (groupBy === 'month') return `${d.slice(0, 7)}-01`;
      if (groupBy === 'year') return `${d.slice(0, 4)}-01-01`;
      if (groupBy === 'week') {
        const date = new Date(`${d}T00:00:00Z`);
        const dow = (date.getUTCDay() + 6) % 7; // Senin = 0 (ISO, sama dengan date_trunc)
        return addPeriod(d, 'DAILY', -dow);
      }
      return d;
    };
    const series: { period: string; income: string; expense: string; net: string }[] = [];
    for (let cursor = truncate(from); cursor <= to; cursor = addPeriod(cursor, step)) {
      const r = map.get(cursor);
      const income = new Prisma.Decimal(r?.income ?? 0);
      const expense = new Prisma.Decimal(r?.expense ?? 0);
      series.push({ period: cursor, income: income.toFixed(2), expense: expense.toFixed(2), net: income.minus(expense).toFixed(2) });
    }
    return { period: { from, to }, groupBy, series };
  }

  async categories(spaceId: string, q: CategoryReportQuery) {
    const { from, to } = this.resolveRange(q);
    const type = q.type ?? 'EXPENSE';
    const rows = await this.prisma.$queryRaw<
      { category_id: string | null; name: string | null; icon: string | null; color: string | null; total: Prisma.Decimal; count: number }[]
    >`
      SELECT t.category_id, c.name, c.icon, c.color, SUM(t.amount) AS total, COUNT(*)::int AS count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE ${this.filters(spaceId, from, to, q)} AND t.type = ${type}::transaction_type
      GROUP BY t.category_id, c.name, c.icon, c.color
      ORDER BY total DESC`;
    const grand = rows.reduce((s, r) => s.plus(r.total), ZERO);
    return {
      period: { from, to },
      type,
      total: grand.toFixed(2),
      data: rows.map((r) => ({
        categoryId: r.category_id,
        name: r.name ?? 'Tanpa kategori',
        icon: r.icon,
        color: r.color ?? '#94a3b8',
        total: new Prisma.Decimal(r.total).toFixed(2),
        count: r.count,
        percentage: grand.eq(0) ? 0 : Math.round(new Prisma.Decimal(r.total).div(grand).toNumber() * 1000) / 10,
      })),
    };
  }

  /** Ringkasan per akun: saldo awal periode, arus masuk/keluar, saldo akhir periode. */
  async accountsReport(spaceId: string, q: ReportQuery) {
    const { from, to } = this.resolveRange(q);
    const dayBefore = addPeriod(from, 'DAILY', -1);
    const [opening, closing, flows] = await Promise.all([
      this.accounts.listWithBalances(spaceId, dayBefore),
      this.accounts.listWithBalances(spaceId, to),
      this.prisma.$queryRaw<
        { account_id: string; income: Prisma.Decimal | null; expense: Prisma.Decimal | null; transfer_in: Prisma.Decimal | null; transfer_out: Prisma.Decimal | null }[]
      >`
        SELECT a.id AS account_id,
          SUM(t.amount) FILTER (WHERE t.type = 'INCOME'   AND t.account_id = a.id)             AS income,
          SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'  AND t.account_id = a.id)             AS expense,
          SUM(t.amount) FILTER (WHERE t.type = 'TRANSFER' AND t.destination_account_id = a.id) AS transfer_in,
          SUM(t.amount) FILTER (WHERE t.type = 'TRANSFER' AND t.account_id = a.id)             AS transfer_out
        FROM accounts a
        JOIN transactions t ON (t.account_id = a.id OR t.destination_account_id = a.id)
        WHERE a.finance_space_id = ${spaceId}::uuid AND ${this.filters(spaceId, from, to, {})}
        GROUP BY a.id`,
    ]);
    const flowMap = new Map(flows.map((f) => [f.account_id, f]));
    const openMap = new Map(opening.map((a) => [a.id, a]));
    return {
      period: { from, to },
      data: closing.map((a) => {
        const f = flowMap.get(a.id);
        // Akun yang dibuka setelah awal periode: saldo awal periode = saldo awalnya sendiri
        const openedLater = a.openingBalanceDate.toISOString().slice(0, 10) > dayBefore;
        return {
          accountId: a.id,
          name: a.name,
          type: a.type,
          isActive: a.isActive,
          openingBalance: openedLater ? a.openingBalance : openMap.get(a.id)?.balance ?? a.openingBalance,
          income: new Prisma.Decimal(f?.income ?? 0).toFixed(2),
          expense: new Prisma.Decimal(f?.expense ?? 0).toFixed(2),
          transferIn: new Prisma.Decimal(f?.transfer_in ?? 0).toFixed(2),
          transferOut: new Prisma.Decimal(f?.transfer_out ?? 0).toFixed(2),
          closingBalance: a.balance,
        };
      }),
    };
  }
}
