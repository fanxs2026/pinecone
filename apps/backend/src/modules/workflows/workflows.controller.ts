import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateTransitionDto } from './dto/create-transition.dto';
import { UpdateTransitionDto } from './dto/update-transition.dto';
import { EntityType, UserRole } from '../../generated/enums';

@ApiTags('Workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/workflows')
export class WorkflowsController {
  constructor(private workflowsService: WorkflowsService) {}

  // ── Workflow endpoints ────────────────────────────────────

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List workflows in workspace' })
  findAll(@Param('wsId') wsId: string) {
    return this.workflowsService.findAll(wsId);
  }

  @Get('by-entity')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get workflow by entity type' })
  @ApiQuery({ name: 'entityType', enum: EntityType })
  findByEntity(@Param('wsId') wsId: string, @Query('entityType') entityType: EntityType) {
    return this.workflowsService.findByEntity(wsId, entityType);
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a workflow' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(wsId, dto);
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get workflow detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.workflowsService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update workflow' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowsService.update(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete workflow' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.workflowsService.remove(wsId, id);
  }

  // ── Status endpoints ──────────────────────────────────────

  @Post(':workflowId/statuses')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add status to workflow' })
  addStatus(
    @Param('wsId') wsId: string,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.workflowsService.addStatus(wsId, workflowId, dto);
  }

  @Patch('statuses/:statusId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a status' })
  updateStatus(
    @Param('wsId') wsId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.workflowsService.updateStatus(wsId, statusId, dto);
  }

  @Delete('statuses/:statusId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a status' })
  removeStatus(@Param('wsId') wsId: string, @Param('statusId') statusId: string) {
    return this.workflowsService.removeStatus(wsId, statusId);
  }

  @Patch(':workflowId/statuses/reorder')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Reorder statuses in workflow' })
  reorderStatuses(
    @Param('wsId') wsId: string,
    @Param('workflowId') workflowId: string,
    @Body() statusOrder: { id: string; sortOrder: number }[],
  ) {
    return this.workflowsService.reorderStatuses(wsId, workflowId, statusOrder);
  }

  // ── Transition endpoints ──────────────────────────────────

  @Post('transitions')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a status transition' })
  addTransition(@Param('wsId') wsId: string, @Body() dto: CreateTransitionDto) {
    return this.workflowsService.addTransition(wsId, dto);
  }

  @Patch('transitions/:id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a transition' })
  updateTransition(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionDto,
  ) {
    return this.workflowsService.updateTransition(wsId, id, dto);
  }

  @Delete('transitions/:id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a transition' })
  removeTransition(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.workflowsService.removeTransition(wsId, id);
  }

  @Get(':workflowId/transitions/allowed')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get allowed transitions for a status and role' })
  @ApiQuery({ name: 'currentStatusId', required: true })
  @ApiQuery({ name: 'userRole', enum: UserRole })
  getAllowedTransitions(
    @Param('wsId') wsId: string,
    @Param('workflowId') workflowId: string,
    @Query('currentStatusId') currentStatusId: string,
    @Query('userRole') userRole: UserRole,
  ) {
    return this.workflowsService.getAllowedTransitions(wsId, workflowId, currentStatusId, userRole);
  }
}
