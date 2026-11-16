import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MinRole } from '../common/decorators';
import { PaginationQuery } from '../common/dto';
import { SpaceGuard } from '../common/space.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@Controller('finance-spaces/:spaceId/audit-logs')
@UseGuards(SpaceGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @MinRole('ADMIN')
  list(@Param('spaceId') spaceId: string, @Query() q: PaginationQuery) {
    return this.audit.list(spaceId, q.page, q.pageSize);
  }
}
