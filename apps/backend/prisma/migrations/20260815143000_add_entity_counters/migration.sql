-- P2: 实体码原子计数器（消除 scan+increment 竞态，O(1) 分配）
-- 建表 + 从现有实体表灌入当前 max seq 作为种子。

CREATE TABLE IF NOT EXISTS "entity_counters" (
  "workspaceId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "seq" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "entity_counters_pkey" PRIMARY KEY ("workspaceId", "entityType")
);

-- 种子：IDEA（前缀 I）
INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
SELECT w."id", 'IDEA', COALESCE(MAX((SUBSTRING(i."code" FROM '^[A-Za-z0-9_-]+-I-([0-9]+)$'))::int), 0)
FROM "workspaces" w
LEFT JOIN "ideas" i ON i."workspaceId" = w."id" AND i."code" IS NOT NULL
GROUP BY w."id";

-- 种子：FEATURE（前缀 F）
INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
SELECT w."id", 'FEATURE', COALESCE(MAX((SUBSTRING(f."code" FROM '^[A-Za-z0-9_-]+-F-([0-9]+)$'))::int), 0)
FROM "workspaces" w
LEFT JOIN "features" f ON f."workspaceId" = w."id" AND f."code" IS NOT NULL
GROUP BY w."id";

-- 种子：SUPPORT（前缀 S）
INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
SELECT w."id", 'SUPPORT', COALESCE(MAX((SUBSTRING(s."code" FROM '^[A-Za-z0-9_-]+-S-([0-9]+)$'))::int), 0)
FROM "workspaces" w
LEFT JOIN "supports" s ON s."workspaceId" = w."id" AND s."code" IS NOT NULL
GROUP BY w."id";

-- 种子：STORY（前缀 T）
INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
SELECT w."id", 'STORY', COALESCE(MAX((SUBSTRING(st."code" FROM '^[A-Za-z0-9_-]+-T-([0-9]+)$'))::int), 0)
FROM "workspaces" w
LEFT JOIN "stories" st ON st."workspaceId" = w."id" AND st."code" IS NOT NULL
GROUP BY w."id";

-- 种子：TEST_CASE（前缀 TC）
INSERT INTO "entity_counters" ("workspaceId", "entityType", "seq")
SELECT w."id", 'TEST_CASE', COALESCE(MAX((SUBSTRING(tc."code" FROM '^[A-Za-z0-9_-]+-TC-([0-9]+)$'))::int), 0)
FROM "workspaces" w
LEFT JOIN "test_cases" tc ON tc."workspaceId" = w."id" AND tc."code" IS NOT NULL
GROUP BY w."id";
