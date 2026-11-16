import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AccountType } from '@prisma/client';
import { toAmountString } from '../common/dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Saldo awal boleh negatif (mis. kartu kredit/utang), maks 2 desimal. */
const SIGNED_AMOUNT = /^-?\d{1,16}(\.\d{1,2})?$/;

export class CreateAccountDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(Object.values(AccountType))
  type: AccountType;

  @IsOptional()
  @toAmountString()
  @Matches(SIGNED_AMOUNT, { message: 'Saldo awal harus berupa angka dengan maksimal 2 desimal' })
  openingBalance?: string;

  /** Tanggal efektif saldo awal, format YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  openingBalanceDate?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(Object.values(AccountType))
  type?: AccountType;

  @IsOptional()
  @toAmountString()
  @Matches(SIGNED_AMOUNT, { message: 'Saldo awal harus berupa angka dengan maksimal 2 desimal' })
  openingBalance?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  openingBalanceDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
