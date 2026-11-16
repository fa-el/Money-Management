import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Nominal uang: angka positif, maksimal 2 desimal (disimpan sebagai NUMERIC(18,2)). */
export const AMOUNT_REGEX = /^\d{1,16}(\.\d{1,2})?$/;
export const toAmountString = () =>
  Transform(({ value }) => (value === null || value === undefined || value === '' ? value : String(value).trim()));

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 20;
}
