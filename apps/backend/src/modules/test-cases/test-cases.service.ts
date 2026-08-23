import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateTestCaseDto } from './dto/create-test-case.dto';
import { UpdateTestCaseDto } from './dto/update-test-case.dto';
import { MarkTestRunDto } from './dto/mark-test-run.dto';
import { EntityType, ActionType, RelationType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { withCodeRetry } from '../../common/code-generator';
import { EventsService } from '../events/events.service';

@Injectable()
export class TestCasesService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private eventsService: EventsService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { releaseId?: string; storyId?: string; status?: string; search?: string },
    skip: number = 0,
    take: number = 50,
  ) {
    const where: any = { workspaceId, deletedAt: null };
    if (query.releaseId) where.releaseId = query.releaseId;
    if (query.storyId) where.storyId = query.storyId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.testCase.findMany({
        where,
        skip,
        take,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
          story: { select: { id: true, title: true, code: true } },
          release: { select: { id: true, name: true, version: true } },
          // 列表带上执行记录（按 release 过滤），前端直接渲染每行状态与回链
          testRuns: query.releaseId
            ? { where: { releaseId: query.releaseId }, orderBy: { updatedAt: 'desc' } }
            : { orderBy: { updatedAt: 'desc' }, take: 5 },
          _count: { select: { testRuns: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.testCase.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const testCase = await this.prisma.testCase.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        story: { select: { id: true, title: true, code: true } },
        release: { select: { id: true, name: true, version: true } },
        testRuns: {
          include: {
            release: { select: { id: true, name: true, version: true } },
            support: { select: { id: true, code: true, title: true, status: true } },
            executedBy: { select: { id: true, email: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!testCase) throw new NotFoundException('Test case not found');
    return testCase;
  }

  async create(workspaceId: string, dto: CreateTestCaseDto, userId: string) {
    // releaseId / storyId 必须属于同一工作区
    if (dto.releaseId) {
      const release = await this.prisma.release.findFirst({
        where: { id: dto.releaseId, workspaceId },
        select: { id: true },
      });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }
    if (dto.storyId) {
      const story = await this.prisma.story.findFirst({
        where: { id: dto.storyId, workspaceId },
        select: { id: true },
      });
      if (!story) throw new BadRequestException('Story not found in this workspace');
    }

    const result = await withCodeRetry(this.prisma, workspaceId, 'TEST_CASE', (code) =>
      this.prisma.testCase.create({
        data: {
          workspaceId,
          code,
          title: dto.title,
          description: dto.description,
          type: dto.type || 'FEATURE',
          steps: (dto.steps as Prisma.InputJsonValue) ?? undefined,
          expectedResult: dto.expectedResult,
          priority: dto.priority || 'P2',
          storyId: dto.storyId || null,
          releaseId: dto.releaseId || null,
          createdById: userId,
        },
      }),
    );

    await this.activitiesService.log(
      EntityType.TEST_CASE,
      result.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { title: result.title } as unknown as Prisma.InputJsonValue,
    );
    await this.eventsService.publish({
      workspaceId,
      entityType: 'TEST_CASE',
      entityId: result.id,
      action: 'CREATED',
      payload: { id: result.id, code: result.code, title: result.title, storyId: result.storyId, releaseId: result.releaseId },
    });
    return result;
  }

  async update(workspaceId: string, id: string, dto: UpdateTestCaseDto, userId: string) {
    const existing = await this.findOne(workspaceId, id);
    const result = await this.prisma.testCase.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.steps !== undefined ? { steps: dto.steps as Prisma.InputJsonValue } : {}),
        ...(dto.expectedResult !== undefined ? { expectedResult: dto.expectedResult } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.storyId !== undefined ? { storyId: dto.storyId } : {}),
        ...(dto.releaseId !== undefined ? { releaseId: dto.releaseId } : {}),
      },
    });

    await this.activitiesService.log(
      EntityType.TEST_CASE,
      id,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { changes: { title: [existing.title, result.title] } } as unknown as Prisma.InputJsonValue,
    );
    await this.eventsService.publish({
      workspaceId,
      entityType: 'TEST_CASE',
      entityId: id,
      action: 'UPDATED',
      payload: { id, code: result.code, title: result.title },
    });
    return result;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.testCase.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activitiesService.log(
      EntityType.TEST_CASE,
      id,
      ActionType.DELETED,
      userId,
      workspaceId,
      { deleted: true } as unknown as Prisma.InputJsonValue,
    );
  }

  /**
   * 标记执行结果（PASS/FAIL/BLOCKED）——同一用例在同一 Release 只留一条 TestRun，重跑即覆盖。
   * releaseId 可选：传了则按 (testCaseId, releaseId) upsert；不传则用 testCase.releaseId 兜底。
   * 每次状态变化写 Activity（审计高价值数据点，Phase 2 审计直接可复用）。
   */
  async markRun(workspaceId: string, testCaseId: string, dto: MarkTestRunDto, userId: string) {
    const testCase = await this.findOne(workspaceId, testCaseId);

    let releaseId = dto.releaseId ?? testCase.releaseId ?? null;
    if (releaseId) {
      const release = await this.prisma.release.findFirst({
        where: { id: releaseId, workspaceId },
        select: { id: true },
      });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }

    const data: Prisma.TestRunCreateInput = {
      workspace: { connect: { id: workspaceId } },
      testCase: { connect: { id: testCaseId } },
      release: releaseId ? { connect: { id: releaseId } } : undefined,
      status: dto.status,
      actualResult: dto.actualResult,
      executedBy: { connect: { id: userId } },
      executedAt: new Date(),
    };

    // 同 (testCase, release) 只留一条：有则更新，无则创建。
    // ⚠️ releaseId 为 NULL 时 @@unique 不生效（PG 对 NULL 不判重），
    // 此时按 testCaseId + releaseId IS NULL 的最新一条定位，保证"重跑即覆盖"。
    let existing = null;
    if (releaseId) {
      existing = await this.prisma.testRun.findUnique({
        where: { testCaseId_releaseId: { testCaseId, releaseId } },
      });
    } else {
      existing = await this.prisma.testRun.findFirst({
        where: { testCaseId, releaseId: null, workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    }

    let run;
    if (existing) {
      run = await this.prisma.testRun.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          actualResult: dto.actualResult,
          executedBy: { connect: { id: userId } },
          executedAt: new Date(),
        },
      });
    } else {
      run = await this.prisma.testRun.create({ data });
    }

    await this.activitiesService.log(
      EntityType.TEST_CASE,
      testCaseId,
      ActionType.STATUS_CHANGED,
      userId,
      workspaceId,
      { runId: run.id, status: dto.status, releaseId } as unknown as Prisma.InputJsonValue,
    );
    await this.eventsService.publish({
      workspaceId,
      entityType: 'TEST_CASE',
      entityId: testCaseId,
      action: 'STATUS_CHANGED',
      payload: { testCaseId, runId: run.id, status: dto.status, releaseId, supportId: run.supportId ?? null },
    });
    return run;
  }

  /**
   * 失败一键建缺陷：用用例内容生成 Support(type=DEFECT)，写 TestRun.supportId 回链，
   * 并建 EntityRelation(TEST_CASE ← SUPPORT, RELATED) 供关系面板展示"来源用例"。
   */
  async createDefectFromRun(workspaceId: string, testCaseId: string, runId: string, userId: string) {
    const testCase = await this.findOne(workspaceId, testCaseId);
    const run = await this.prisma.testRun.findFirst({ where: { id: runId, workspaceId } });
    if (!run) throw new NotFoundException('Test run not found');

    const stepsText = Array.isArray(testCase.steps)
      ? (testCase.steps as any[])
          .map((s, i) => `${i + 1}. ${s.action ?? ''} → 期望: ${s.expected ?? ''}`)
          .join('\n')
      : '';

    const description = [
      testCase.description ? `前置条件: ${testCase.description}` : '',
      stepsText ? `步骤:\n${stepsText}` : '',
      testCase.expectedResult ? `预期结果: ${testCase.expectedResult}` : '',
      run.actualResult ? `实际结果: ${run.actualResult}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const defect = await withCodeRetry(this.prisma, workspaceId, 'SUPPORT', (code) =>
      this.prisma.support.create({
        data: {
          workspaceId,
          code,
          title: `[用例失败] ${testCase.title}`,
          description: description || undefined,
          status: 'OPEN',
          type: 'DEFECT',
          releaseId: run.releaseId,
          createdById: userId,
          tags: ['test-fail'],
        },
      }),
    );

    // 回链：TestRun.supportId + 关系面板
    await this.prisma.testRun.update({ where: { id: run.id }, data: { supportId: defect.id } });
    await this.prisma.entityRelation.create({
      data: {
        workspaceId,
        sourceEntityType: EntityType.SUPPORT,
        sourceEntityId: defect.id,
        targetEntityType: EntityType.TEST_CASE,
        targetEntityId: testCaseId,
        relationType: RelationType.RELATED,
      },
    });

    await this.activitiesService.log(
      EntityType.SUPPORT,
      defect.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { fromTestCase: testCaseId, runId: run.id } as unknown as Prisma.InputJsonValue,
    );
    await this.eventsService.publish({
      workspaceId,
      entityType: 'SUPPORT',
      entityId: defect.id,
      action: 'CREATED',
      payload: { id: defect.id, code: defect.code, title: defect.title, type: 'DEFECT', fromTestCase: testCaseId },
    });
    return defect;
  }
}
