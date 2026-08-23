-- 清理知识库相关表（迁移 20260728 会完整重建它们）
-- 注意：这会清空 kb_ 开头的 5 张表数据。开发库里这些是新表，通常为空；
-- 若你已在知识库里写了重要内容，请先备份再执行。
DROP TABLE IF EXISTS "kb_page_tags" CASCADE;
DROP TABLE IF EXISTS "kb_comments" CASCADE;
DROP TABLE IF EXISTS "kb_pages" CASCADE;
DROP TABLE IF EXISTS "kb_tags" CASCADE;
DROP TABLE IF EXISTS "kb_spaces" CASCADE;
