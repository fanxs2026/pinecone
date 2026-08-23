-- 2026-08-15: Feature 优先级 P0-P3 → P1-P5（默认 P3，老板需求，与 Story 对齐）
-- 存量语义平移：P0(紧急)→P1(Very high), P1(高)→P2(High), P2(中)→P3(Medium), P3(低)→P4(Low)

UPDATE "features" SET "priority" = CASE "priority"
  WHEN 'P0' THEN 'P1'
  WHEN 'P1' THEN 'P2'
  WHEN 'P2' THEN 'P3'
  WHEN 'P3' THEN 'P4'
  ELSE "priority" END
WHERE "priority" IN ('P0','P1','P2','P3');

ALTER TABLE "features" ALTER COLUMN "priority" SET DEFAULT 'P3';
