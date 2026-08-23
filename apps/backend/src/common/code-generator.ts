import { PrismaService } from '../prisma/prisma.service';

const ENTITY_PREFIXES: Record<string, string> = {
  IDEA: 'I',
  FEATURE: 'F',
  SUPPORT: 'S',
  STORY: 'T',
  TEST_CASE: 'TC',
};

type EntityModel = 'IDEA' | 'FEATURE' | 'SUPPORT' | 'STORY' | 'TEST_CASE';

/**
 * Generate the next sequential code for a given entity type in a workspace.
 * Format: {WORKSPACE_SLUG}-{PREFIX}-{SEQUENCE}
 * Example: CEDA-I-1, CEDA-F-12, CEDA-S-123
 *
 * P2 改造：序号来自 `entity_counters` 表的单条原子 UPSERT（ON CONFLICT DO UPDATE
 * ... RETURNING），消除「全表扫描找 max + 乐观重试」的并发竞态，且 O(1)。
 * `withCodeRetry` 保留作边界兜底（如手动改动数据导致的非常规冲突）。
 *
 * P2#12（2026-08-21 评估）：code 顺序可枚举，仅泄露业务量（实体数量级），
 * 无数据读写利用面。改为不可猜 slug 会违反老板强约束的 {SLUG}-{P}-{SEQ} 格式
 * （含跨系统引用、导出文件命名等既有约定）→ 判定为接受低危，维持现状。
 */
export async function generateEntityCode(
  prisma: PrismaService,
  workspaceId: string,
  entityType: EntityModel,
): Promise<string> {
  const prefix = ENTITY_PREFIXES[entityType];
  if (!prefix) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  // Get workspace slug as project code
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const projectCode = workspace.slug.toUpperCase();

  // 原子自增：单条 UPSERT ... RETURNING（PostgreSQL 行锁保证并发安全，O(1)）
  const rows: { seq: number }[] = await prisma.$queryRaw`
    INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
    VALUES (${workspaceId}::uuid, ${entityType}, 1)
    ON CONFLICT ("workspaceId", "entityType")
    DO UPDATE SET "seq" = "entity_counters"."seq" + 1
    RETURNING "seq"
  `;
  const nextSeq = rows[0]?.seq ?? 1;

  return `${projectCode}-${prefix}-${nextSeq}`;
}

/**
 * Generate a code and run `createFn` with it, retrying on unique-constraint
 * collisions (P2002) caused by concurrent code allocation. The previous
 * implementation promised "optimistic retry" but never implemented it — a
 * concurrent create could fail with a 500. This wrapper closes that gap.
 *
 * P2#9（2026-08-21 复核）：失败/重试会消耗 seq 产生序号空洞（entity_counters
 * 独立表无法随事务回滚）。空洞无害——code 仅需唯一，不要求连续；非 P2002
 * 错误直接抛出（不吞错），P2002 重试上限 5 次。行为已正确，无需改动。
 *
 * Usage: wrap the entity-create call:
 *   return withCodeRetry(this.prisma, workspaceId, 'FEATURE', (code) =>
 *     this.prisma.feature.create({ data: { ..., code } }),
 *   );
 */
export async function withCodeRetry<T>(
  prisma: PrismaService,
  workspaceId: string,
  entityType: EntityModel,
  createFn: (code: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = await generateEntityCode(prisma, workspaceId, entityType);
    try {
      return await createFn(code);
    } catch (err: any) {
      lastError = err;
      // P2002 = unique constraint violation on code — regenerate and retry
      if (err?.code === 'P2002' && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to allocate entity code after retries');
}
