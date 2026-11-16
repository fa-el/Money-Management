import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateRecurringDto, UpdateRecurringDto } from './recurring.dto';
import { RecurringService } from './recurring.service';

@ApiTags('Recurring Transactions')
@Controller('finance-spaces/:spaceId/recurring-transactions')
@UseGuards(SpaceGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(@Param('spaceId') spaceId: string) {
    return this.recurring.list(spaceId);
  }

  @Post()
  @MinRole('EDITOR')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateRecurringDto) {
    return this.recurring.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('EDITOR')
  update(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.recurring.update(user, spaceId, id, dto);
  }

  /** Proses sekarang semua tanggal yang sudah jatuh tempo untuk jadwal ini. */
  @Post(':id/run')
  @MinRole('EDITOR')
  run(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.runNow(user, spaceId, id);
  }

  @Delete(':id')
  @MinRole('EDITOR')
  remove(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.remove(user, spaceId, id);
  }
}
