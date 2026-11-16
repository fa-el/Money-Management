import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CategoriesModule } from './categories/categories.module';
import { AuthGuard } from './common/auth.guard';
import { HealthController } from './health.controller';
import { GoalsModule } from './goals/goals.module';
import { ImportsModule } from './imports/imports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecurringModule } from './recurring/recurring.module';
import { ReportsModule } from './reports/reports.module';
import { SpacesModule } from './spaces/spaces.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    SpacesModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    RecurringModule,
    BudgetsModule,
    GoalsModule,
    ReportsModule,
    ImportsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
