import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SpaceMember } from '@prisma/client';
import { CurrentMember, CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateTransactionDto, CreateTransferDto, ListTransactionsQuery, UpdateTransactionDto } from './transactions.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@Controller('finance-spaces/:spaceId/transactions')
@UseGuards(SpaceGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** Daftar transaksi dengan filter, pencarian, sorting, dan paginasi. */
  @Get()
  list(@Param('spaceId') spaceId: string, @Query() q: ListTransactionsQuery) {
    return this.transactions.list(spaceId, q);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="transaksi.csv"')
  exportCsv(@Param('spaceId') spaceId: string, @Query() q: ListTransactionsQuery) {
    return this.transactions.exportCsv(spaceId, q);
  }

  @Get(':id')
  get(@Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.get(spaceId, id);
  }

  /** Mencatat pemasukan, pengeluaran, atau transfer (type=TRANSFER). MEMBER ke atas. */
  @Post()
  @MinRole('MEMBER')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('MEMBER')
  update(
    @CurrentUser() user: AuthUser,
    @CurrentMember() member: SpaceMember,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(user, member, spaceId, id, dto);
  }

  @Delete(':id')
  @MinRole('MEMBER')
  remove(
    @CurrentUser() user: AuthUser,
    @CurrentMember() member: SpaceMember,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.remove(user, member, spaceId, id);
  }
}

/** Alias sesuai rancangan API dokumen: POST/GET /finance-spaces/:id/transfers */
@ApiTags('Transfers')
@Controller('finance-spaces/:spaceId/transfers')
@UseGuards(SpaceGuard)
export class TransfersController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@Param('spaceId') spaceId: string, @Query() q: ListTransactionsQuery) {
    return this.transactions.list(spaceId, Object.assign(q, { type: 'TRANSFER' }));
  }

  @Post()
  @MinRole('MEMBER')
  create(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transactions.create(user, spaceId, Object.assign(new CreateTransactionDto(), dto, { type: 'TRANSFER' as const }));
  }
}
