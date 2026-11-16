import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

export class ReportQuery {
  /** YYYY-MM-DD, default awal bulan berjalan */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  /** YYYY-MM-DD, default hari terakhir bulan berjalan */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('all')
  accountId?: string;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;
}

export class CashflowQuery extends ReportQuery {
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  groupBy?: 'day' | 'week' | 'month' | 'year';
}

export class CategoryReportQuery extends ReportQuery {
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';
}
