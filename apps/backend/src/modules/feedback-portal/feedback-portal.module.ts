import { Module } from '@nestjs/common';
import { FeedbackPortalController } from './feedback-portal.controller';
import { FeedbackPortalService } from './feedback-portal.service';

@Module({
  controllers: [FeedbackPortalController],
  providers: [FeedbackPortalService],
  exports: [FeedbackPortalService],
})
export class FeedbackPortalModule {}
