import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TelemetryService } from './telemetry.service';

@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private telemetryService: TelemetryService) {}

  /** 实例上报（匿名，公开端点，无需登录）——P2-④：限流防匿名写库滥用（TelemetryReport 表膨胀） */
  @Post('ping')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Receive anonymous usage report from an instance' })
  ping(@Body() body: { instanceId: string; edition?: string; version?: string; counts?: Record<string, number> }) {
    return this.telemetryService.record(body);
  }

  /** 更新检查通道（方案 B）：实例侧启动/每日调用，顺带记录心跳（公开）——P2-④：限流防心跳表刷爆 */
  @Get('updates/check')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check latest version; instance heartbeat recorded as side effect' })
  checkUpdate(@Query('instanceId') instanceId?: string, @Query('version') version?: string, @Query('edition') edition?: string) {
    return this.telemetryService.checkUpdate({ instanceId, version, edition });
  }

  /** 活跃实例列表（管理端） */
  @Get('instances')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List active instances (admin)' })
  listInstances(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.telemetryService.listInstances({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(200, Math.max(1, Number(pageSize) || 50)),
    });
  }

  /** 聚合视图（管理端，需登录） */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aggregated telemetry summary (admin)' })
  summary() {
    return this.telemetryService.summary();
  }
}
