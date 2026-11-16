import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceMember, TransactionType, type Transaction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BudgetsService } from '../budgets/budgets.service';
import { hasRole, type AuthUser } from '../common/types';
import { APP_TIMEZONE, dateOnlyString, localDateString, paginate } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, ListTransactionsQuery, UpdateTransactionDto } from './transactions.dto';

type Db = PrismaService | Prisma.TransactionClient;

export interface TransactionInput {
  type: TransactionType;
  accountId: string;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  amount: string | Prisma.Decimal;
  transactionDate: Date;
}

const INCLUDE = {
  account: { select: { id: true, name: true, type: true } },
  destinationAccount: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true, type: true, icon: true, color: true } },
} satisfies Prisma.TransactionInclude;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly budgets: BudgetsService,
  ) {}

  /**
   * Validasi aturan bisnis (bagian 9.2):
   * - nominal > 0; transfer wajib akun asal ≠ tujuan dan tanpa kategori;
   * - semua akun/kategori harus milik ruang yang sama & aktif;
   * - tipe kategori harus sesuai tipe transaksi;
   * - tanggal transaksi tidak boleh sebelum tanggal saldo awal akun.
   */
  async validate(spaceId: string, input: TransactionInput, db: Db = this.prisma, previous?: Transaction) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Nominal transaksi harus lebih besar dari nol');

    const accountIds = [input.accountId, input.destinationAccountId].filter(Boolean) as string[];
    const accounts = await db.account.findMany({ where: { id: { in: accountIds }, financeSpaceId: spaceId, deletedAt: null } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const localDate = localDateString(input.transactionDate);

    for (const id of accountIds) {
      const acc = byId.get(id);
      if (!acc) throw new BadRequestException('Akun tidak ditemukan di ruang keuangan ini');
      const unchanged = previous && (previous.accountId === id || previous.destinationAccountId === id);
      if (!acc.isActive && !unchanged) throw new BadRequestException(`Akun "${acc.name}" tidak aktif`);
      if (localDate < dateOnlyString(acc.openingBalanceDate)) {
        throw new BadRequestException(
          `Tanggal transaksi tidak boleh sebelum tanggal saldo awal akun "${acc.name}" (${dateOnlyString(acc.openingBalanceDate)})`,
        );
      }
    }

    if (input.type === 'TRANSFER') {
      if (!input.destinationAccountId) throw new BadRequestException('Transfer wajib memiliki akun tujuan');
      if (input.destinationAccountId === input.accountId) {
        throw new BadRequestException('Akun asal dan akun tujuan transfer harus berbeda');
      }
      if (input.categoryId) throw new BadRequestException('Transfer tidak memakai kategori');
    } else {
      if (input.destinationAccountId) throw new BadRequestException('Akun tujuan hanya untuk transfer');
      if (input.categoryId) {
        const cat = await db.category.findFirst({ where: { id: input.categoryId, financeSpaceId: spaceId, deletedAt: null } });
        if (!cat) throw new BadRequestException('Kategori tidak ditemukan di ruang keuangan ini');
        if (cat.type !== input.type) {
          throw new BadRequestException(
            `Kategori "${cat.name}" adalah kategori ${cat.type === 'INCOME' ? 'pemasukan' : 'pengeluaran'}`,
          );
        }
        if (!cat.isActive && previous?.categoryId !== cat.id) throw new BadRequestException(`Kategori "${cat.name}" tidak aktif`);
      }
    }
    return { amount, localDate };
  }

  async list(spaceId: string, q: ListTransactionsQuery) {
    const where: Prisma.TransactionWhereInput = { financeSpaceId: spaceId, deletedAt: null };
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.accountId) where.OR = [{ accountId: q.accountId }, { destinationAccountId: q.accountId }];
    if (q.q) where.description = { contains: q.q, mode: 'insensitive' };
    if (q.from || q.to) {
      where.transactionDate = {
        ...(q.from ? { gte: localStartOfDay(q.from) } : {}),
        ...(q.to ? { lt: localStartOfDay(q.to, 1) } : {}),
      };
    }
    if (q.minAmount || q.maxAmount) {
      where.amount = { ...(q.minAmount ? { gte: q.minAmount } : {}), ...(q.maxAmount ? { lte: q.maxAmount } : {}) };
    }
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
      q.sort === 'date_asc'
        ? [{ transactionDate: 'asc' }]
        : q.sort === 'amount_desc'
          ? [{ amount: 'desc' }]
          : q.sort === 'amount_asc'
            ? [{ amount: 'asc' }]
            : [{ transactionDate: 'desc' }, { createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: INCLUDE,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return paginate(await this.withCreators(rows), total, q.page, q.pageSize);
  }

  private async withCreators<T extends { createdBy: string }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.createdBy))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, createdByName: names.get(r.createdBy) ?? null }));
  }

  async get(spaceId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({
      where: { id, financeSpaceId: spaceId, deletedAt: null },
      include: INCLUDE,
    });
    if (!t) throw new NotFoundException('Transaksi tidak ditemukan');
    const link = await this.prisma.importedTransactionLink.findFirst({
      where: { transactionId: id, deletedAt: null },
      include: { record: { include: { items: { where: { deletedAt: null } } } } },
    });
    const [withCreator] = await this.withCreators([t]);
    return {
      ...withCreator,
      importSource: link
        ? { importJobId: link.importJobId, recordId: link.extractedRecordId, items: link.record.items }
        : null,
    };
  }

  async create(user: AuthUser, spaceId: string, dto: CreateTransactionDto) {
    const input: TransactionInput = {
      type: dto.type,
      accountId: dto.accountId,
      destinationAccountId: dto.type === 'TRANSFER' ? dto.destinationAccountId : null,
      categoryId: dto.type === 'TRANSFER' ? null : dto.categoryId ?? null,
      amount: dto.amount,
      transactionDate: new Date(dto.transactionDate),
    };
    // Operasi atomik: validasi + simpan + audit dalam satu database transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const { amount } = await this.validate(spaceId, input, tx);
      const t = await tx.transaction.create({
        data: {
          financeSpaceId: spaceId,
          type: input.type,
          accountId: input.accountId,
          destinationAccountId: input.destinationAccountId ?? null,
          categoryId: input.categoryId ?? null,
          amount,
          transactionDate: input.transactionDate,
          description: dto.description?.trim() || null,
          createdBy: user.id,
        },
        include: INCLUDE,
      });
      await this.audit.log(
        {
          spaceId,
          actorId: user.id,
          action: input.type === 'TRANSFER' ? 'transfer.create' : 'transaction.create',
          entityType: 'transaction',
          entityId: t.id,
          metadata: { type: t.type, amount: t.amount.toFixed(2), accountId: t.accountId, destinationAccountId: t.destinationAccountId },
        },
        tx,
      );
      return t;
    });
    if (created.type === 'EXPENSE' && created.categoryId) {
      await this.budgets.checkThresholds(spaceId, created.categoryId, localDateString(created.transactionDate), created.amount, user);
    }
    return created;
  }

  private async findOwned(spaceId: string, id: string, member: SpaceMember) {
    const t = await this.prisma.transaction.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!t) throw new NotFoundException('Transaksi tidak ditemukan');
    // MEMBER hanya boleh mengubah transaksi yang dibuatnya sendiri; EDITOR ke atas bebas
    if (!hasRole(member.role, 'EDITOR') && t.createdBy !== member.userId) {
      throw new ForbiddenException('Anda hanya dapat mengubah transaksi yang Anda buat');
    }
    return t;
  }

  async update(user: AuthUser, member: SpaceMember, spaceId: string, id: string, dto: UpdateTransactionDto) {
    const before = await this.findOwned(spaceId, id, member);
    const type = dto.type ?? before.type;
    const input: TransactionInput = {
      type,
      accountId: dto.accountId ?? before.accountId,
      destinationAccountId:
        type === 'TRANSFER'
          ? dto.destinationAccountId !== undefined
            ? dto.destinationAccountId
            : before.destinationAccountId
          : null,
      categoryId:
        type === 'TRANSFER' ? null : dto.categoryId !== undefined ? dto.categoryId : type === before.type ? before.categoryId : null,
      amount: dto.amount ?? before.amount,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : before.transactionDate,
    };

    // Karena saldo dihitung dari transaksi, memperbarui baris ini otomatis "membalik dampak lama
    // dan menerapkan dampak baru" secara konsisten (tidak ada saldo tersimpan yang bisa ganda).
    const updated = await this.prisma.$transaction(async (tx) => {
      const { amount } = await this.validate(spaceId, input, tx, before);
      const t = await tx.transaction.update({
        where: { id },
        data: {
          type: input.type,
          accountId: input.accountId,
          destinationAccountId: input.destinationAccountId ?? null,
          categoryId: input.categoryId ?? null,
          amount,
          transactionDate: input.transactionDate,
          description: dto.description !== undefined ? dto.description.trim() || null : undefined,
          status: dto.status,
          updatedBy: user.id,
        },
        include: INCLUDE,
      });
      await this.audit.log(
        {
          spaceId,
          actorId: user.id,
          action: dto.status && dto.status !== before.status ? `transaction.${dto.status === 'VOID' ? 'void' : 'restore'}` : 'transaction.update',
          entityType: 'transaction',
          entityId: id,
          metadata: {
            before: {
              type: before.type,
              amount: before.amount.toFixed(2),
              accountId: before.accountId,
              destinationAccountId: before.destinationAccountId,
              categoryId: before.categoryId,
              transactionDate: before.transactionDate,
              description: before.description,
              status: before.status,
            },
            after: {
              type: t.type,
              amount: t.amount.toFixed(2),
              accountId: t.accountId,
              destinationAccountId: t.destinationAccountId,
              categoryId: t.categoryId,
              transactionDate: t.transactionDate,
              description: t.description,
              status: t.status,
            },
          },
        },
        tx,
      );
      return t;
    });
    if (updated.type === 'EXPENSE' && updated.categoryId && updated.status === 'VALID') {
      const delta =
        before.type === 'EXPENSE' && before.categoryId === updated.categoryId && before.status === 'VALID'
          ? updated.amount.minus(before.amount)
          : updated.amount;
      if (delta.gt(0)) {
        await this.budgets.checkThresholds(spaceId, updated.categoryId, localDateString(updated.transactionDate), delta, user);
      }
    }
    return updated;
  }

  /** Soft delete: data tetap tersimpan untuk jejak audit, tapi tidak lagi dihitung. */
  async remove(user: AuthUser, member: SpaceMember, spaceId: string, id: string) {
    const t = await this.findOwned(spaceId, id, member);
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: user.id } });
      // Lepas keterkaitan impor agar baris e-statement dapat diimpor ulang bila perlu
      await tx.importedTransactionLink.updateMany({
        where: { transactionId: id, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
      await this.audit.log(
        {
          spaceId,
          actorId: user.id,
          action: 'transaction.delete',
          entityType: 'transaction',
          entityId: id,
          metadata: { type: t.type, amount: t.amount.toFixed(2), description: t.description },
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** Export CSV transaksi sesuai filter (tanpa paginasi, maks 10.000 baris). */
  async exportCsv(spaceId: string, q: ListTransactionsQuery) {
    const result = await this.list(spaceId, Object.assign(new ListTransactionsQuery(), q, { page: 1, pageSize: 10000 }));
    const header = ['Tanggal', 'Tipe', 'Akun', 'Akun Tujuan', 'Kategori', 'Nominal', 'Deskripsi', 'Status', 'Dicatat oleh'];
    const typeLabel = { INCOME: 'Pemasukan', EXPENSE: 'Pengeluaran', TRANSFER: 'Transfer' } as const;
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = result.data.map((t) =>
      [
        localDateString(t.transactionDate),
        typeLabel[t.type],
        t.account.name,
        t.destinationAccount?.name ?? '',
        t.category?.name ?? '',
        t.amount.toFixed(2),
        t.description ?? '',
        t.status,
        t.createdByName ?? '',
      ]
        .map(esc)
        .join(','),
    );
    return '﻿' + [header.join(','), ...lines].join('\n');
  }
}

/** Awal hari (zona waktu aplikasi) untuk tanggal "YYYY-MM-DD", digeser `addDays`. */
export function localStartOfDay(date: string, addDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d + addDays);
  // Hitung offset zona waktu pada tanggal tersebut
  const probe = new Date(utcMidnight);
  const tzString = probe.toLocaleString('en-US', { timeZone: APP_TIMEZONE });
  const utcString = probe.toLocaleString('en-US', { timeZone: 'UTC' });
  const offsetMs = new Date(tzString).getTime() - new Date(utcString).getTime();
  return new Date(utcMidnight - offsetMs);
}
