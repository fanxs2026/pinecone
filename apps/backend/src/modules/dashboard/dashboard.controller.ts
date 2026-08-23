import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({
    summary: 'Dashboard aggregate stats: entity open/total counts, weekly created, monthly hours, recent activity',
  })
  getStats(@Param('wsId') wsId: string) {
    return this.dashboardService.getStats(wsId);
  }
}
