import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withCodeRetry } from '../../common/code-generator';
import { ActivitiesService } from '../activities/activities.service';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';

export interface JunitCaseResult {
  name: string;
  classname: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
}

export interface JunitImportReport {
  parsed: number;
  matched: number;
  created: number;
  runs: number;
  summary: { PASS: number; FAIL: number; BLOCKED: number };
  detail: { name: string; status: string; action: 'matched' | 'created'; testCaseCode?: string | null }[];
  errors: { name: string; message: string }[];
}

/**
 * 测试自动化集成（Phase 4）：CI 测试结果（JUnit XML）自动同步到测试闭环。
 * 流程：解析 JUnit → 按用例名匹配/自动创建 TestCase → 建 TestRun（PASS/FAIL/BLOCKED）→ 报告。
 */
@Injectable()
export class TestAutomationService {
  private readonly logger = new Logger(TestAutomationService.name);

  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
  ) {}

  /** 解析 JUnit XML（轻量正则，支持自闭合与带 body 的 testcase + failure/error/skipped） */
  parseJunitXml(xml: string): JunitCaseResult[] {
    const results: JunitCaseResult[] = [];
    // 兼容两种形态：<testcase .../> 自闭合 与 <testcase ...>...</testcase>
    const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let m: RegExpExecArray | null;
    while ((m = caseRe.exec(xml))) {
      const attrs = m[1] ?? '';
      const body = m[2] ?? '';
      const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const classname = /classname="([^"]*)"/.exec(attrs)?.[1] ?? '';
      if (!name) continue;
      const status: JunitCaseResult['status'] = body.includes('<failure') || body.includes('<error')
        ? 'FAIL'
        : body.includes('<skipped')
          ? 'BLOCKED'
          : 'PASS';
      results.push({ name, classname, status });
    }
    if (results.length === 0) {
      throw new BadRequestException('No <testcase> elements found — 请上传有效的 JUnit XML');
    }
    return results;
  }

  async importJunit(
    workspaceId: string,
    xml: string,
    opts: { releaseId?: string; autoCreate?: boolean },
    userId?: string | null,
  ) {
    const results = this.parseJunitXml(xml);

    // releaseId 校验（若提供）
    if (opts.releaseId) {
      const release = await this.prisma.release.findFirst({ where: { id: opts.releaseId, workspaceId } });
      if (!release) throw new BadRequestException('Release not found in workspace');
    }

    const report: JunitImportReport = {
      parsed: results.length,
      matched: 0,
      created: 0,
      runs: 0,
      summary: { PASS: 0, FAIL: 0, BLOCKED: 0 },
      detail: [],
      errors: [],
    };

    // 预取工作区全部用例（title 小写索引），避免 N+1 查询
    const existing = await this.prisma.testCase.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, title: true, code: true },
    });
    const byTitle = new Map<string, { id: string; code: string | null }>();
    for (const tc of existing) byTitle.set(tc.title.trim().toLowerCase(), { id: tc.id, code: tc.code });

    const now = new Date();
    for (const r of results) {
      try {
        let testCaseId: string;
        let code: string | null = null;
        const hit = byTitle.get(r.name.trim().toLowerCase());
        if (hit) {
          testCaseId = hit.id;
          code = hit.code;
          report.matched++;
        } else if (opts.autoCreate) {
          if (!userId) {
            report.errors.push({ name: r.name, message: 'autoCreate 需要执行人（CI 匿名通道请先建用例）' });
            continue;
          }
          const created = await withCodeRetry(this.prisma, workspaceId, 'TEST_CASE', (c) =>
            this.prisma.testCase.create({
              data: {
                workspaceId,
                code: c,
                title: r.name.trim().slice(0, 200),
                description: r.classname ? `来自自动化 CI（${r.classname}）` : undefined,
                type: 'FEATURE',
                priority: 'P2',
                createdById: userId,
              },
            }),
          );
          testCaseId = created.id;
          code = created.code;
          report.created++;
        } else {
          report.errors.push({ name: r.name, message: '未匹配到用例且 autoCreate 未开启' });
          continue;
        }

        await this.prisma.testRun.create({
          data: {
            workspaceId,
            testCaseId,
            releaseId: opts.releaseId ?? null,
            status: r.status,
            actualResult: r.classname ? `CI 自动化：${r.classname}` : 'CI 自动化执行',
            executedById: userId ?? null,
            executedAt: now,
          },
        });
        report.runs++;
        report.summary[r.status]++;
        report.detail.push({ name: r.name, status: r.status, action: hit ? 'matched' : 'created', testCaseCode: code });
      } catch (err: any) {
        report.errors.push({ name: r.name, message: err?.message ?? 'unknown' });
      }
    }

    this.logger.log(`JUnit import: parsed=${report.parsed} runs=${report.runs} created=${report.created} errors=${report.errors.length}`);
    // 审计留痕由 TestRun 记录本身承担（每行执行记录持久化）；不额外写聚合 Activity
    // （Activity.entityId 为 Uuid 类型，聚合级空值会导致 db 报错）

    return report;
  }
}
