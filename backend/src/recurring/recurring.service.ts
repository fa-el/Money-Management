import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type RecurringTransaction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { addPeriod, APP_TIMEZONE, dateOnlyString, toDateOnly, todayLocal } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, TransactionsService } from '../transactions/transactions.service';
import { CreateRecurringDto, UpdateRecurringDto } from './recurring.dto';

/** Batas eksekusi tertunda per jadwal per sekali jalan (mencegah loop tak berujung). */
const MAX_CATCH_UP = 366;

@Injectable()
export class RecurringService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
  ) {}

  /** Saat server menyala, kejar jadwal yang terlewat ketika server mati. */
  onApplicationBootstrap() {
    setTimeout(() => void this.processAllDue(), 3000);
  }

  list(spaceId: string) {
    return this.prisma.recurringTransaction.findMany({
      where: { financeSpaceId: spaceId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { nextExecutionDate: 'asc' }],
    });
  }

  private async get(spaceId: string, id: string) {
    const r = await this.prisma.recurringTransaction.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!r) throw new NotFoundException('Transaksi berulang tidak ditemukan');
    return r;
  }

  async create(user: AuthUser, spaceId: string, dto: CreateRecurringDto) {
    if (dto.endDate && dto.endDate < dto.startDate) throw new BadRequestException('Tanggal akhir harus setelah tanggal mulai');
    await this.transactions.validate(spaceId, {
      type: dto.type,
      accountId: dto.accountId,
      destinationAccountId: dto.type === 'TRANSFER' ? dto.destinationAccountId : null,
      categoryId: dto.type === 'TRANSFER' ? null : dto.categoryId,
      amount: dto.amount,
      transactionDate: localStartOfDay(dto.startDate),
    });
    const r = await this.prisma.recurringTransaction.create({
      data: {
        financeSpaceId: spaceId,
        type: dto.type,
        accountId: dto.accountId,
        destinationAccountId: dto.type === 'TRANSFER' ? dto.destinationAccountId : null,
        categoryId: dto.type === 'TRANSFER' ? null : dto.categoryId ?? null,
        amount: dto.amount,
        description: dto.description?.trim() || null,
        frequency: dto.frequency,
        startDate: toDateOnly(dto.startDate),
        nextExecutionDate: toDateOnly(dto.startDate),
        endDate: dto.endDate ? toDateOnly(dto.endDate) : null,
        createdBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'recurring.create', entityType: 'recurring_transaction', entityId: r.id, metadata: { ...dto } });
    // Jalankan langsung bila tanggal mulai sudah lewat/hari ini
    await this.executeDue(r.id);
    return this.get(spaceId, r.id);
  }

  async update(user: AuthUser, spaceId: string, id: string, dto: UpdateRecurringDto) {
    const r = await this.get(spaceId, id);
    if (dto.categoryId) {
      await this.transactions.validate(spaceId, {
        type: r.type,
        accountId: r.accountId,
        destinationAccountId: r.destinationAccountId,
        categoryId: dto.categoryId,
        amount: dto.amount ?? r.amount,
        transactionDate: localStartOfDay(dateOnlyString(r.nextExecutionDate)),
      });
    }
    const updated = await this.prisma.recurringTransaction.update({
      where: { id },
      data: {
        amount: dto.amount,
        description: dto.description,
        categoryId: r.type === 'TRANSFER' ? undefined : dto.categoryId,
        endDate: dto.endDate === undefined ? undefined : dto.endDate ? toDateOnly(dto.endDate) : null,
        nextExecutionDate: dto.nextExecutionDate ? toDateOnly(dto.nextExecutionDate) : undefined,
        isActive: dto.isActive,
        updatedBy: user.id,
      },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'recurring.update', entityType: 'recurring_transaction', entityId: id, metadata: { changes: dto } });
    return updated;
  }

  async remove(user: AuthUser, spaceId: string, id: string) {
    await this.get(spaceId, id);
    await this.prisma.recurringTransaction.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({ spaceId, actorId: user.id, action: 'recurring.delete', entityType: 'recurring_transaction', entityId: id });
    return { ok: true };
  }

  async runNow(user: AuthUser, spaceId: string, id: string) {
    await this.get(spaceId, id);
    const created = await this.executeDue(id);
    return { created };
  }

  /** Scheduler: tiap hari pukul 00:05 (zona aplikasi) memproses jadwal yang jatuh tempo. */
  @Cron('5 0 * * *', { timeZone: APP_TIMEZONE })
  async processAllDue() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.recurringTransaction.findMany({
        where: { isActive: true, deletedAt: null, nextExecutionDate: { lte: toDateOnly(todayLocal()) } },
        select: { id: true },
      });
      let total = 0;
      for (const r of due) total += await this.executeDue(r.id).catch((e) => {
        this.logger.error(`Gagal memproses transaksi berulang ${r.id}: ${e.message}`);
        return 0;
      });
      if (total) this.logger.log(`Membuat ${total} transaksi dari jadwal berulang`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Membuat transaksi untuk setiap tanggal jatuh tempo s.d. hari ini. Idempoten: indeks unik
   * (recurring_transaction_id, recurrence_date) mencegah transaksi ganda untuk tanggal yang sama.
   */
  async executeDue(id: string): Promise<number> {
    let created = 0;
    const today = todayLocal();
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const r = await this.prisma.recurringTransaction.findUnique({ where: { id } });
      if (!r || !r.isActive || r.deletedAt) break;
      const dueDate = dateOnlyString(r.nextExecutionDate);
      if (dueDate > today) break;
      if (r.endDate && dueDate > dateOnlyString(r.endDate)) {
        await this.prisma.recurringTransaction.update({ where: { id }, data: { isActive: false } });
        break;
      }
      const ok = await this.createOccurrence(r, dueDate);
      if (ok) created++;
      const next = addPeriod(dateOnlyString(r.startDate), r.frequency, this.occurrenceIndex(r, dueDate) + 1);
      await this.prisma.recurringTransaction.update({
        where: { id },
        data: {
          nextExecutionDate: toDateOnly(next),
          lastExecutionAt: new Date(),
          isActive: r.endDate ? next <= dateOnlyString(r.endDate) : true,
        },
      });
    }
    return created;
  }

  /** Indeks kemunculan ke-n dari start_date (agar tanggal 31 tetap konsisten tiap bulan). */
  private occurrenceIndex(r: RecurringTransaction, dueDate: string) {
    let n = 0;
    while (addPeriod(dateOnlyString(r.startDate), r.frequency, n) < dueDate) n++;
    return n;
  }

  private async createOccurrence(r: RecurringTransaction, dueDate: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const transactionDate = new Date(localStartOfDay(dueDate).getTime() + 9 * 3600 * 1000); // 09:00 lokal
        await this.transactions.validate(
          r.financeSpaceId,
          {
            type: r.type,
            accountId: r.accountId,
            destinationAccountId: r.destinationAccountId,
            categoryId: r.categoryId,
            amount: r.amount,
            transactionDate,
          },
          tx,
        );
        const t = await tx.transaction.create({
          data: {
            financeSpaceId: r.financeSpaceId,
            type: r.type,
            accountId: r.accountId,
            destinationAccountId: r.destinationAccountId,
            categoryId: r.categoryId,
            recurringTransactionId: r.id,
            recurrenceDate: toDateOnly(dueDate),
            amount: r.amount,
            transactionDate,
            description: r.description,
            createdBy: r.createdBy,
          },
        });
        await this.audit.log(
          {
            spaceId: r.financeSpaceId,
            actorId: null,
            action: 'recurring.execute',
            entityType: 'transaction',
            entityId: t.id,
            metadata: { recurringTransactionId: r.id, recurrenceDate: dueDate },
          },
          tx,
        );
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; // sudah ada
      if (e instanceof BadRequestException) {
        this.logger.warn(`Lewati jadwal ${r.id} (${dueDate}): ${e.message}`);
        return false;
      }
      throw e;
    }
  }
}
