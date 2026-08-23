import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdeasService } from './ideas.service';
import { AutomationService } from '../automation/automation.service';
import { CreateIdeaDto } from './dto/create-idea.dto';
import { UpdateIdeaDto } from './dto/update-idea.dto';

@ApiTags('Ideas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/ideas')
export class IdeasController {
  constructor(
    private ideasService: IdeasService,
    private automation: AutomationService,
  ) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List ideas in workspace' })
  findAll(
    @Param('wsId') wsId: string,
    @Req() req: any,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('teamId') teamId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('themeId') themeId?: string,
    @Query('minScore') minScore?: string,
  ) {
    return this.ideasService.findAll(wsId, { status, category, search, teamId, sortBy, themeId, minScore: minScore ? Number(minScore) : undefined }, 0, 50, { userId: req.user.id, role: req.workspaceMember.role });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create an idea' })
  async create(@Param('wsId') wsId: string, @Body() dto: CreateIdeaDto, @Req() req: any) {
    const result = await this.ideasService.create(wsId, dto, req.user.id);
    await this.automation.evaluate({ workspaceId: wsId, entityType: 'IDEA', entityId: result.id, entityTitle: result.title, actorId: req.user.id, trigger: 'CREATED' });
    return result;
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get idea detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.ideasService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update an idea' })
  async update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateIdeaDto, @Req() req: any) {
    const result = await this.ideasService.update(wsId, id, dto, req.user.id);
    if (dto.status) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'IDEA', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'STATUS_CHANGED', triggerValue: dto.status });
    }
    if (dto.assigneeId) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'IDEA', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'ASSIGNED' });
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete an idea' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.ideasService.remove(wsId, id);
  }
}
