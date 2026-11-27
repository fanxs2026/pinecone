import {
  Controller, Post, Get, Delete,
  Param, Query, UseGuards, Req, UseInterceptors,
  UploadedFile, BadRequestException, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UploadsService } from './uploads.service';
import { isAllowedUploadMime, TEXT_LIKE_MIMES } from '../../common/utils/file-magic';
import { Logger } from '@nestjs/common';
import { extname } from 'node:path';

/**
 * 扩展名 → MIME 兜底表（2026-11-27）。
 *
 * 浏览器对未在操作系统注册的扩展名（典型如 .sql）常给 **空字符串** 或
 * application/octet-stream，只按 MIME 判白名单会把合法文件一起挡掉。
 * 这里只列白名单里已经允许的类型，兜底后仍要过魔数校验（文本类：不含 NUL）。
 */
const EXT_MIME_FALLBACK: Record<string, string> = {
  '.sql': 'application/sql',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
};

function resolveUploadMime(originalname: string, declared: string): string {
  const mime = String(declared || '').trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const byExt = EXT_MIME_FALLBACK[extname(originalname || '').toLowerCase()];
  return byExt ?? mime;
}

/** 文本转码上限：超过这个大小直接流式返回，避免把大文件读进内存 */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/**
 * 文本文件统一转 UTF-8（2026-11-27）。
 * 顺带解决两个方向的问题：
 *  - 去 UTF-8 BOM（否则预览首行可能多一个不可见字符）
 *  - 历史文件多为 GBK/GB18030，直接按 UTF-8 输出会乱码，这里先转码
 */
function normalizeTextToUtf8(raw: Buffer): Buffer {
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) return raw.subarray(3);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
    return raw;
  } catch {
    return Buffer.from(new TextDecoder('gb18030').decode(raw), 'utf8');
  }
}

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

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
    // 浏览器给空 MIME（.sql 常见）时按扩展名兜底；兜底后仍要过白名单与魔数校验
    const declaredMime = file.mimetype;
    file.mimetype = resolveUploadMime(file.originalname, declaredMime);
    if (!isAllowedUploadMime(file.mimetype)) {
      // 记下浏览器真实给的类型，便于排查「明明是合法文件却传不上去」
      this.logger.warn(
        `upload rejected: name="${file.originalname}" declaredMime="${declaredMime}" resolvedMime="${file.mimetype}"`,
      );
      throw new BadRequestException(`File type "${file.mimetype || declaredMime}" is not allowed`);
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
  // ?inline=1 → Content-Disposition: inline，图片/PDF 可直接在浏览器预览（Office 类仍会下载）
  @Get(':id/download')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Download or preview an attachment (authenticated)' })
  @ApiQuery({ name: 'inline', required: false, description: '1 = 浏览器内预览（图片/PDF）' })
  async download(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const file = await this.uploadsService.getFile(wsId, id);
    const disposition = inline === '1' ? 'inline' : 'attachment';
    // filename* 用 RFC 5987 编码（中文文件名下载时才不会变成乱码/百分号串）；
    // 同时保留 filename 作为老浏览器兜底
    const encodedName = encodeURIComponent(file.fileName);
    const dispositionHeader = `${disposition}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`;

    // 文本类：显式声明 charset=utf-8。
    // 浏览器拿到没有 charset 的 text/* 会按系统编码解码（中文 Windows 走 GBK），
    // UTF-8 的中文就成了乱码 —— 这就是 .md 预览乱码的根因。
    if (TEXT_LIKE_MIMES.has(file.mimeType) && file.size <= MAX_TEXT_BYTES) {
      const chunks: Buffer[] = [];
      for await (const chunk of file.stream) chunks.push(Buffer.from(chunk as any));
      const buf = normalizeTextToUtf8(Buffer.concat(chunks));
      res.setHeader('Content-Type', `${file.mimeType}; charset=utf-8`);
      res.setHeader('Content-Disposition', dispositionHeader);
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
      return;
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', dispositionHeader);
    res.setHeader('Content-Length', String(file.size));
    file.stream.pipe(res);
  }
}
