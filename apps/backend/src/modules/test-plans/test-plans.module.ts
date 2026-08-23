import { Module } from '@nestjs/common';
import { TestPlansController } from './test-plans.controller';
import { TestPlansService } from './test-plans.service';

@Module({
  controllers: [TestPlansController],
  providers: [TestPlansService],
})
export class TestPlansModule {}
