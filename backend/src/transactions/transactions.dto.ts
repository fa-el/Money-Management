import { Transform, Type } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { AMOUNT_REGEX, PaginationQuery, toAmountString } from '../common/dto';

const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class CreateTransactionDto {
  @IsIn(Object.values(TransactionType))
  type: TransactionType;

  @IsUUID('all')
  accountId: string;

  /** Wajib untuk TRANSFER */
  @emptyToNull()
  @ValidateIf((o) => o.type === 'TRANSFER' || (o.destinationAccountId !== undefined && o.destinationAccountId !== null))
  @IsUUID('all')
  destinationAccountId?: string | null;

  /** Untuk INCOME/EXPENSE; harus kosong untuk TRANSFER */
  @emptyToNull()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus lebih besar dari nol dengan maksimal 2 desimal' })
  amount: string;

  /** ISO 8601, mis. 2026-11-16T09:30:00+07:00 */
  @IsISO8601()
  transactionDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(Object.values(TransactionType))
  type?: TransactionType;

  @IsOptional()
  @IsUUID('all')
  accountId?: string;

  @emptyToNull()
  @IsOptional()
  @IsUUID('all')
  destinationAccountId?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  @IsOptional()
  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus lebih besar dari nol dengan maksimal 2 desimal' })
  amount?: string;

  @IsOptional()
  @IsISO8601()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** VOID = dibatalkan; tetap tersimpan tapi tidak dihitung di saldo & laporan */
  @IsOptional()
  @IsIn(Object.values(TransactionStatus))
  status?: TransactionStatus;
}

export class ListTransactionsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(Object.values(TransactionType))
  type?: TransactionType;

  @IsOptional()
  @IsUUID('all')
  accountId?: string;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @IsOptional()
  @IsIn(Object.values(TransactionStatus))
  status?: TransactionStatus;

  /** YYYY-MM-DD (inklusif, zona waktu aplikasi) */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  /** Cari di deskripsi */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => String)
  @Matches(AMOUNT_REGEX)
  minAmount?: string;

  @IsOptional()
  @Type(() => String)
  @Matches(AMOUNT_REGEX)
  maxAmount?: string;

  @IsOptional()
  @IsIn(['date_desc', 'date_asc', 'amount_desc', 'amount_asc'])
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

export class CreateTransferDto {
  @IsUUID('all')
  accountId: string;

  @IsUUID('all')
  destinationAccountId: string;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus lebih besar dari nol dengan maksimal 2 desimal' })
  amount: string;

  @IsISO8601()
  transactionDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
