import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReleasesService } from './releases.service';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { UpdateReleaseStatusDto } from './dto/update-release-status.dto';

@ApiTags('Releases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/releases')
export class ReleasesController {
  constructor(private releasesService: ReleasesService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List releases in workspace' })
  findAll(@Param('wsId') wsId: string, @Query('status') status?: string) {
    return this.releasesService.findAll(wsId, { status });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a release' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateReleaseDto) {
    return this.releasesService.create(wsId, dto);
  }

  // 注意：必须放在 @Get(':id') 之前，否则 "gantt" 会被当作 id 路由
  @Get('gantt')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Gantt chart data (releases with dates + story/feature counts)' })
  gantt(@Param('wsId') wsId: string) {
    return this.releasesService.gantt(wsId);
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get release detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.releasesService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update release' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateReleaseDto) {
    return this.releasesService.update(wsId, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update release status' })
  updateStatus(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateReleaseStatusDto) {
    return this.releasesService.updateStatus(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete release' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.releasesService.remove(wsId, id);
  }
}
