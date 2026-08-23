import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/client';
import { EntityType } from '../../generated/enums';
import {
  DEFAULT_SCORING_CONFIG,
  normalizeScoringConfig,
  computeWeightedScore,
  enrichScore,
  ScoringConfig,
  ScoringDimension,
} from '../../common/scoring';

const SCORABLE_TYPES = ['IDEA', 'SUPPORT', 'FEATURE'] as const;

/**
 * 评分维度值：数值维度 + 内部自动 reach 标记。
 * 与 common/scoring.ts 的 _reachAuto 约定一致——读取端由 enrichScore 动态重算并剥离。
 */
type ScoreDimensions = {
  [key: string]: number | boolean | undefined;
  _reachAuto?: boolean;
};

/** 优先级评分（P0）：RICE / ICE / CUSTOM，独立 Score 表，weightedScore 落库便于排序 */
@Injectable()
export class ScoresService {
  constructor(private prisma: PrismaService) {}

  async getConfig(workspaceId: string): Promise<ScoringConfig> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { scoringConfig: true },
    });
    return normalizeScoringConfig(ws?.scoringConfig);
  }

  async updateConfig(
    workspaceId: string,
    dto: { model?: ScoringConfig['model']; dimensions?: ScoringDimension[] },
  ): Promise<ScoringConfig> {
    const current = await this.getConfig(workspaceId);
    // R 修复（2026-08-19）：dimensions 逐项校验 key/weight/scale（防脏数据注入导致 NaN/畸形配置）
    let dimensions = current.dimensions;
    if (dto.dimensions?.length) {
      for (const d of dto.dimensions) {
        if (!d || typeof d.key !== 'string' || !d.key.trim()) {
          throw new BadRequestException('Each dimension must have a non-empty key');
        }
        if (d.weight !== undefined && (!Number.isFinite(Number(d.weight)) || Number(d.weight) < 0)) {
          throw new BadRequestException(`Dimension "${d.key}" weight must be a non-negative number`);
        }
        if (d.scale !== undefined && (!Number.isFinite(Number(d.scale)) || Number(d.scale) < 0)) {
          throw new BadRequestException(`Dimension "${d.key}" scale must be a non-negative number`);
        }
      }
      dimensions = dto.dimensions;
    }
    const next: ScoringConfig = {
      model: (dto.model ?? current.model) as ScoringConfig['model'],
      dimensions,
    };
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { scoringConfig: next as Prisma.InputJsonValue },
    });
    return next;
  }

  /** 保存/更新评分。RICE 模型下 reach 未填 → 自动取该实体票数（票数→Reach 闭环） */
  async upsert(
    workspaceId: string,
    dto: { entityType: string; entityId: string; model?: string; dimensions: Record<string, number> },
  ) {
    if (!(SCORABLE_TYPES as readonly string[]).includes(dto.entityType)) {
      throw new BadRequestException('Invalid entity type for scoring');
    }
    const entity = await this.findEntity(workspaceId, dto.entityType, dto.entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    const config = await this.getConfig(workspaceId);
    const model = dto.model ?? config.model;

    const dimensions: ScoreDimensions = { ...(dto.dimensions ?? {}) };
    // 票数 → Reach 自动喂入（仅 RICE，且用户未手动指定时）。2026-08-15：
    // 存 _reachAuto 标记，读取时用当前票数动态重算（不再是快照）
    const reachManual =
      dimensions.reach !== undefined && dimensions.reach !== null && !Number.isNaN(dimensions.reach);
    if (model === 'RICE' && !reachManual) {
      const count = await this.prisma.vote.count({
        where: { workspaceId, entityType: dto.entityType as EntityType, entityId: dto.entityId },
      });
      dimensions.reach = count;
      dimensions._reachAuto = true;
    } else {
      delete dimensions._reachAuto;
    }

    const weightedScore = computeWeightedScore(model, dimensions as Record<string, number>, config);
    const score = await this.prisma.score.upsert({
      where: {
        entityType_entityId: {
          entityType: dto.entityType as EntityType,
          entityId: dto.entityId,
        },
      },
      create: {
        workspaceId,
        entityType: dto.entityType as EntityType,
        entityId: dto.entityId,
        model,
        dimensions: dimensions as Prisma.InputJsonValue,
        weightedScore,
      },
      update: {
        model,
        dimensions: dimensions as Prisma.InputJsonValue,
        weightedScore,
      },
    });
    // I7 评分历史快照（2026-08-18 P1，老板拍板：仅保存时快照）——每次保存留痕，供趋势曲线
    await this.prisma.scoreHistory
      .create({
        data: {
          workspaceId,
          entityType: dto.entityType as EntityType,
          entityId: dto.entityId,
          model,
          dimensions: dimensions as Prisma.InputJsonValue,
          weightedScore,
        },
      })
      .catch(() => null);
    return {
      ...score,
      ...enrichScore(score, typeof dimensions.reach === 'number' ? dimensions.reach : undefined),
    };
  }

  /** I7 评分历史（按时间正序，供前端趋势曲线） */
  async history(entityType: string, entityId: string, take = 30) {
    const rows = await this.prisma.scoreHistory.findMany({
      where: { entityType: entityType as EntityType, entityId },
      orderBy: { createdAt: 'asc' },
      take,
      select: { weightedScore: true, model: true, dimensions: true, createdAt: true },
    });
    return rows.map((r) => ({
      weightedScore: r.weightedScore,
      model: r.model,
      reach: (r.dimensions as { reach?: number | null })?.reach ?? null,
      createdAt: r.createdAt,
    }));
  }

  async remove(workspaceId: string, entityType: string, entityId: string) {
    await this.prisma.score.deleteMany({
      where: { workspaceId, entityType: entityType as EntityType, entityId },
    });
    return { ok: true };
  }

  async getByEntity(workspaceId: string, entityType: string, entityId: string) {
    const score = await this.prisma.score.findUnique({
      where: { entityType_entityId: { entityType: entityType as EntityType, entityId } },
    });
    if (!score) return null;
    const count = await this.prisma.vote.count({
      where: { workspaceId, entityType: entityType as EntityType, entityId },
    });
    return enrichScore(score, count);
  }

  /** 列表聚合：{ entityId: { model, weightedScore, dimensions, reachAuto } }（动态重算） */
  async batchGet(workspaceId: string, entityType: string, ids: string[]) {
    if (!ids.length) return {};
    const rows = await this.prisma.score.findMany({
      where: { workspaceId, entityType: entityType as EntityType, entityId: { in: ids } },
    });
    // 一次取全部票数
    const votes = await this.prisma.vote.groupBy({
      by: ['entityId'],
      where: { workspaceId, entityType: entityType as EntityType, entityId: { in: ids } },
      _count: { _all: true },
    });
    const voteMap = new Map(votes.map((v) => [v.entityId, v._count._all]));
    const map: Record<string, ReturnType<typeof enrichScore>> = {};
    for (const r of rows) map[r.entityId] = enrichScore(r, voteMap.get(r.entityId));
    return map;
  }

  private async findEntity(workspaceId: string, entityType: string, entityId: string) {
    const base = { id: entityId, workspaceId, deletedAt: null };
    switch (entityType) {
      case 'IDEA':
        return this.prisma.idea.findFirst({ where: base });
      case 'SUPPORT':
        return this.prisma.support.findFirst({ where: base });
      case 'FEATURE':
        return this.prisma.feature.findFirst({ where: base });
      default:
        return null;
    }
  }
}
