-- 2026-08-15: P1-B TestRun 批次维度（从 TestPlan 派生的走查批次）
ALTER TABLE "test_runs" ADD COLUMN IF NOT EXISTS "planId" UUID;
CREATE INDEX IF NOT EXISTS "test_runs_planId_idx" ON "test_runs"("planId");
ALTER TABLE "test_runs" DROP CONSTRAINT IF EXISTS "test_runs_planId_fkey";
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "test_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
