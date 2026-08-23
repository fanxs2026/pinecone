import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SupportsService } from './supports.service';
import { AutomationService } from '../automation/automation.service';
import { CreateSupportDto } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';

@ApiTags('Supports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/supports')
export class SupportsController {
  constructor(
    private supportsService: SupportsService,
    private automation: AutomationService,
  ) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List supports in workspace' })
  findAll(
    @Param('wsId') wsId: string,
    @Req() req: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('teamId') teamId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('themeId') themeId?: string,
    @Query('minScore') minScore?: string,
  ) {
    return this.supportsService.findAll(wsId, { status, search, teamId, sortBy, themeId, minScore: minScore ? Number(minScore) : undefined }, 0, 50, { userId: req.user.id, role: req.workspaceMember.role });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a support request' })
  async create(@Param('wsId') wsId: string, @Body() dto: CreateSupportDto, @Req() req: any) {
    const result = await this.supportsService.create(wsId, dto, req.user.id);
    await this.automation.evaluate({ workspaceId: wsId, entityType: 'SUPPORT', entityId: result.id, entityTitle: result.title, actorId: req.user.id, trigger: 'CREATED' });
    return result;
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get support detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.supportsService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a support request' })
  async update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateSupportDto, @Req() req: any) {
    const result = await this.supportsService.update(wsId, id, dto, req.user.id);
    if (dto.status) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'SUPPORT', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'STATUS_CHANGED', triggerValue: dto.status });
    }
    if (dto.assigneeId) {
      await this.automation.evaluate({ workspaceId: wsId, entityType: 'SUPPORT', entityId: id, entityTitle: result.title, actorId: req.user.id, trigger: 'ASSIGNED' });
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a support request' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.supportsService.remove(wsId, id);
  }
}
