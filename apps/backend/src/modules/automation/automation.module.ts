import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';

/**
 * 社区版内核：仅提供 AutomationService（被社区实体 CRUD 用作触发器钩子）。
 * 企业管理端点（规则 CRUD UI）由 overlay 的 enterprise automation 模块承载。
 */
@Module({
  imports: [NotificationsModule, WorkflowsModule],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
