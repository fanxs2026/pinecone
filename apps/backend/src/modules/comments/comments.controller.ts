import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add a comment to an entity' })
  create(
    @Param('wsId') wsId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: any,
  ) {
    return this.commentsService.create(wsId, dto, req.user.id);
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List comments for an entity' })
  findByEntity(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.commentsService.findByEntity(wsId, entityType, entityId);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Edit a comment (author only)' })
  update(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Body('content') content: string,
    @Req() req: any,
  ) {
    return this.commentsService.update(wsId, id, content, req.user.id);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  remove(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const role = req.workspaceMember?.role as 'ADMIN' | 'MEMBER' | 'VIEWER' | undefined;
    return this.commentsService.remove(wsId, id, req.user.id, role);
  }
}
