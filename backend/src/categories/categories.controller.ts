import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';
import { CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('finance-spaces/:spaceId/categories')
@UseGuards(SpaceGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Param('spaceId') spaceId: string, @Query('type') type?: string) {
    const t = type === 'INCOME' || type === 'EXPENSE' ? (type as CategoryType) : undefined;
    return this.categories.list(spaceId, t);
  }

  @Post()
  @MinRole('EDITOR')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('EDITOR')
  update(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user, spaceId, id, dto);
  }

  @Delete(':id')
  @MinRole('EDITOR')
  remove(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(user, spaceId, id);
  }
}
