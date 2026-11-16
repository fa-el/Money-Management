import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FinanceSpace, SpaceMember } from '@prisma/client';
import { CurrentMember, CurrentSpace, CurrentUser, MinRole } from '../common/decorators';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { MembersService } from './members.service';
import { ChangeRoleDto, CreateSpaceDto, InviteMemberDto, UpdateSpaceDto } from './spaces.dto';
import { SpacesService } from './spaces.service';

@ApiTags('Finance Spaces')
@Controller('finance-spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.spaces.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSpaceDto) {
    return this.spaces.create(user, dto);
  }

  @Get(':spaceId')
  @UseGuards(SpaceGuard)
  detail(@CurrentSpace() space: FinanceSpace, @CurrentMember() member: SpaceMember) {
    return this.spaces.detail(space, member);
  }

  @Patch(':spaceId')
  @UseGuards(SpaceGuard)
  @MinRole('ADMIN')
  update(@CurrentUser() user: AuthUser, @CurrentSpace() space: FinanceSpace, @Body() dto: UpdateSpaceDto) {
    return this.spaces.update(user, space, dto);
  }

  /** Hanya OWNER. Wajib menyertakan ?confirm=<nama ruang>. Data di-soft delete. */
  @Delete(':spaceId')
  @UseGuards(SpaceGuard)
  @MinRole('OWNER')
  remove(@CurrentUser() user: AuthUser, @CurrentSpace() space: FinanceSpace, @Query('confirm') confirm?: string) {
    return this.spaces.remove(user, space, confirm);
  }
}

@ApiTags('Members')
@Controller('finance-spaces/:spaceId/members')
@UseGuards(SpaceGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  async list(@Param('spaceId') spaceId: string, @CurrentSpace() space: FinanceSpace) {
    return { data: await this.members.list(spaceId), allowedRoles: this.members.allowedRoles(space) };
  }

  @Post()
  @MinRole('ADMIN')
  invite(
    @CurrentUser() user: AuthUser,
    @CurrentMember() actor: SpaceMember,
    @CurrentSpace() space: FinanceSpace,
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(user, actor, space, dto.email, dto.role);
  }

  @Delete('me')
  leave(@CurrentUser() user: AuthUser, @CurrentMember() actor: SpaceMember, @CurrentSpace() space: FinanceSpace) {
    return this.members.leave(user, actor, space);
  }

  @Patch(':memberId/role')
  @MinRole('ADMIN')
  changeRole(
    @CurrentUser() user: AuthUser,
    @CurrentMember() actor: SpaceMember,
    @CurrentSpace() space: FinanceSpace,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.members.changeRole(user, actor, space, memberId, dto.role);
  }

  @Post(':memberId/transfer-ownership')
  @MinRole('OWNER')
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @CurrentMember() actor: SpaceMember,
    @CurrentSpace() space: FinanceSpace,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.transferOwnership(user, actor, space, memberId);
  }

  @Delete(':memberId')
  @MinRole('ADMIN')
  remove(
    @CurrentUser() user: AuthUser,
    @CurrentMember() actor: SpaceMember,
    @CurrentSpace() space: FinanceSpace,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.remove(user, actor, space, memberId);
  }
}

@ApiTags('Members')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.members.myInvitations(user.id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.respond(user, id, true);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.respond(user, id, false);
  }
}
