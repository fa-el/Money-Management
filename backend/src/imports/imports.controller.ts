import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { SpaceMember } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentMember, CurrentUser, MinRole } from '../common/decorators';
import { PaginationQuery } from '../common/dto';
import { SpaceGuard } from '../common/space.guard';
import type { AuthUser } from '../common/types';
import { BulkUpdateRecordsDto, UpdateImportJobDto, UpdateRecordDto, UploadImportDto } from './imports.dto';
import { ImportsService } from './imports.service';

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

@ApiTags('Smart Import')
@Controller('finance-spaces/:spaceId/imports')
@UseGuards(SpaceGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('capabilities')
  capabilities() {
    return this.imports.capabilities();
  }

  @Get()
  list(@Param('spaceId') spaceId: string, @Query() q: PaginationQuery) {
    return this.imports.list(spaceId, q.page, q.pageSize);
  }

  /** Unggah struk (sourceType=RECEIPT) atau e-statement (sourceType=E_STATEMENT). multipart/form-data, field "file". */
  @Post()
  @MinRole('MEMBER')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES + 1, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: UploadImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.upload(user, spaceId, dto, file);
  }

  @Get(':id')
  detail(@Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.detail(spaceId, id);
  }

  /** Mengunduh/menampilkan dokumen sumber — hanya untuk anggota ruang ini. */
  @Get(':id/file')
  async file(@Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { file, stream } = await this.imports.file(spaceId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }

  @Patch(':id')
  @MinRole('MEMBER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportJobDto,
  ) {
    return this.imports.updateJob(user, spaceId, id, dto.accountId);
  }

  @Patch(':id/records/:recordId')
  @MinRole('MEMBER')
  updateRecord(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.imports.updateRecord(user, spaceId, id, recordId, dto);
  }

  @Post(':id/records/bulk')
  @MinRole('MEMBER')
  bulk(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkUpdateRecordsDto,
  ) {
    return this.imports.bulkUpdate(user, spaceId, id, dto);
  }

  /** Membuat transaksi final dari baris yang disetujui. */
  @Post(':id/commit')
  @MinRole('MEMBER')
  commit(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.commit(user, spaceId, id);
  }

  @Post(':id/reprocess')
  @MinRole('MEMBER')
  reprocess(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.reprocess(user, spaceId, id);
  }

  @Delete(':id')
  @MinRole('MEMBER')
  remove(
    @CurrentUser() user: AuthUser,
    @CurrentMember() member: SpaceMember,
    @Param('spaceId') spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.remove(user, member, spaceId, id);
  }
}
