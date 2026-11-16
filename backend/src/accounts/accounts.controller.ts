import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@ApiTags('Accounts')
@Controller('finance-spaces/:spaceId/accounts')
@UseGuards(SpaceGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Daftar akun beserta saldo terkini dan total saldo ruang. */
  @Get()
  list(@Param('spaceId') spaceId: string, @Query('asOf') asOf?: string) {
    return this.accounts.summary(spaceId, asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : undefined);
  }

  @Post()
  @MinRole('EDITOR')
  create(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user, spaceId, dto);
  }

  @Patch(':id')
  @MinRole('EDITOR')
  update(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(user, spaceId, id, dto);
  }

  @Delete(':id')
  @MinRole('EDITOR')
  remove(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(user, spaceId, id);
  }
}
