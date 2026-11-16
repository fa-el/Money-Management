import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';
import { BudgetsService } from './budgets.service';

@ApiTags('Budgets')
@Controller('finance-spaces/:spaceId/budgets')
@UseGuards(SpaceGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  /** Daftar anggaran beserta realisasi, sisa, dan status (OK/WARNING/OVER). ?activeOn=YYYY-MM-DD */
  @Get()
  list(@Param('spaceId') spaceId: string, @Query('activeOn') activeOn?: string) {
    return this.budgets.list(spaceId, activeOn && /^\d{4}-\d{2}-\d{2}$/.test(activeOn) ? activeOn : undefined);
  }

  @Post()
  @MinRole('EDITOR')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('EDITOR')
  update(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgets.update(user, spaceId, id, dto);
  }

  @Delete(':id')
  @MinRole('EDITOR')
  remove(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.remove(user, spaceId, id);
  }
}
