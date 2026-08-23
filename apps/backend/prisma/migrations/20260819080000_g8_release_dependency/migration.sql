-- G8 甘特依赖（2026-08-19）：Release 自引用 dependsOnId（依赖连线）
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "dependsOnId" UUID;
ALTER TABLE "releases" ADD CONSTRAINT "releases_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "releases_dependsOnId_idx" ON "releases"("dependsOnId");
