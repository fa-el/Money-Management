import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsController, TransfersController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [BudgetsModule],
  controllers: [TransactionsController, TransfersController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
