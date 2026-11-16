import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { APP_TIMEZONE, toDateOnly } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

export interface AccountWithBalance {
  id: string;
  financeSpaceId: string;
  name: string;
  type: string;
  openingBalance: string;
  openingBalanceDate: Date;
  isActive: boolean;
  balance: string;
  transactionCount: number;
  createdAt: Date;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Saldo akun = saldo awal + pemasukan + transfer masuk − pengeluaran − transfer keluar
   * (hanya transaksi VALID yang tidak dihapus). `asOf` (YYYY-MM-DD) membatasi transaksi
   * sampai akhir hari tersebut di zona waktu aplikasi.
   */
  async listWithBalances(spaceId: string, asOf?: string): Promise<AccountWithBalance[]> {
    const asOfFilter = asOf
      ? Prisma.sql`AND t.transaction_date < ((${asOf}::date + 1)::timestamp AT TIME ZONE ${APP_TIMEZONE})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT a.id, a.finance_space_id, a.name, a.type::text AS type, a.opening_balance, a.opening_balance_date,
             a.is_active, a.created_at,
             a.opening_balance + COALESCE(SUM(CASE
               WHEN t.type = 'INCOME'   AND t.account_id = a.id             THEN t.amount
               WHEN t.type = 'TRANSFER' AND t.destination_account_id = a.id THEN t.amount
               WHEN t.type = 'EXPENSE'  AND t.account_id = a.id             THEN -t.amount
               WHEN t.type = 'TRANSFER' AND t.account_id = a.id             THEN -t.amount
               ELSE 0 END), 0) AS balance,
             COUNT(t.id)::int AS transaction_count
      FROM accounts a
      LEFT JOIN transactions t
        ON (t.account_id = a.id OR t.destination_account_id = a.id)
       AND t.status = 'VALID' AND t.deleted_at IS NULL ${asOfFilter}
      WHERE a.finance_space_id = ${spaceId}::uuid AND a.deleted_at IS NULL
      GROUP BY a.id
      ORDER BY a.is_active DESC, a.created_at ASC`;
    return rows.map((r) => ({
      id: r.id,
      financeSpaceId: r.finance_space_id,
      name: r.name,
      type: r.type,
      openingBalance: r.opening_balance.toFixed(2),
      openingBalanceDate: r.opening_balance_date,
      isActive: r.is_active,
      balance: new Prisma.Decimal(r.balance).toFixed(2),
      transactionCount: r.transaction_count,
      createdAt: r.created_at,
    }));
  }

  async summary(spaceId: string, asOf?: string) {
    const accounts = await this.listWithBalances(spaceId, asOf);
    // Total saldo ruang = jumlah saldo seluruh akun AKTIF
    const total = accounts
      .filter((a) => a.isActive)
      .reduce((sum, a) => sum.plus(a.balance), new Prisma.Decimal(0));
    return { data: accounts, totalBalance: total.toFixed(2) };
  }

  async get(spaceId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!account) throw new NotFoundException('Akun tidak ditemukan');
    return account;
  }

  async create(user: AuthUser, spaceId: string, dto: CreateAccountDto) {
    const account = await this.prisma.account.create({
      data: {
        financeSpaceId: spaceId,
        name: dto.name,
        type: dto.type,
        openingBalance: dto.openingBalance ?? '0',
        ...(dto.openingBalanceDate ? { openingBalanceDate: toDateOnly(dto.openingBalanceDate) } : {}),
        createdBy: user.id,
      },
    });
    await this.audit.log({
      spaceId,
      actorId: user.id,
      action: 'account.create',
      entityType: 'account',
      entityId: account.id,
      metadata: { name: account.name, openingBalance: account.openingBalance.toFixed(2) },
    });
    return account;
  }

  async update(user: AuthUser, spaceId: string, id: string, dto: UpdateAccountDto) {
    const before = await this.get(spaceId, id);
    if (dto.openingBalanceDate) {
      const earliest = await this.prisma.$queryRaw<{ d: Date | null }[]>`
        SELECT MIN((transaction_date AT TIME ZONE ${APP_TIMEZONE})::date) AS d FROM transactions
        WHERE (account_id = ${id}::uuid OR destination_account_id = ${id}::uuid) AND deleted_at IS NULL`;
      const d = earliest[0]?.d;
      if (d && toDateOnly(dto.openingBalanceDate) > d) {
        throw new BadRequestException(
          `Tanggal saldo awal tidak boleh setelah transaksi pertama akun ini (${d.toISOString().slice(0, 10)})`,
        );
      }
    }
    const account = await this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        openingBalance: dto.openingBalance,
        openingBalanceDate: dto.openingBalanceDate ? toDateOnly(dto.openingBalanceDate) : undefined,
        isActive: dto.isActive,
        updatedBy: user.id,
      },
    });
    await this.audit.log({
      spaceId,
      actorId: user.id,
      action: 'account.update',
      entityType: 'account',
      entityId: id,
      metadata: {
        before: { name: before.name, openingBalance: before.openingBalance.toFixed(2), isActive: before.isActive },
        changes: dto,
      },
    });
    return account;
  }

  async remove(user: AuthUser, spaceId: string, id: string) {
    await this.get(spaceId, id);
    const used = await this.prisma.transaction.count({
      where: { OR: [{ accountId: id }, { destinationAccountId: id }], deletedAt: null },
    });
    if (used > 0) {
      throw new BadRequestException(
        `Akun memiliki ${used} transaksi sehingga tidak dapat dihapus. Nonaktifkan akun sebagai gantinya.`,
      );
    }
    await this.prisma.account.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: user.id } });
    await this.audit.log({ spaceId, actorId: user.id, action: 'account.delete', entityType: 'account', entityId: id });
    return { ok: true };
  }
}
