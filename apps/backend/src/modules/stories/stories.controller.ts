import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StoriesService } from './stories.service';
import { AutomationService } from '../automation/automation.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { SortStoryDto } from './dto/sort-story.dto';

@ApiTags('Stories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/stories')
export class StoriesController {
  constructor(
    private storiesService: StoriesService,
    private automation: AutomationService,
  ) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List stories in workspace' })
  findAll(
    @Param('wsId') wsId: string,
    @Req() req: any,
    @Query('featureId') featureId?: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
    @Query('sprintId') sprintId?: string,
    @Query('backlog') backlog?: string,
    @Query('parentId') parentId?: string,
    @Query('isSubtask') isSubtask?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.storiesService.findAll(wsId, { featureId, status, assigneeId, priority, sprintId, backlog: backlog === '1', parentId, isSubtask: isSubtask === '1', teamId }, 0, 50, { userId: req.user.id, role: req.workspaceMember.role });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a story' })
  async create(@Param('wsId') wsId: string, @Body() dto: CreateStoryDto, @Req() req: any) {
    const result = await this.storiesService.create(wsId, dto, req.user.id);
    await this.automation.evaluate({ workspaceId: wsId, entityType: 'STORY', entityId: result.id, entityTitle: result.title, actorId: req.user.id, trigger: 'CREATED' });
    return result;
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get story detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.storiesService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update story' })
  async update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateStoryDto, @Req() req: any) {
    const result = await this.storiesService.update(wsId, id, dto, req.user.id);
    if (dto.status) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'STORY', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'STATUS_CHANGED', triggerValue: dto.status });
    }
    if (dto.assigneeId) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'STORY', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'ASSIGNED' });
    }
    return result;
  }

  @Patch(':id/sort')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update story sort order' })
  updateSort(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: SortStoryDto) {
    return this.storiesService.updateSortOrder(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete story' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.storiesService.remove(wsId, id);
  }
}
