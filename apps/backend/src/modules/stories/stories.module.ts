import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AutomationModule } from '../automation/automation.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [ActivitiesModule, NotificationsModule, WorkflowsModule, AutomationModule, CustomFieldsModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
