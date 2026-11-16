import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TransactionType } from '@prisma/client';
import { AMOUNT_REGEX, toAmountString } from '../common/dto';

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class CreateRecurringDto {
  @IsIn(Object.values(TransactionType))
  type: TransactionType;

  @IsUUID('all')
  accountId: string;

  @emptyToNull()
  @ValidateIf((o) => o.type === 'TRANSFER')
  @IsUUID('all')
  destinationAccountId?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus lebih besar dari nol dengan maksimal 2 desimal' })
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(FREQUENCIES)
  frequency: (typeof FREQUENCIES)[number];

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  startDate: string;

  @emptyToNull()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  endDate?: string | null;
}

export class UpdateRecurringDto {
  @IsOptional()
  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus lebih besar dari nol dengan maksimal 2 desimal' })
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @emptyToNull()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  @emptyToNull()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string | null;

  /** Ubah jadwal eksekusi berikutnya */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextExecutionDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
