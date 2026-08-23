import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActivitiesService } from './activities.service';
import { HistoryQueryDto } from './dto/history-query.dto';

@ApiTags('History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/history')
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get change history for an entity' })
  findByEntity(
    @Param('wsId') wsId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.activitiesService.findByEntity(wsId, query.entityType, query.entityId);
  }
}
