import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTestPlanDto } from './dto/create-test-plan.dto';
import { AddPlanCasesDto } from './dto/add-plan-cases.dto';

/**
 * TestPlan 命名计划实体（Phase 4）：
 * 一组测试用例的命名批次（回归计划/发布验收/专项计划）。
 * 执行仍走 TestRun（testCaseId+releaseId 覆盖更新），TestPlan 负责编排与进度汇总。
 */
@Injectable()
export class TestPlansService {
  private readonly logger = new Logger(TestPlansService.name);

  constructor(private prisma: PrismaService) {}

  async list(workspaceId: string, releaseId?: string) {
    return this.prisma.testPlan.findMany({
      where: { workspaceId, deletedAt: null, ...(releaseId ? { releaseId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { cases: true } }, release: { select: { name: true, version: true } } },
    });
  }

  async get(workspaceId: string, id: string) {
    const plan = await this.prisma.testPlan.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        release: { select: { id: true, name: true, version: true } },
        cases: {
          include: {
            testCase: { select: { id: true, code: true, title: true, type: true, priority: true, status: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!plan) throw new NotFoundException('Test plan not found');

    // 进度汇总：每个用例的最新 TestRun（优先取计划关联 release 的执行）
    const runs = await this.prisma.testRun.findMany({
      where: {
        workspaceId,
        testCaseId: { in: plan.cases.map((c) => c.testCaseId) },
        ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
      },
      orderBy: { executedAt: 'desc' },
    });
    const latestByCase = new Map<string, string>();
    for (const r of runs) {
      if (!latestByCase.has(r.testCaseId)) latestByCase.set(r.testCaseId, r.status);
    }
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, UNTESTED: 0 };
    for (const c of plan.cases) {
      const st = latestByCase.get(c.testCaseId) ?? 'UNTESTED';
      counts[st as keyof typeof counts] = (counts[st as keyof typeof counts] ?? 0) + 1;
    }
    const total = plan.cases.length;
    const passRate = total > 0 ? Math.round((counts.PASS / (counts.PASS + counts.FAIL || 1)) * 100) : 0;

    return { ...plan, progress: { total, ...counts, passRate } };
  }

  async create(workspaceId: string, dto: CreateTestPlanDto, userId: string) {
    if (dto.releaseId) {
      const release = await this.prisma.release.findFirst({ where: { id: dto.releaseId, workspaceId } });
      if (!release) throw new BadRequestException('Release not found in workspace');
    }
    return this.prisma.testPlan.create({
      data: {
        workspaceId,
        releaseId: dto.releaseId ?? null,
        name: dto.name.trim(),
        description: dto.description ?? null,
        status: 'DRAFT',
        createdById: userId,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: Partial<CreateTestPlanDto>) {
    await this.get(workspaceId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.releaseId !== undefined) {
      if (dto.releaseId) {
        const release = await this.prisma.release.findFirst({ where: { id: dto.releaseId, workspaceId } });
        if (!release) throw new BadRequestException('Release not found in workspace');
      }
      data.releaseId = dto.releaseId ?? null;
    }
    return this.prisma.testPlan.update({ where: { id }, data });
  }

  async updateStatus(workspaceId: string, id: string, status: string) {
    await this.get(workspaceId, id);
    return this.prisma.testPlan.update({ where: { id }, data: { status } });
  }

  async remove(workspaceId: string, id: string) {
    await this.get(workspaceId, id);
    // 软删除（级联用例关联表会留痕；用软删保审计）
    return this.prisma.testPlan.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** 添加用例：testCaseIds 列表 或 releaseId 批量拉入 */
  async addCases(workspaceId: string, id: string, dto: AddPlanCasesDto) {
    const plan = await this.get(workspaceId, id);

    let testCaseIds: string[] = [];
    if (dto.testCaseIds?.length) {
      testCaseIds = dto.testCaseIds;
    } else if (dto.releaseId) {
      if (dto.releaseId !== plan.releaseId && plan.releaseId) {
        throw new BadRequestException(`计划已关联发布周期 ${plan.releaseId}，批量拉入目标不一致`);
      }
      const cases = await this.prisma.testCase.findMany({
        where: { workspaceId, releaseId: dto.releaseId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      testCaseIds = cases.map((c) => c.id);
    }
    if (testCaseIds.length === 0) {
      throw new BadRequestException('No test cases to add (testCaseIds 或 releaseId 至少提供其一且匹配到用例)');
    }

    // 校验用例存在且属于工作区
    const valid = await this.prisma.testCase.findMany({
      where: { id: { in: testCaseIds }, workspaceId, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));

    // 已有计划成员去重
    const existing = await this.prisma.testPlanCase.findMany({
      where: { testPlanId: id, testCaseId: { in: testCaseIds } },
      select: { testCaseId: true },
    });
    const existingSet = new Set(existing.map((e) => e.testCaseId));

    const toInsert = testCaseIds.filter((tid) => validIds.has(tid) && !existingSet.has(tid));
    if (toInsert.length > 0) {
      await this.prisma.testPlanCase.createMany({
        data: toInsert.map((tid, i) => ({ testPlanId: id, testCaseId: tid, sortOrder: i })),
        skipDuplicates: true,
      });
    }

    return { added: toInsert.length, skipped: testCaseIds.length - toInsert.length, total: (await this.get(workspaceId, id)).cases.length };
  }

  async removeCase(workspaceId: string, id: string, testCaseId: string) {
    await this.get(workspaceId, id);
    const res = await this.prisma.testPlanCase.deleteMany({ where: { testPlanId: id, testCaseId } });
    if (res.count === 0) throw new NotFoundException('Test case not in plan');
    return { removed: res.count };
  }

  // ── P1-B：手动走查（walkthrough）──────────────────

  /** 从 Plan 派生一次走查批次：重置该 release 下各用例为 UNTESTED，并标记 planId 归属 */
  async startRun(workspaceId: string, id: string, releaseId: string, userId: string) {
    const plan = await this.get(workspaceId, id);
    const release = await this.prisma.release.findFirst({ where: { id: releaseId, workspaceId } });
    if (!release) throw new BadRequestException('Release not found in workspace');

    const caseIds = plan.cases.map((c) => c.testCaseId);
    if (caseIds.length === 0) throw new BadRequestException('Test plan has no cases');

    const now = new Date();
    let created = 0;
    for (const tcId of caseIds) {
      const existing = await this.prisma.testRun.findFirst({ where: { workspaceId, testCaseId: tcId, releaseId } });
      if (existing) {
        await this.prisma.testRun.update({
          where: { id: existing.id },
          data: { status: 'UNTESTED', planId: id, actualResult: null, executedById: userId, executedAt: now },
        });
      } else {
        await this.prisma.testRun.create({
          data: { workspaceId, testCaseId: tcId, planId: id, releaseId, status: 'UNTESTED', executedById: userId, executedAt: now },
        });
        created++;
      }
    }
    return { planId: id, releaseId, total: caseIds.length, created, reset: caseIds.length - created };
  }

  /** 走查页数据：用例全量（含 steps/预期）+ 当前 release 的 run 状态 */
  async walkthrough(workspaceId: string, id: string) {
    const plan = await this.prisma.testPlan.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        release: { select: { id: true, name: true, version: true } },
        cases: {
          include: {
            testCase: {
              select: {
                id: true, code: true, title: true, type: true, priority: true,
                description: true, expectedResult: true, steps: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!plan) throw new NotFoundException('Test plan not found');

    const runs = plan.releaseId
      ? await this.prisma.testRun.findMany({
          where: { workspaceId, testCaseId: { in: plan.cases.map((c) => c.testCaseId) }, releaseId: plan.releaseId },
        })
      : [];
    const runByCase = new Map(runs.map((r) => [r.testCaseId, r]));

    const items = plan.cases.map((c, i) => ({
      index: i + 1,
      testCaseId: c.testCaseId,
      code: c.testCase.code,
      title: c.testCase.title,
      type: c.testCase.type,
      priority: c.testCase.priority,
      description: c.testCase.description,
      expectedResult: c.testCase.expectedResult,
      steps: c.testCase.steps,
      runId: runByCase.get(c.testCaseId)?.id ?? null,
      status: runByCase.get(c.testCaseId)?.status ?? 'UNTESTED',
      actualResult: runByCase.get(c.testCaseId)?.actualResult ?? null,
      supportId: runByCase.get(c.testCaseId)?.supportId ?? null,
    }));

    return {
      plan: { id: plan.id, name: plan.name, description: plan.description, status: plan.status, release: plan.release },
      total: items.length,
      items,
    };
  }
}
