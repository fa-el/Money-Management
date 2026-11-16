import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { ClaudeExtractor } from './extractors/claude.extractor';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { StorageService } from './storage.service';

@Module({
  imports: [TransactionsModule],
  controllers: [ImportsController],
  providers: [ImportsService, StorageService, ClaudeExtractor],
})
export class ImportsModule {}
