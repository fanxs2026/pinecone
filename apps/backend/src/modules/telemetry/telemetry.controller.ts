import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { TelemetryService } from './telemetry.service';

/**
 * 仅保留实例侧（客户端）能力：更新检查 + 心跳。
 *
 * 已下线（2026-11-28，发布软件不提供厂商侧运营能力）：
 * - `POST /telemetry/ping`              匿名上报接收端：无消费方，且 telemetry_report 逐条
 *                                       insert 会无限增长 → 白送一个写库入口
 * - `GET  /telemetry/instances`        活跃实例列表（平台管理面）
 * - `GET  /telemetry/summary`          用量聚合视图（平台管理面）
 */
@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private telemetryService: TelemetryService) {}

  /** 更新检查通道（方案 B）：实例侧启动/每日调用，顺带记录心跳（公开）——P2-④：限流防心跳表刷爆 */
  @Get('updates/check')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check latest version; instance heartbeat recorded as side effect' })
  checkUpdate(@Query('instanceId') instanceId?: string, @Query('version') version?: string, @Query('edition') edition?: string) {
    return this.telemetryService.checkUpdate({ instanceId, version, edition });
  }
}
