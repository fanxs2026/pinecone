--
-- Pinecone：uuid 列类型对齐 + 缺失外键补齐
--
-- 背景（2026-11-26 审计）：
--   这 4 张表当年是 `prisma db push` 直建的，id / 外键列落成了 text，
--   与 prisma/schema.prisma 的 @db.Uuid 不符。后果：
--     ① 15 个外键里 9 个因「uuid ↔ text 类型不匹配」根本建不出来；
--     ② 删除工作区/用户时无法级联，会留下孤儿数据；
--     ③ Prisma 读写本身能靠隐式转换工作，所以长期没人发现。
-- alex 2026-11-02 修过一次「源头迁移」的 TEXT→UUID，但存量库从未执行，
--   dump 出来的快照把 text 又带了回来。
--
-- 本补丁做什么：
--   1) 把 14 个列 ALTER 成 uuid（改前逐个校验值全是合法 uuid，否则跳过该表并 NOTICE）
--   2) 补齐 15 个缺失外键（含 6 个「类型本来就对、只是没建」的）
--
-- 全部幂等，可重复执行。改类型会重写表，但这几张表只有个位数到几十行。
--

--
-- ① 列类型：text → uuid
--

DO $$
BEGIN
    IF to_regclass('public.kb_page_links') IS NULL THEN
        RAISE NOTICE 'skip kb_page_links: 表不存在';
    ELSIF EXISTS (
        SELECT 1 FROM public.kb_page_links
         WHERE ("id"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "workspaceId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "pageId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "entityId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "createdById"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    ) THEN
        RAISE NOTICE 'skip kb_page_links: 存在非 uuid 值，请先人工清理';
    ELSE
        ALTER TABLE public.kb_page_links
            ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
            ALTER COLUMN "workspaceId" TYPE uuid USING "workspaceId"::uuid,
            ALTER COLUMN "pageId" TYPE uuid USING "pageId"::uuid,
            ALTER COLUMN "entityId" TYPE uuid USING "entityId"::uuid,
            ALTER COLUMN "createdById" TYPE uuid USING "createdById"::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.kb_page_versions') IS NULL THEN
        RAISE NOTICE 'skip kb_page_versions: 表不存在';
    ELSIF EXISTS (
        SELECT 1 FROM public.kb_page_versions
         WHERE ("id"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "pageId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "editorId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    ) THEN
        RAISE NOTICE 'skip kb_page_versions: 存在非 uuid 值';
    ELSE
        ALTER TABLE public.kb_page_versions
            ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
            ALTER COLUMN "pageId" TYPE uuid USING "pageId"::uuid,
            ALTER COLUMN "editorId" TYPE uuid USING "editorId"::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.dashboards') IS NULL THEN
        RAISE NOTICE 'skip dashboards: 表不存在';
    ELSIF EXISTS (
        SELECT 1 FROM public.dashboards
         WHERE ("id"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "workspaceId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "createdById"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    ) THEN
        RAISE NOTICE 'skip dashboards: 存在非 uuid 值';
    ELSE
        ALTER TABLE public.dashboards
            ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
            ALTER COLUMN "workspaceId" TYPE uuid USING "workspaceId"::uuid,
            ALTER COLUMN "createdById" TYPE uuid USING "createdById"::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.report_subscriptions') IS NULL THEN
        RAISE NOTICE 'skip report_subscriptions: 表不存在';
    ELSIF EXISTS (
        SELECT 1 FROM public.report_subscriptions
         WHERE ("id"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "workspaceId"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             OR "createdById"::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    ) THEN
        RAISE NOTICE 'skip report_subscriptions: 存在非 uuid 值';
    ELSE
        ALTER TABLE public.report_subscriptions
            ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
            ALTER COLUMN "workspaceId" TYPE uuid USING "workspaceId"::uuid,
            ALTER COLUMN "createdById" TYPE uuid USING "createdById"::uuid;
    END IF;
END $$;

--
-- ② 缺失外键（Prisma 语义：workspace 侧级联删除，creator 侧 RESTRICT）
--

DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT * FROM (VALUES
            ('votes',                'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('themes',               'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('entity_themes',        'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('entity_themes',        'themeId',     'themes',     'id', 'CASCADE'),
            ('scores',               'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('entity_counters',      'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('kb_page_links',        'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('kb_page_links',        'pageId',      'kb_pages',   'id', 'CASCADE'),
            ('kb_page_links',        'createdById', 'users',      'id', 'RESTRICT'),
            ('kb_page_versions',     'pageId',      'kb_pages',   'id', 'CASCADE'),
            ('kb_page_versions',     'editorId',    'users',      'id', 'RESTRICT'),
            ('dashboards',           'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('dashboards',           'createdById', 'users',      'id', 'RESTRICT'),
            ('report_subscriptions', 'workspaceId', 'workspaces', 'id', 'CASCADE'),
            ('report_subscriptions', 'createdById', 'users',      'id', 'RESTRICT')
        ) AS t(tbl, col, ref_tbl, ref_col, del)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.tbl || '_' || fk.col || '_fkey') THEN
            BEGIN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON UPDATE CASCADE ON DELETE %s',
                    fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.ref_tbl, fk.ref_col, fk.del
                );
            EXCEPTION WHEN others THEN
                RAISE NOTICE 'skip fk %.%: %', fk.tbl, fk.col, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

--
-- ③④ settings 表对齐：updated_at 精度 + value 非空
-- settings 是 20260821 才引入的表，极旧的库可能没有，先做存在性判断，
-- 否则一条 ALTER 失败会把整个补丁事务回滚掉（其它修复也白做）。
--
DO $$
BEGIN
    IF to_regclass('public.settings') IS NULL THEN
        RAISE NOTICE 'skip settings: 表不存在';
    ELSE
        ALTER TABLE public.settings
            ALTER COLUMN updated_at TYPE timestamp(3) without time zone;

        IF EXISTS (SELECT 1 FROM public.settings WHERE value IS NULL) THEN
            RAISE NOTICE 'skip settings.value SET NOT NULL: 存在 NULL 值，请先人工补齐';
        ELSE
            ALTER TABLE public.settings ALTER COLUMN value SET NOT NULL;
        END IF;
    END IF;
END $$;
