import { Module, OnModuleInit } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule implements OnModuleInit {
  constructor(private telemetryService: TelemetryService) {}

  async onModuleInit() {
    // 启动任务：更新检查（方案 B）。仅在配置了 UPDATE_CHECK_ENDPOINT 时生效。
    await this.telemetryService.runStartupTasks();
  }
}
