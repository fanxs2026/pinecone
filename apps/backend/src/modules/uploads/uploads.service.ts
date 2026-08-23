import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { unlink } from 'node:fs/promises';
import { createReadStream, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { assertFileContentMatchesMime } from '../../common/utils/file-magic';

// Keep in sync with UploadsController.ALLOWED_MIME_TYPES (defense-in-depth)
// P1-①：移除纯压缩包类型（UI 仅支持图片；压缩包无解压扫描能力，放行=存储型恶意文件风险）
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

/** 魔数校验需读取的头部字节数（覆盖 JPEG/PNG/GIF/WEBP/PDF/ZIP 全部魔数签名） */
const MAGIC_HEADER_BYTES = 12;

type WorkspaceRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

@Injectable()
export class UploadsService {
  constructor(private prisma: PrismaService) {}

  async create(
    workspaceId: string,
    entityType: string,
    entityId: string,
    userId: string,
    file: { originalname: string; size: number; mimetype: string; path: string },
    category: 'FILE' | 'SCREENSHOT' = 'FILE',
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    }
    // P1-①：文件内容魔数校验（防 MIME 伪造上传恶意文件）——双层防御的第二层
    this.assertMagicNumber(file.mimetype, file.path);
    return this.prisma.attachment.create({
      data: {
        workspaceId,
        entityType,
        entityId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storagePath: file.path,
        uploadedById: userId,
        category,
      },
      include: {
        uploadedBy: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /** 读取文件头部并校验魔数与声明 MIME 匹配；不匹配则抛 400 */
  private assertMagicNumber(mimetype: string, filePath: string): void {
    let fd: number;
    try {
      fd = openSync(filePath, 'r');
    } catch {
      throw new BadRequestException('File could not be read for validation');
    }
    try {
      const header = Buffer.alloc(MAGIC_HEADER_BYTES);
      const bytesRead = readSync(fd, header, 0, MAGIC_HEADER_BYTES, 0);
      try {
        assertFileContentMatchesMime(mimetype, header.subarray(0, bytesRead));
      } catch (e: any) {
        throw new BadRequestException(e?.message || 'File content validation failed');
      }
    } finally {
      closeSync(fd);
    }
  }

  async findByEntity(workspaceId: string, entityType: string, entityId: string) {
    return this.prisma.attachment.findMany({
      where: { workspaceId, entityType, entityId },
      include: {
        uploadedBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(workspaceId: string, id: string, userId: string, role?: WorkspaceRole) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, workspaceId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    // Only the uploader or a workspace admin can delete
    if (attachment.uploadedById !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete attachments you uploaded');
    }

    await this.prisma.attachment.delete({ where: { id } });

    // Best-effort cleanup of the physical file (never fail the request on FS errors)
    try {
      await unlink(attachment.storagePath);
    } catch {
      // file may already be gone — ignore
    }

    return { deleted: true };
  }

  /**
   * P3-10 修复：鉴权下载（生产环境静态 /uploads 已关闭，前端经此端点取文件）。
   * 返回 { stream, fileName, mimeType, size }，由 controller 流式响应。
   */
  async getFile(workspaceId: string, id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, workspaceId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    // F-03 修复：multer 存的是绝对路径，绝对路径不能再 join（否则双重拼接）
    // 相对路径才需要与 cwd 拼接
    const fullPath = isAbsolute(attachment.storagePath)
      ? attachment.storagePath
      : join(process.cwd(), attachment.storagePath);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) throw new NotFoundException('Attachment file missing');
      return {
        stream: createReadStream(fullPath),
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: stat.size,
      };
    } catch (e: any) {
      if (e?.code === 'ENOENT') throw new NotFoundException('Attachment file missing');
      throw e;
    }
  }
}
