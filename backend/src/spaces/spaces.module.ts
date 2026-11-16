import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { InvitationsController, MembersController, SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  controllers: [SpacesController, MembersController, InvitationsController],
  providers: [SpacesService, MembersService],
})
export class SpacesModule {}
