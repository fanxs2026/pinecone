import { Module } from '@nestjs/common';
import { TestAutomationController } from './test-automation.controller';
import { TestAutomationService } from './test-automation.service';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [ActivitiesModule],
  controllers: [TestAutomationController],
  providers: [TestAutomationService],
  exports: [TestAutomationService],
})
export class TestAutomationModule {}
