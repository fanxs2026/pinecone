import {
  Controller, Post, Get, Delete,
  Param, Query, UseGuards, Req, UseInterceptors,
  UploadedFile, BadRequestException, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UploadsService } from './uploads.service';

// Allowed upload types (defense-in-depth: enforced here and in the service)
// P1-①：移除纯压缩包类型（与 service 白名单保持一致；UI 仅支持图片）
const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
]);

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Upload a file or screenshot' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('category') category: 'FILE' | 'SCREENSHOT',
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!entityType || !entityId) throw new BadRequestException('entityType and entityId are required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    }
    return this.uploadsService.create(
      wsId,
      entityType,
      entityId,
      req.user.id,
      file,
      category || 'FILE',
    );
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List attachments for an entity' })
  list(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.uploadsService.findByEntity(wsId, entityType, entityId);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete an attachment (uploader or admin)' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Req() req: any) {
    // req.workspaceMember is set by WorkspaceRoleGuard
    const role = req.workspaceMember?.role as 'ADMIN' | 'MEMBER' | 'VIEWER' | undefined;
    return this.uploadsService.remove(wsId, id, req.user.id, role);
  }

  // P3-10：鉴权下载（生产静态 /uploads 已关闭，前端经此端点取文件）
  @Get(':id/download')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Download an attachment (authenticated)' })
  async download(@Param('wsId') wsId: string, @Param('id') id: string, @Res() res: Response) {
    const file = await this.uploadsService.getFile(wsId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader('Content-Length', String(file.size));
    file.stream.pipe(res);
  }
}
