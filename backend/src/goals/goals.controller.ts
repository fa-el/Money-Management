import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateContributionDto, CreateGoalDto, UpdateGoalDto } from './goals.dto';
import { GoalsService } from './goals.service';

@ApiTags('Savings Goals')
@Controller('finance-spaces/:spaceId/savings-goals')
@UseGuards(SpaceGuard)
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@Param('spaceId') spaceId: string) {
    return this.goals.list(spaceId);
  }

  @Post()
  @MinRole('EDITOR')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateGoalDto) {
    return this.goals.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('EDITOR')
  update(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGoalDto) {
    return this.goals.update(user, spaceId, id, dto);
  }

  @Delete(':id')
  @MinRole('EDITOR')
  remove(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.remove(user, spaceId, id);
  }

  /** Mencatat kontribusi ke target. MEMBER ke atas (mis. anggota keluarga ikut menabung). */
  @Post(':id/contributions')
  @MinRole('MEMBER')
  contribute(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContributionDto,
  ) {
    return this.goals.contribute(user, spaceId, id, dto);
  }

  @Delete(':id/contributions/:contributionId')
  @MinRole('EDITOR')
  removeContribution(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contributionId', ParseUUIDPipe) contributionId: string,
  ) {
    return this.goals.removeContribution(user, spaceId, id, contributionId);
  }
}
