import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VOTABLE_TYPES = ['IDEA', 'SUPPORT', 'FEATURE'] as const;

/** 投票（P0）：内部用户按 userId 去重；门户客户按 email 去重 */
@Injectable()
export class VotesService {
  constructor(private prisma: PrismaService) {}

  async create(workspaceId: string, entityType: string, entityId: string, userId: string) {
    if (!(VOTABLE_TYPES as readonly string[]).includes(entityType)) {
      throw new BadRequestException('Invalid entity type for voting');
    }
    const entity = await this.findEntity(workspaceId, entityType, entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    try {
      await this.prisma.vote.create({
        data: { workspaceId, entityType: entityType as any, entityId, voterUserId: userId },
      });
    } catch (e: any) {
      // 唯一约束冲突 = 已投过，幂等返回
      if (e?.code === 'P2002') return { ok: true, alreadyVoted: true };
      throw e;
    }
    return { ok: true, alreadyVoted: false };
  }

  async remove(workspaceId: string, entityType: string, entityId: string, userId: string) {
    await this.prisma.vote.deleteMany({
      where: { workspaceId, entityType: entityType as any, entityId, voterUserId: userId },
    });
    return { ok: true };
  }

  /** 批量计数：{ entityId: count } */
  async counts(workspaceId: string, entityType: string, ids: string[]) {
    if (!ids.length) return {};
    const rows = await this.prisma.vote.groupBy({
      by: ['entityId'],
      where: { workspaceId, entityType: entityType as any, entityId: { in: ids } },
      _count: { _all: true },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.entityId] = r._count._all;
    return map;
  }

  private async findEntity(workspaceId: string, entityType: string, entityId: string) {
    const base = { id: entityId, workspaceId, deletedAt: null };
    switch (entityType) {
      case 'IDEA': return this.prisma.idea.findFirst({ where: base });
      case 'SUPPORT': return this.prisma.support.findFirst({ where: base });
      case 'FEATURE': return this.prisma.feature.findFirst({ where: base });
      default: return null;
    }
  }
}
