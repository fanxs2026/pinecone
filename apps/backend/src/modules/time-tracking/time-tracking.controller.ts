import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TimeTrackingService } from './time-tracking.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

@ApiTags('Time Tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/time-entries')
export class TimeTrackingController {
  constructor(private timeTrackingService: TimeTrackingService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List time entries in workspace' })
  @ApiQuery({ name: 'storyId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO)' })
  findAll(
    @Param('wsId') wsId: string,
    @Query('storyId') storyId?: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timeTrackingService.findAll(wsId, { storyId, userId, entityType, entityId, from, to });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a time entry' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateTimeEntryDto, @Req() req: any) {
    return this.timeTrackingService.create(wsId, dto, req.user.id);
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get time entry detail' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.timeTrackingService.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a time entry (owner only)' })
  update(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
    @Req() req: any,
  ) {
    return this.timeTrackingService.update(wsId, id, dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a time entry (owner or admin)' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Req() req: any) {
    const role = req.workspaceMember?.role as 'ADMIN' | 'MEMBER' | 'VIEWER' | undefined;
    return this.timeTrackingService.remove(wsId, id, req.user.id, role);
  }
}
