-- 2026-08-21: 补齐轻量测试闭环 4 表（test_cases / test_runs / test_plans / test_plan_cases）
-- 背景：P1-B 测试闭环表此前由 db push 直建、无迁移记录 → 空库 migrate deploy 时
--       20260815143000_add_entity_counters 的种子 INSERT LEFT JOIN "test_cases" 会报
--       relation "test_cases" does not exist，迁移链从零重放必失败。
-- 处理：本迁移时间戳(20260815000000) < add_entity_counters(20260815143000)，
--       保证重放顺序先建表；全部 IF NOT EXISTS / ADD CONSTRAINT 幂等，
--       对已手动建过这些表的存量库重复执行安全。
-- 结构以 prisma/schema.prisma 的 TestCase / TestRun / TestPlan / TestPlanCase 模型为准。

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_cases" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FEATURE',
    "steps" JSONB,
    "expectedResult" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storyId" UUID,
    "releaseId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_plans" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "releaseId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_runs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "testCaseId" UUID NOT NULL,
    "planId" UUID,
    "releaseId" UUID,
    "status" TEXT NOT NULL DEFAULT 'UNTESTED',
    "actualResult" TEXT,
    "supportId" UUID,
    "executedById" UUID,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_plan_cases" (
    "id" UUID NOT NULL,
    "testPlanId" UUID NOT NULL,
    "testCaseId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_plan_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "test_cases_code_key" ON "test_cases"("code");
CREATE INDEX IF NOT EXISTS "test_cases_workspaceId_storyId_idx" ON "test_cases"("workspaceId", "storyId");
CREATE INDEX IF NOT EXISTS "test_cases_workspaceId_releaseId_idx" ON "test_cases"("workspaceId", "releaseId");
CREATE INDEX IF NOT EXISTS "test_plans_workspaceId_releaseId_idx" ON "test_plans"("workspaceId", "releaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "test_runs_testCaseId_releaseId_key" ON "test_runs"("testCaseId", "releaseId");
CREATE INDEX IF NOT EXISTS "test_runs_workspaceId_status_idx" ON "test_runs"("workspaceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "test_plan_cases_testPlanId_testCaseId_key" ON "test_plan_cases"("testPlanId", "testCaseId");
CREATE INDEX IF NOT EXISTS "test_plan_cases_testCaseId_idx" ON "test_plan_cases"("testCaseId");

-- AddForeignKey: test_cases
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: test_plans
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: test_runs
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "test_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "supports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: test_plan_cases
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "test_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
