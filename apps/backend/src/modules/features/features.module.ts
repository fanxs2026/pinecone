import { Module } from '@nestjs/common';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AutomationModule } from '../automation/automation.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [ActivitiesModule, NotificationsModule, WorkflowsModule, AutomationModule, CustomFieldsModule],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
