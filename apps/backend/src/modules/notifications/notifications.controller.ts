import { Controller, Get, Patch, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';

interface AuthedRequest extends Request {
  user: { id: string; email: string };
}

@ApiTags('notifications')
@Controller('workspaces/:wsId/notifications')
@UseGuards(WorkspaceRoleGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List my notifications (paginated)' })
  list(
    @Param('wsId') wsId: string,
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listMine(wsId, req.user.id, Number(page) || 1, Math.min(Number(pageSize) || 20, 50));
  }

  @Get('count')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Unread notification count' })
  count(@Param('wsId') wsId: string, @Req() req: AuthedRequest) {
    return this.service.unreadCount(wsId, req.user.id);
  }

  @Patch(':id/read')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@Param('wsId') wsId: string, @Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.markRead(id, req.user.id);
  }

  @Post('read-all')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllRead(@Param('wsId') wsId: string, @Req() req: AuthedRequest) {
    return this.service.markAllRead(wsId, req.user.id);
  }
}
