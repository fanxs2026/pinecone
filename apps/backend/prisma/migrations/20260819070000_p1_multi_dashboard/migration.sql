-- P1 多仪表盘（2026-08-19）：每工作区可建多个盘，去掉 workspaceId 唯一索引（@unique 生成的是唯一索引而非约束）
DROP INDEX IF EXISTS "dashboards_workspaceId_key";
