import { Controller, Get, Put, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardsService } from './dashboards.service';
import { UpsertDashboardDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './dashboards.dto';

@ApiTags('dashboards')
@Controller('workspaces/:wsId')
@UseGuards(WorkspaceRoleGuard)
export class DashboardsController {
  constructor(private dashboardsService: DashboardsService) {}

  @Get('dashboard')
  @Roles('VIEWER')
  @ApiOperation({ summary: '自定义仪表盘：读取工作区默认盘（无则 null）' })
  getDashboard(@Param('wsId') wsId: string) {
    return this.dashboardsService.getDashboard(wsId);
  }

  @Put('dashboard')
  @Roles('MEMBER')
  @ApiOperation({ summary: '自定义仪表盘：保存默认盘布局（无则创建，有则更新）' })
  upsertDashboard(
    @Param('wsId') wsId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpsertDashboardDto,
  ) {
    return this.dashboardsService.upsertDashboard(wsId, user.id, dto);
  }

  // P1 多仪表盘（2026-08-19）：每工作区多盘 CRUD
  @Get('dashboards')
  @Roles('VIEWER')
  @ApiOperation({ summary: '仪表盘列表（每工作区多盘）' })
  listDashboards(@Param('wsId') wsId: string) {
    return this.dashboardsService.listDashboards(wsId);
  }

  @Post('dashboards')
  @Roles('MEMBER')
  @ApiOperation({ summary: '新建仪表盘' })
  createDashboard(
    @Param('wsId') wsId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpsertDashboardDto,
  ) {
    return this.dashboardsService.createDashboard(wsId, user.id, dto.name ?? '');
  }

  @Put('dashboards/:id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '更新指定仪表盘（名称/布局）' })
  updateDashboard(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpsertDashboardDto) {
    return this.dashboardsService.updateDashboard(wsId, id, dto);
  }

  @Delete('dashboards/:id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '删除指定仪表盘' })
  deleteDashboard(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.dashboardsService.deleteDashboard(wsId, id);
  }

  @Get('report-subscriptions')
  @Roles('VIEWER')
  @ApiOperation({ summary: '定时报表订阅列表' })
  listSubscriptions(@Param('wsId') wsId: string) {
    return this.dashboardsService.listSubscriptions(wsId);
  }

  @Post('report-subscriptions')
  @Roles('MEMBER')
  @ApiOperation({ summary: '新建定时报表订阅（DAILY/WEEKLY，推送站内通知）' })
  createSubscription(
    @Param('wsId') wsId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.dashboardsService.createSubscription(wsId, user.id, dto);
  }

  @Patch('report-subscriptions/:id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '更新订阅（名称/频率/启停）' })
  updateSubscription(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.dashboardsService.updateSubscription(wsId, id, dto);
  }

  @Delete('report-subscriptions/:id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '删除订阅（软删）' })
  deleteSubscription(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.dashboardsService.deleteSubscription(wsId, id);
  }
}
