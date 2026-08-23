import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { ReportCronService } from './report-cron.service';
import { ReportsModule } from '../reports/reports.module';
import { MailModule } from '../mail/mail.module';

// G1-P1-③ / P2-③：自定义仪表盘 + 定时报表订阅（2026-08-16）；P1 邮件投递（2026-08-19）
@Module({
  imports: [ReportsModule, MailModule],
  controllers: [DashboardsController],
  providers: [DashboardsService, ReportCronService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
