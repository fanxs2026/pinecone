import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityType } from '../../generated/enums';
import { Prisma } from '../../generated/client';
import { CreateSavedViewDto, UpdateSavedViewDto } from './dto/saved-view.dto';

/**
 * 列表保存视图。
 *
 * 可见性规则：
 * - 个人视图（isShared=false）只有创建者能看到与修改；
 * - 共享视图（isShared=true）工作区成员都能看到，但只有创建者能改。
 *
 * 刻意不做「管理员可改他人视图」：视图是个人工作习惯，被他人改动比看不到更难受。
 */
@Injectable()
export class SavedViewsService {
  constructor(private prisma: PrismaService) {}

  async findAll(workspaceId: string, entityType: string, userId: string) {
    const items = await this.prisma.savedView.findMany({
      where: {
        workspaceId,
        entityType: entityType as EntityType,
        OR: [{ isShared: true }, { createdById: userId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    return items.map((v) => ({ ...v, isMine: v.createdById === userId }));
  }

  async create(workspaceId: string, dto: CreateSavedViewDto, userId: string) {
    try {
      return await this.prisma.savedView.create({
        data: {
          workspaceId,
          entityType: dto.entityType as EntityType,
          name: dto.name.trim(),
          filters: dto.filters as Prisma.InputJsonValue,
          columns: dto.columns ? (dto.columns as Prisma.InputJsonValue) : undefined,
          isShared: dto.isShared ?? false,
          createdById: userId,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === 'P2002') {
        throw new BadRequestException(`视图名称「${dto.name}」已存在，请换一个`);
      }
      throw error;
    }
  }

  async update(workspaceId: string, id: string, dto: UpdateSavedViewDto, userId: string) {
    const existing = await this.prisma.savedView.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('视图不存在');
    if (existing.createdById !== userId) {
      throw new ForbiddenException('只能修改自己创建的视图');
    }

    try {
      return await this.prisma.savedView.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.filters !== undefined ? { filters: dto.filters as Prisma.InputJsonValue } : {}),
          ...(dto.columns !== undefined ? { columns: dto.columns as Prisma.InputJsonValue } : {}),
          ...(dto.isShared !== undefined ? { isShared: dto.isShared } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === 'P2002') {
        throw new BadRequestException(`视图名称「${dto.name}」已存在，请换一个`);
      }
      throw error;
    }
  }

  async remove(workspaceId: string, id: string, userId: string) {
    const existing = await this.prisma.savedView.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('视图不存在');
    if (existing.createdById !== userId) {
      throw new ForbiddenException('只能删除自己创建的视图');
    }
    await this.prisma.savedView.delete({ where: { id } });
    return { id };
  }
}
