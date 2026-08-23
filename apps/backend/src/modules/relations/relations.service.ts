import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { EntityType, RelationType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { withCodeRetry } from '../../common/code-generator';

@Injectable()
export class RelationsService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
  ) {}

  async promote(
    workspaceId: string,
    ideaId: string,
    userId: string,
    options?: { releaseId?: string; priority?: string },
  ) {
    const idea = await this.prisma.idea.findFirst({
      where: { id: ideaId, workspaceId },
    });
    if (!idea) throw new NotFoundException('Idea not found');

    const maxSort = await this.prisma.feature.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });

    const feature = await withCodeRetry(this.prisma, workspaceId, 'FEATURE', (featureCode) =>
      this.prisma.feature.create({
        data: {
          workspaceId,
          code: featureCode,
          title: idea.title,
          description: idea.description,
          priority: options?.priority || 'P2',
          releaseId: options?.releaseId || null,
          assigneeId: idea.assigneeId,
          assigneeName: idea.assigneeName,
          createdById: userId,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          release: { select: { id: true, name: true } },
        },
      }),
    );

    await this.prisma.entityRelation.create({
      data: {
        workspaceId,
        sourceEntityType: 'IDEA',
        sourceEntityId: ideaId,
        targetEntityType: 'FEATURE',
        targetEntityId: feature.id,
        relationType: 'PROMOTED_FROM',
      },
    });

    await this.activitiesService.log(
      EntityType.IDEA,
      ideaId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { action: 'PROMOTED_TO_FEATURE', featureId: feature.id } as unknown as Prisma.InputJsonValue,
    );

    await this.activitiesService.log(
      EntityType.FEATURE,
      feature.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { action: 'PROMOTED_FROM_IDEA', ideaId } as unknown as Prisma.InputJsonValue,
    );

    return feature;
  }

  async cloneFeature(workspaceId: string, featureId: string, userId: string) {
    const feature = await this.prisma.feature.findFirst({
      where: { id: featureId, workspaceId },
    });
    if (!feature) throw new NotFoundException('Feature not found');

    const maxSort = await this.prisma.story.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });

    const story = await withCodeRetry(this.prisma, workspaceId, 'STORY', (code) =>
      this.prisma.story.create({
        data: {
          workspaceId,
          code,
          featureId: feature.id,
          title: feature.title,
          description: feature.description,
          priority: 'P2',
          status: 'TODO',
          createdById: userId,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          feature: { select: { id: true, title: true } },
        },
      }),
    );

    await this.prisma.entityRelation.create({
      data: {
        workspaceId,
        sourceEntityType: 'FEATURE',
        sourceEntityId: featureId,
        targetEntityType: 'STORY',
        targetEntityId: story.id,
        relationType: 'CLONED_FROM',
      },
    });

    await this.activitiesService.log(
      EntityType.FEATURE,
      featureId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { action: 'CLONED_TO_STORY', storyId: story.id } as unknown as Prisma.InputJsonValue,
    );

    await this.activitiesService.log(
      EntityType.STORY,
      story.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { action: 'CLONED_FROM_FEATURE', featureId } as unknown as Prisma.InputJsonValue,
    );

    return story;
  }

  async cloneSupportTo(workspaceId: string, supportId: string, userId: string, targetType: 'IDEA' | 'FEATURE' | 'STORY', options?: { featureId?: string }) {
    const support = await this.prisma.support.findFirst({
      where: { id: supportId, workspaceId },
    });
    if (!support) throw new NotFoundException('Support not found');

    let created;
    if (targetType === 'IDEA') {
      created = await withCodeRetry(this.prisma, workspaceId, 'IDEA', (code) =>
        this.prisma.idea.create({
          data: {
            workspaceId,
            code,
            title: support.title,
            description: support.description,
            assigneeId: support.assigneeId,
            assigneeName: support.assigneeName,
            createdById: userId,
          },
          include: { createdBy: { select: { id: true, email: true, name: true } } },
        }),
      );
    } else if (targetType === 'FEATURE') {
      const maxSort = await this.prisma.feature.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
      created = await withCodeRetry(this.prisma, workspaceId, 'FEATURE', (code) =>
        this.prisma.feature.create({
          data: {
            workspaceId,
            code,
            title: support.title,
            description: support.description,
            assigneeId: support.assigneeId,
            assigneeName: support.assigneeName,
            createdById: userId,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          },
          include: { assignee: { select: { id: true, email: true, name: true } } },
        }),
      );
    } else {
      if (!options?.featureId) {
        throw new BadRequestException('featureId is required to clone support to story');
      }
      const featureId = options.featureId;
      const feature = await this.prisma.feature.findFirst({ where: { id: featureId, workspaceId } });
      if (!feature) throw new NotFoundException('Feature not found');
      const maxSort = await this.prisma.story.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
      created = await withCodeRetry(this.prisma, workspaceId, 'STORY', (code) =>
        this.prisma.story.create({
          data: {
            workspaceId,
            code,
            featureId,
            title: support.title,
            description: support.description,
            priority: 'P2',
            status: 'TODO',
            kind: support.type === 'DEFECT' ? 'DEFECT' : 'FEATURE', // 缺陷来源 → 缺陷任务
            createdById: userId,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          },
          include: { assignee: { select: { id: true, email: true, name: true } }, feature: { select: { id: true, title: true } } },
        }),
      );
    }

    await this.prisma.entityRelation.create({
      data: {
        workspaceId,
        sourceEntityType: 'SUPPORT',
        sourceEntityId: supportId,
        targetEntityType: targetType,
        targetEntityId: created.id,
        relationType: 'PROMOTED_FROM', // 原 CLONED_FROM → 提升语义统一（与 promote() Idea→Feature 一致）
      },
    });

    await this.activitiesService.log(
      EntityType.SUPPORT, supportId, ActionType.UPDATED, userId, workspaceId,
      { action: `CLONED_TO_${targetType}`, targetId: created.id } as unknown as Prisma.InputJsonValue,
    );

    return created;
  }

  async findByEntity(workspaceId: string, entityType: string, entityId: string) {
    const relations = await this.prisma.entityRelation.findMany({
      where: {
        workspaceId,
        OR: [
          { sourceEntityType: entityType as any, sourceEntityId: entityId },
          { targetEntityType: entityType as any, targetEntityId: entityId },
        ],
      },
    });

    // Collect related entity IDs grouped by type to enable batch fetching
    const ideaIds: string[] = [];
    const featureIds: string[] = [];
    const storyIds: string[] = [];
    const supportIds: string[] = [];

    for (const rel of relations) {
      const isSource = rel.sourceEntityId === entityId;
      const relatedEntityType = isSource ? rel.targetEntityType : rel.sourceEntityType;
      const relatedEntityId = isSource ? rel.targetEntityId : rel.sourceEntityId;

      if (relatedEntityType === 'IDEA') ideaIds.push(relatedEntityId);
      else if (relatedEntityType === 'FEATURE') featureIds.push(relatedEntityId);
      else if (relatedEntityType === 'STORY') storyIds.push(relatedEntityId);
      else if (relatedEntityType === 'SUPPORT') supportIds.push(relatedEntityId);
    }

    // Batch query all entity types in parallel — 4 queries total regardless of relation count
    const [ideas, features, stories, supports] = await Promise.all([
      ideaIds.length ? this.prisma.idea.findMany({ where: { id: { in: ideaIds } }, select: { id: true, title: true, code: true } }) : [],
      featureIds.length ? this.prisma.feature.findMany({ where: { id: { in: featureIds } }, select: { id: true, title: true, code: true } }) : [],
      storyIds.length ? this.prisma.story.findMany({ where: { id: { in: storyIds } }, select: { id: true, title: true, code: true } }) : [],
      supportIds.length ? this.prisma.support.findMany({ where: { id: { in: supportIds } }, select: { id: true, title: true, code: true } }) : [],
    ]);

    // Build ID→(title, code) maps for O(1) lookups
    const ideaMap = new Map(ideas.map(i => [i.id, i]));
    const featureMap = new Map(features.map(f => [f.id, f]));
    const storyMap = new Map(stories.map(s => [s.id, s]));
    const supportMap = new Map(supports.map(s => [s.id, s]));

    const result = relations.map((rel) => {
      const isSource = rel.sourceEntityId === entityId;
      const relatedEntityType = isSource ? rel.targetEntityType : rel.sourceEntityType;
      const relatedEntityId = isSource ? rel.targetEntityId : rel.sourceEntityId;

      // Map lookups — zero additional queries
      let relatedTitle = '';
      let relatedCode: string | null = null;
      if (relatedEntityType === 'IDEA') { relatedTitle = ideaMap.get(relatedEntityId)?.title ?? ''; relatedCode = ideaMap.get(relatedEntityId)?.code ?? null; }
      else if (relatedEntityType === 'FEATURE') { relatedTitle = featureMap.get(relatedEntityId)?.title ?? ''; relatedCode = featureMap.get(relatedEntityId)?.code ?? null; }
      else if (relatedEntityType === 'STORY') { relatedTitle = storyMap.get(relatedEntityId)?.title ?? ''; relatedCode = storyMap.get(relatedEntityId)?.code ?? null; }
      else if (relatedEntityType === 'SUPPORT') { relatedTitle = supportMap.get(relatedEntityId)?.title ?? ''; relatedCode = supportMap.get(relatedEntityId)?.code ?? null; }

      return {
        id: rel.id,
        relationType: rel.relationType,
        relatedEntityType,
        relatedEntityId,
        relatedTitle,
        relatedCode,
        direction: isSource ? 'target' : 'source',
      };
    });

    return result;
  }
}
