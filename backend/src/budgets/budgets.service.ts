import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { addPeriod, APP_TIMEZONE, dateOnlyString, formatRupiah, toDateOnly } from '../common/util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';

/** Ambang peringatan pemakaian anggaran */
export const BUDGET_WARNING_RATIO = 0.8;

function budgetStatus(ratio: number) {
  if (ratio > 1) return 'OVER';
  if (ratio >= BUDGET_WARNING_RATIO) return 'WARNING';
  return 'OK';
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Realisasi = total pengeluaran VALID kategori tsb di rentang tanggal anggaran. */
  private async spentFor(budgetIds: string[]) {
    if (!budgetIds.length) return new Map<string, Prisma.Decimal>();
    const rows = await this.prisma.$queryRaw<{ id: string; spent: Prisma.Decimal | null }[]>`
      SELECT b.id, COALESCE(SUM(t.amount), 0) AS spent
      FROM budgets b
      LEFT JOIN transactions t
        ON t.category_id = b.category_id AND t.finance_space_id = b.finance_space_id
       AND t.type = 'EXPENSE' AND t.status = 'VALID' AND t.deleted_at IS NULL
       AND (t.transaction_date AT TIME ZONE ${APP_TIMEZONE})::date BETWEEN b.start_date AND b.end_date
      WHERE b.id = ANY(${budgetIds}::uuid[])
      GROUP BY b.id`;
    return new Map(rows.map((r) => [r.id, new Prisma.Decimal(r.spent ?? 0)]));
  }

  async list(spaceId: string, activeOn?: string) {
    const where: Prisma.BudgetWhereInput = { financeSpaceId: spaceId, deletedAt: null };
    if (activeOn) {
      const d = toDateOnly(activeOn);
      where.startDate = { lte: d };
      where.endDate = { gte: d };
    }
    const budgets = await this.prisma.budget.findMany({
      where,
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'asc' }],
    });
    const spent = await this.spentFor(budgets.map((b) => b.id));
    return budgets.map((b) => {
      const used = spent.get(b.id) ?? new Prisma.Decimal(0);
      const ratio = used.div(b.amount).toNumber();
      return {
        ...b,
        spent: used.toFixed(2),
        remaining: b.amount.minus(used).toFixed(2),
        usage: Math.round(ratio * 1000) / 10, // persen, 1 desimal
        status: budgetStatus(ratio),
      };
    });
  }

  private async assertExpenseCategory(spaceId: string, categoryId: string) {
    const c = await this.prisma.category.findFirst({ where: { id: categoryId, financeSpaceId: spaceId, deletedAt: null } });
    if (!c) throw new BadRequestException('Kategori tidak ditemukan di ruang ini');
    if (c.type !== 'EXPENSE') throw new BadRequestException('Anggaran hanya untuk kategori pengeluaran');
  }

  async create(user: AuthUser, spaceId: string, dto: CreateBudgetDto) {
    await this.assertExpenseCategory(spaceId, dto.categoryId);
    const endDate = dto.endDate ?? addPeriod(addPeriod(dto.startDate, dto.period), 'DAILY', -1);
    if (endDate < dto.startDate) throw new BadRequestException('Tanggal akhir harus setelah tanggal mulai');
    const overlap = await this.prisma.budget.findFirst({
      where: {
        financeSpaceId: spaceId,
        categoryId: dto.categoryId,
        deletedAt: null,
        startDate: { lte: toDateOnly(endDate) },
        endDate: { gte: toDateOnly(dto.startDate) },
      },
    });
    if (overlap) throw new BadRequestException('Sudah ada anggaran untuk kategori ini pada periode yang beririsan');
    const budget = await this.prisma.budget.create({
      data: {
        financeSpaceId: spaceId,
        categoryId: dto.categoryId,
        period: dto.period,
        startDate: toDateOnly(dto.startDate),
        endDate: toDateOnly(endDate),
        amount: dto.amount,
        createdBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'budget.create', entityType: 'budget', entityId: budget.id, metadata: { ...dto, endDate } });
    return budget;
  }

  async update(user: AuthUser, spaceId: string, id: string, dto: UpdateBudgetDto) {
    const b = await this.prisma.budget.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!b) throw new NotFoundException('Anggaran tidak ditemukan');
    const start = dto.startDate ?? dateOnlyString(b.startDate);
    const end = dto.endDate ?? dateOnlyString(b.endDate);
    if (end < start) throw new BadRequestException('Tanggal akhir harus setelah tanggal mulai');
    const budget = await this.prisma.budget.update({
      where: { id },
      data: { startDate: toDateOnly(start), endDate: toDateOnly(end), amount: dto.amount, updatedBy: user.id },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'budget.update', entityType: 'budget', entityId: id, metadata: { changes: dto } });
    return budget;
  }

  async remove(user: AuthUser, spaceId: string, id: string) {
    const res = await this.prisma.budget.updateMany({
      where: { id, financeSpaceId: spaceId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });
    if (!res.count) throw new NotFoundException('Anggaran tidak ditemukan');
    await this.audit.log({ spaceId, actorId: user.id, action: 'budget.delete', entityType: 'budget', entityId: id });
    return { ok: true };
  }

  /**
   * Dipanggil setelah transaksi pengeluaran dibuat/diubah. Mengirim notifikasi bila
   * pemakaian anggaran baru melewati 80% atau 100% akibat transaksi tersebut.
   */
  async checkThresholds(spaceId: string, categoryId: string, localDate: string, addedAmount: Prisma.Decimal, actor: AuthUser) {
    const d = toDateOnly(localDate);
    const budgets = await this.prisma.budget.findMany({
      where: { financeSpaceId: spaceId, categoryId, deletedAt: null, startDate: { lte: d }, endDate: { gte: d } },
      include: { category: true },
    });
    if (!budgets.length) return;
    const spent = await this.spentFor(budgets.map((b) => b.id));
    const admins = await this.prisma.spaceMember.findMany({
      where: { financeSpaceId: spaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE', deletedAt: null },
    });
    for (const b of budgets) {
      const now = (spent.get(b.id) ?? new Prisma.Decimal(0)).div(b.amount).toNumber();
      const before = (spent.get(b.id) ?? new Prisma.Decimal(0)).minus(addedAmount).div(b.amount).toNumber();
      let title: string | null = null;
      if (now > 1 && before <= 1) title = 'Anggaran terlampaui';
      else if (now >= BUDGET_WARNING_RATIO && before < BUDGET_WARNING_RATIO) title = 'Anggaran hampir habis';
      if (!title) continue;
      await this.notifications.notify([...admins.map((a) => a.userId), actor.id], {
        spaceId,
        title,
        message: `Pemakaian anggaran "${b.category.name}" mencapai ${Math.round(now * 100)}% (${formatRupiah(
          spent.get(b.id)!,
        )} dari ${formatRupiah(b.amount)}).`,
        createdBy: actor.id,
      });
    }
  }
}
