import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpaceGuard } from '../common/space.guard';
import { CashflowQuery, CategoryReportQuery, ReportQuery } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('finance-spaces/:spaceId/reports')
@UseGuards(SpaceGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Total pemasukan, pengeluaran, selisih, saldo, dan perbandingan dengan periode sebelumnya. */
  @Get('summary')
  summary(@Param('spaceId') spaceId: string, @Query() q: ReportQuery) {
    return this.reports.summary(spaceId, q);
  }

  /** Tren arus kas per hari/minggu/bulan/tahun. */
  @Get('cashflow')
  cashflow(@Param('spaceId') spaceId: string, @Query() q: CashflowQuery) {
    return this.reports.cashflow(spaceId, q);
  }

  /** Komposisi per kategori (default: pengeluaran). */
  @Get('categories')
  categories(@Param('spaceId') spaceId: string, @Query() q: CategoryReportQuery) {
    return this.reports.categories(spaceId, q);
  }

  @Get('accounts')
  accounts(@Param('spaceId') spaceId: string, @Query() q: ReportQuery) {
    return this.reports.accountsReport(spaceId, q);
  }
}
