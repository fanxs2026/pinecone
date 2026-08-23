import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { PivotReportDto, QualityReportQuery } from './reports.dto';

@ApiTags('reports')
@Controller('workspaces/:wsId/reports')
@UseGuards(WorkspaceRoleGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('overview')
  @Roles('VIEWER')
  @ApiOperation({ summary: '概览报表：Sprint 进度 + 测试趋势 + 缺陷趋势' })
  overview(@Param('wsId') wsId: string, @Query('days') days?: string) {
    return this.reportsService.overview(wsId, days ? Number(days) : 30);
  }

  @Get('burndown/:sprintId')
  @Roles('VIEWER')
  @ApiOperation({ summary: '迭代燃尽图：剩余工作量 + 理想线（storyPoints，空则降级 estimateHours）' })
  burndown(@Param('wsId') wsId: string, @Param('sprintId') sprintId: string) {
    return this.reportsService.burndown(wsId, sprintId);
  }

  @Get('velocity')
  @Roles('VIEWER')
  @ApiOperation({ summary: '速率图：每 Sprint 完成故事点/任务数 + 滚动均值（window 默认 3）' })
  velocity(@Param('wsId') wsId: string, @Query('window') window?: string) {
    return this.reportsService.velocity(wsId, window ? Number(window) : 3);
  }

  @Get('time')
  @Roles('VIEWER')
  @ApiOperation({ summary: '工时报表：预估 vs 实际，groupBy=person|feature|release，days=时间窗（默认 90）' })
  timeReports(
    @Param('wsId') wsId: string,
    @Query('groupBy') groupBy?: string,
    @Query('days') days?: string,
  ) {
    return this.reportsService.timeReports(wsId, groupBy, days ? Number(days) : 90);
  }

  @Get('discovery')
  @Roles('VIEWER')
  @ApiOperation({ summary: '产品发现报表：投票 Top 榜 + 主题榜 + RICE/ICE 分布 + 反馈→缺陷转化率' })
  discovery(@Param('wsId') wsId: string) {
    return this.reportsService.discoveryReports(wsId);
  }

  @Get('quality')
  @Roles('VIEWER')
  @ApiOperation({ summary: '发布质量报表：测试执行分布/通过率 + 缺陷 severity/逃逸率/MTTR（release 维度）' })
  quality(@Param('wsId') wsId: string, @Query() query: QualityReportQuery) {
    return this.reportsService.qualityReports(wsId, query.releaseId);
  }

  @Get('coverage')
  @Roles('VIEWER')
  @ApiOperation({ summary: '测试覆盖率报表：Story 覆盖率（TestRun PASS 口径）+ 类型分布 + 未覆盖列表' })
  coverage(@Param('wsId') wsId: string, @Query('releaseId') releaseId?: string) {
    return this.reportsService.coverageReport(wsId, releaseId);
  }

  @Post('pivot')
  @Roles('VIEWER')
  @ApiOperation({ summary: '透视表/交叉分析：实体×行维度×列维度 计数矩阵' })
  pivot(@Param('wsId') wsId: string, @Body() dto: PivotReportDto) {
    return this.reportsService.pivotReports(wsId, dto);
  }
}
