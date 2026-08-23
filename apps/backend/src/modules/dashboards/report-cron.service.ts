import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DashboardsService } from './dashboards.service';

// G1-P2-③ 定时报表：每日 08:00 触发日报聚合（WEEKLY 订阅仅在周一发送）
@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(private dashboardsService: DashboardsService) {}

  @Cron('0 8 * * *') // 每日 08:00 触发（WEEKLY 订阅周一发送）
  async dailyDigest() {
    const count = await this.dashboardsService.runDailyDigest();
    this.logger.log(`Report digest delivered to ${count} subscription(s)`);
  }
}
