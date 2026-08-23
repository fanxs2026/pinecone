import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List user workspaces' })
  findAll(@Req() req: any) {
    return this.workspacesService.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create workspace' })
  create(@Body() dto: CreateWorkspaceDto, @Req() req: any) {
    return this.workspacesService.create(dto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace detail' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.workspacesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update workspace' })
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspacesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete workspace' })
  remove(@Param('id') id: string) {
    return this.workspacesService.remove(id);
  }

  @Post(':id/members')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Invite member to workspace' })
  inviteMember(@Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.workspacesService.inviteMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remove member from workspace' })
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Req() req: any) {
    return this.workspacesService.removeMember(id, userId, req.user.id);
  }

  @Get(':id/members')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List workspace members' })
  getMembers(@Param('id') id: string) {
    return this.workspacesService.getMembers(id);
  }

  @Get(':id/tags')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get all tags used in workspace' })
  getTags(@Param('id') id: string) {
    return this.workspacesService.getAllTags(id);
  }

  @Patch(':id/members/:userId/role')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update member role' })
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspacesService.updateMemberRole(id, userId, dto);
  }
}
