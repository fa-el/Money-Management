import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { formatRupiah, toDateOnly } from '../common/util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContributionDto, CreateGoalDto, UpdateGoalDto } from './goals.dto';

/**
 * Target tabungan. Kontribusi adalah alokasi/penanda dana dari sebuah akun untuk target
 * (bukan transaksi baru), sehingga tidak mengubah saldo akun. Untuk memindahkan uang
 * secara fisik ke rekening tabungan, catat juga sebagai Transfer.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(spaceId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { financeSpaceId: spaceId, deletedAt: null },
      include: { contributions: { where: { deletedAt: null }, orderBy: { contributionDate: 'desc' } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    const accounts = await this.prisma.account.findMany({ where: { financeSpaceId: spaceId }, select: { id: true, name: true } });
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    return goals.map((g) => {
      const saved = g.contributions.reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
      return {
        ...g,
        contributions: g.contributions.map((c) => ({ ...c, accountName: names.get(c.accountId) ?? null })),
        savedAmount: saved.toFixed(2),
        remainingAmount: Prisma.Decimal.max(g.targetAmount.minus(saved), 0).toFixed(2),
        progress: Math.min(100, Math.round(saved.div(g.targetAmount).toNumber() * 1000) / 10),
      };
    });
  }

  private async get(spaceId: string, id: string) {
    const g = await this.prisma.savingsGoal.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!g) throw new NotFoundException('Target tabungan tidak ditemukan');
    return g;
  }

  async create(user: AuthUser, spaceId: string, dto: CreateGoalDto) {
    const g = await this.prisma.savingsGoal.create({
      data: {
        financeSpaceId: spaceId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ? toDateOnly(dto.targetDate) : null,
        createdBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'goal.create', entityType: 'savings_goal', entityId: g.id, metadata: { ...dto } });
    return g;
  }

  async update(user: AuthUser, spaceId: string, id: string, dto: UpdateGoalDto) {
    await this.get(spaceId, id);
    const g = await this.prisma.savingsGoal.update({
      where: { id },
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate === undefined ? undefined : dto.targetDate ? toDateOnly(dto.targetDate) : null,
        status: dto.status,
        updatedBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'goal.update', entityType: 'savings_goal', entityId: id, metadata: { changes: dto } });
    return g;
  }

  async remove(user: AuthUser, spaceId: string, id: string) {
    await this.get(spaceId, id);
    await this.prisma.savingsGoal.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: user.id } });
    await this.audit.log({ spaceId, actorId: user.id, action: 'goal.delete', entityType: 'savings_goal', entityId: id });
    return { ok: true };
  }

  async contribute(user: AuthUser, spaceId: string, goalId: string, dto: CreateContributionDto) {
    const goal = await this.get(spaceId, goalId);
    if (goal.status !== 'ACTIVE') throw new BadRequestException('Target tabungan sudah tidak aktif');
    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, financeSpaceId: spaceId, deletedAt: null } });
    if (!account) throw new BadRequestException('Akun tidak ditemukan di ruang ini');

    const c = await this.prisma.goalContribution.create({
      data: {
        financeSpaceId: spaceId,
        goalId,
        accountId: dto.accountId,
        amount: dto.amount,
        contributionDate: toDateOnly(dto.contributionDate),
        createdBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'goal.contribute', entityType: 'goal_contribution', entityId: c.id, metadata: { goalId, ...dto } });

    // Tandai tercapai otomatis bila total kontribusi >= target
    const agg = await this.prisma.goalContribution.aggregate({ where: { goalId, deletedAt: null }, _sum: { amount: true } });
    if (agg._sum.amount && agg._sum.amount.gte(goal.targetAmount)) {
      await this.prisma.savingsGoal.update({ where: { id: goalId }, data: { status: 'COMPLETED', updatedBy: user.id } });
      await this.notifications.notify([goal.createdBy, user.id], {
        spaceId,
        title: 'Target tabungan tercapai 🎉',
        message: `Target "${goal.name}" sebesar ${formatRupiah(goal.targetAmount)} telah tercapai.`,
        createdBy: user.id,
      });
    }
    return c;
  }

  async removeContribution(user: AuthUser, spaceId: string, goalId: string, contributionId: string) {
    const res = await this.prisma.goalContribution.updateMany({
      where: { id: contributionId, goalId, financeSpaceId: spaceId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });
    if (!res.count) throw new NotFoundException('Kontribusi tidak ditemukan');
    await this.audit.log({ spaceId, actorId: user.id, action: 'goal.contribution_delete', entityType: 'goal_contribution', entityId: contributionId });
    return { ok: true };
  }
}
