import { Module } from '@nestjs/common';
import { SupportsController } from './supports.controller';
import { SupportsService } from './supports.service';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AutomationModule } from '../automation/automation.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [ActivitiesModule, NotificationsModule, WorkflowsModule, AutomationModule, CustomFieldsModule],
  controllers: [SupportsController],
  providers: [SupportsService],
  exports: [SupportsService],
})
export class SupportsModule {}
