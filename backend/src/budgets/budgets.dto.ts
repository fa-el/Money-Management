import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { AMOUNT_REGEX, toAmountString } from '../common/dto';

export const BUDGET_PERIODS = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

export class CreateBudgetDto {
  @IsUUID('all')
  categoryId: string;

  @IsIn(BUDGET_PERIODS)
  period: (typeof BUDGET_PERIODS)[number];

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  startDate: string;

  /** Opsional — bila kosong dihitung otomatis dari period. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  endDate?: string;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus angka positif dengan maksimal 2 desimal' })
  amount: string;
}

export class UpdateBudgetDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal harus angka positif dengan maksimal 2 desimal' })
  amount?: string;
}
