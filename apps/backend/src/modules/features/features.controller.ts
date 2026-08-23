import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeaturesService } from './features.service';
import { AutomationService } from '../automation/automation.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { SortFeatureDto } from './dto/sort-feature.dto';

@ApiTags('Features')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/features')
export class FeaturesController {
  constructor(
    private featuresService: FeaturesService,
    private automation: AutomationService,
  ) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List features in workspace' })
  findAll(
    @Param('wsId') wsId: string,
    @Req() req: any,
    @Query('releaseId') releaseId?: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
    @Query('parentFeatureId') parentFeatureId?: string,
    @Query('isEpic') isEpic?: string,
    @Query('teamId') teamId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('themeId') themeId?: string,
    @Query('minScore') minScore?: string,
  ) {
    return this.featuresService.findAll(wsId, { releaseId, status, assigneeId, priority, parentFeatureId, isEpic: isEpic === '1', teamId, sortBy, themeId, minScore: minScore ? Number(minScore) : undefined }, 0, 50, { userId: req.user.id, role: req.workspaceMember.role });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a feature' })
  async create(@Param('wsId') wsId: string, @Body() dto: CreateFeatureDto, @Req() req: any) {
    const result = await this.featuresService.create(wsId, dto, req.user.id);
    await this.automation.evaluate({ workspaceId: wsId, entityType: 'FEATURE', entityId: result.id, entityTitle: result.title, actorId: req.user.id, trigger: 'CREATED' });
    return result;
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get feature detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.featuresService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update feature' })
  async update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateFeatureDto, @Req() req: any) {
    const result = await this.featuresService.update(wsId, id, dto, req.user.id);
    if (dto.status) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'FEATURE', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'STATUS_CHANGED', triggerValue: dto.status });
    }
    if (dto.assigneeId) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'FEATURE', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'ASSIGNED' });
    }
    return result;
  }

  @Patch(':id/sort')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update feature sort order' })
  updateSort(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: SortFeatureDto) {
    return this.featuresService.updateSortOrder(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete feature' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.featuresService.remove(wsId, id);
  }
}
