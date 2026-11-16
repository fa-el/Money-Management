import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { GoalStatus } from '@prisma/client';
import { AMOUNT_REGEX, toAmountString } from '../common/dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class CreateGoalDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal target harus angka positif' })
  targetAmount: string;

  @emptyToNull()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  targetDate?: string | null;
}

export class UpdateGoalDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal target harus angka positif' })
  targetAmount?: string;

  @emptyToNull()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string | null;

  @IsOptional()
  @IsIn(Object.values(GoalStatus))
  status?: GoalStatus;
}

export class CreateContributionDto {
  @IsUUID('all')
  accountId: string;

  @toAmountString()
  @Matches(AMOUNT_REGEX, { message: 'Nominal kontribusi harus angka positif' })
  amount: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal harus YYYY-MM-DD' })
  contributionDate: string;
}
