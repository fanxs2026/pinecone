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
    // 上报端：启动时匿名上报（仅当 TELEMETRY_ENABLED + TELEMETRY_ENDPOINT 配置）
    await this.telemetryService.reportOnStartup();
  }
}
