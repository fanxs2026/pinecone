-- 2026-08-21: 补齐 db push 时代直建的 22 张表（此前无建表迁移）
-- 背景：迁移链从零重放时，20260815144500_webhook_format_slack 等迁移引用这些表报
--       relation does not exist。本迁移时间戳(20260815144400) 插在首次引用之前。
-- 幂等：CREATE TABLE/INDEX 用 IF NOT EXISTS，约束用 DO 块按 conname 防重，
--       对已手动建过这些表的存量库重复执行安全。GRANT 已移除（CI 库无 pinecone_app 角色）。

CREATE TABLE IF NOT EXISTS public.api_tokens (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    "tokenHash" text NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[],
    "lastUsedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    "entityType" text NOT NULL,
    trigger text NOT NULL,
    "triggerValue" text,
    actions jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_outbox (
    id uuid NOT NULL,
    "workspaceId" uuid,
    "entityType" text NOT NULL,
    "entityId" text,
    action text NOT NULL,
    payload jsonb,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "deliveredAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "claimedAt" timestamp(3) without time zone,
    "nextRetryAt" timestamp(3) without time zone
);

CREATE TABLE IF NOT EXISTS public.github_configs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "repoFullName" text NOT NULL,
    "webhookSecret" text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    provider text DEFAULT 'GITHUB'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.github_links (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "configId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    "githubType" text NOT NULL,
    "prNumber" integer,
    "commitSha" text,
    title text,
    state text,
    url text,
    author text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.import_jobs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "fileName" text NOT NULL,
    "columnHeaders" text[],
    "rowCount" integer NOT NULL,
    preview jsonb,
    mapping jsonb,
    status text DEFAULT 'PREVIEW'::text NOT NULL,
    "successCount" integer DEFAULT 0 NOT NULL,
    "failCount" integer DEFAULT 0 NOT NULL,
    errors jsonb,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);

CREATE TABLE IF NOT EXISTS public.instance_heartbeats (
    id uuid NOT NULL,
    "instanceId" text NOT NULL,
    version text,
    edition text DEFAULT 'COMMUNITY'::text NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "checkCount" integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.key_result_items (
    id uuid NOT NULL,
    "keyResultId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.key_results (
    id uuid NOT NULL,
    "objectiveId" uuid NOT NULL,
    title text NOT NULL,
    target text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.licenses (
    id uuid NOT NULL,
    "customerName" text NOT NULL,
    "customerEmail" text NOT NULL,
    "licenseKey" text NOT NULL,
    edition text DEFAULT 'COMMUNITY'::text NOT NULL,
    seats integer DEFAULT 5 NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    notes text,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastSeenAt" timestamp(3) without time zone,
    "lastVersion" text,
    signature text
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "actorId" uuid NOT NULL,
    type text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    "entityTitle" text,
    snippet text,
    read boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.objectives (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    title text NOT NULL,
    period text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scim_configs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    "tokenHash" text,
    "groupRoleMappings" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scim_groups (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "externalId" text,
    "displayName" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "memberIds" text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.share_links (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "viewCount" integer DEFAULT 0 NOT NULL,
    "brandTitle" text,
    "brandColor" text,
    "viewMode" text DEFAULT 'FULL'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sprints (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "releaseId" uuid,
    name text NOT NULL,
    "startDate" date,
    "endDate" date,
    goal text,
    status text DEFAULT 'PLANNED'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sso_providers (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    "providerType" text DEFAULT 'OIDC'::text NOT NULL,
    issuer text NOT NULL,
    "clientId" text NOT NULL,
    "clientSecret" text NOT NULL,
    scopes text DEFAULT 'openid profile email'::text NOT NULL,
    "domainWhitelist" text[] DEFAULT ARRAY[]::text[],
    active boolean DEFAULT true NOT NULL,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "idpMetadataXml" text,
    "spEntityId" text
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid NOT NULL,
    "teamId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.teams (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.telemetry_reports (
    id uuid NOT NULL,
    "instanceId" text NOT NULL,
    edition text NOT NULL,
    version text,
    counts jsonb NOT NULL,
    "reportedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    "secretHash" text NOT NULL,
    events text[] DEFAULT ARRAY[]::text[],
    active boolean DEFAULT true NOT NULL,
    "lastStatus" text,
    "lastDeliveredAt" timestamp(3) without time zone,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    format text DEFAULT 'JSON'::text NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_pkey') THEN
    ALTER TABLE public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_pkey') THEN
    ALTER TABLE public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_pkey') THEN
    ALTER TABLE public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_configs_pkey') THEN
    ALTER TABLE public.github_configs
    ADD CONSTRAINT github_configs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_links_pkey') THEN
    ALTER TABLE public.github_links
    ADD CONSTRAINT github_links_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_pkey') THEN
    ALTER TABLE public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instance_heartbeats_pkey') THEN
    ALTER TABLE public.instance_heartbeats
    ADD CONSTRAINT instance_heartbeats_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'key_result_items_pkey') THEN
    ALTER TABLE public.key_result_items
    ADD CONSTRAINT key_result_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'key_results_pkey') THEN
    ALTER TABLE public.key_results
    ADD CONSTRAINT key_results_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_pkey') THEN
    ALTER TABLE public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_pkey') THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objectives_pkey') THEN
    ALTER TABLE public.objectives
    ADD CONSTRAINT objectives_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_pkey') THEN
    ALTER TABLE public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_tokenHash_key') THEN
    ALTER TABLE public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_tokenHash_key" UNIQUE ("tokenHash");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scim_configs_pkey') THEN
    ALTER TABLE public.scim_configs
    ADD CONSTRAINT scim_configs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scim_groups_pkey') THEN
    ALTER TABLE public.scim_groups
    ADD CONSTRAINT scim_groups_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_pkey') THEN
    ALTER TABLE public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprints_pkey') THEN
    ALTER TABLE public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sso_providers_pkey') THEN
    ALTER TABLE public.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_pkey') THEN
    ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_pkey') THEN
    ALTER TABLE public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'telemetry_reports_pkey') THEN
    ALTER TABLE public.telemetry_reports
    ADD CONSTRAINT telemetry_reports_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_pkey') THEN
    ALTER TABLE public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "api_tokens_workspaceId_revokedAt_idx" ON public.api_tokens USING btree ("workspaceId", "revokedAt");

CREATE INDEX IF NOT EXISTS "automation_rules_workspaceId_enabled_idx" ON public.automation_rules USING btree ("workspaceId", enabled);

CREATE INDEX IF NOT EXISTS "event_outbox_status_createdAt_idx" ON public.event_outbox USING btree (status, "createdAt");

CREATE INDEX IF NOT EXISTS "event_outbox_workspaceId_createdAt_idx" ON public.event_outbox USING btree ("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "github_configs_workspaceId_provider_idx" ON public.github_configs USING btree ("workspaceId", provider);

CREATE UNIQUE INDEX IF NOT EXISTS "github_configs_workspaceId_repoFullName_key" ON public.github_configs USING btree ("workspaceId", "repoFullName");

CREATE INDEX IF NOT EXISTS "github_links_workspaceId_entityType_entityId_idx" ON public.github_links USING btree ("workspaceId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "import_jobs_workspaceId_createdAt_idx" ON public.import_jobs USING btree ("workspaceId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "instance_heartbeats_instanceId_key" ON public.instance_heartbeats USING btree ("instanceId");

CREATE INDEX IF NOT EXISTS "instance_heartbeats_lastSeenAt_idx" ON public.instance_heartbeats USING btree ("lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "key_result_items_keyResultId_entityType_entityId_key" ON public.key_result_items USING btree ("keyResultId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "key_results_objectiveId_idx" ON public.key_results USING btree ("objectiveId");

CREATE INDEX IF NOT EXISTS "licenses_expiresAt_idx" ON public.licenses USING btree ("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "licenses_licenseKey_key" ON public.licenses USING btree ("licenseKey");

CREATE INDEX IF NOT EXISTS licenses_status_idx ON public.licenses USING btree (status);

CREATE INDEX IF NOT EXISTS "notifications_userId_read_idx" ON public.notifications USING btree ("userId", read);

CREATE INDEX IF NOT EXISTS "notifications_workspaceId_createdAt_idx" ON public.notifications USING btree ("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "objectives_workspaceId_status_idx" ON public.objectives USING btree ("workspaceId", status);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx" ON public.password_reset_tokens USING btree ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "scim_configs_workspaceId_key" ON public.scim_configs USING btree ("workspaceId");

CREATE UNIQUE INDEX IF NOT EXISTS "scim_groups_workspaceId_externalId_key" ON public.scim_groups USING btree ("workspaceId", "externalId");

CREATE UNIQUE INDEX IF NOT EXISTS share_links_token_key ON public.share_links USING btree (token);

CREATE INDEX IF NOT EXISTS "share_links_workspaceId_entityType_entityId_idx" ON public.share_links USING btree ("workspaceId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "sprints_workspaceId_releaseId_idx" ON public.sprints USING btree ("workspaceId", "releaseId");

CREATE INDEX IF NOT EXISTS "sso_providers_workspaceId_active_idx" ON public.sso_providers USING btree ("workspaceId", active);

CREATE UNIQUE INDEX IF NOT EXISTS "team_members_teamId_userId_key" ON public.team_members USING btree ("teamId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "teams_workspaceId_name_key" ON public.teams USING btree ("workspaceId", name);

CREATE INDEX IF NOT EXISTS "telemetry_reports_instanceId_reportedAt_idx" ON public.telemetry_reports USING btree ("instanceId", "reportedAt");

CREATE INDEX IF NOT EXISTS "telemetry_reports_reportedAt_idx" ON public.telemetry_reports USING btree ("reportedAt");

CREATE INDEX IF NOT EXISTS "webhook_endpoints_workspaceId_active_idx" ON public.webhook_endpoints USING btree ("workspaceId", active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_createdById_fkey') THEN
    ALTER TABLE public.api_tokens
    ADD CONSTRAINT "api_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_workspaceId_fkey') THEN
    ALTER TABLE public.api_tokens
    ADD CONSTRAINT "api_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_workspaceId_fkey') THEN
    ALTER TABLE public.automation_rules
    ADD CONSTRAINT "automation_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_configs_workspaceId_fkey') THEN
    ALTER TABLE public.github_configs
    ADD CONSTRAINT "github_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_links_configId_fkey') THEN
    ALTER TABLE public.github_links
    ADD CONSTRAINT "github_links_configId_fkey" FOREIGN KEY ("configId") REFERENCES public.github_configs(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_links_workspaceId_fkey') THEN
    ALTER TABLE public.github_links
    ADD CONSTRAINT "github_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_createdById_fkey') THEN
    ALTER TABLE public.import_jobs
    ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_workspaceId_fkey') THEN
    ALTER TABLE public.import_jobs
    ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'key_result_items_keyResultId_fkey') THEN
    ALTER TABLE public.key_result_items
    ADD CONSTRAINT "key_result_items_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES public.key_results(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'key_results_objectiveId_fkey') THEN
    ALTER TABLE public.key_results
    ADD CONSTRAINT "key_results_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES public.objectives(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_actorId_fkey') THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_userId_fkey') THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_workspaceId_fkey') THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objectives_workspaceId_fkey') THEN
    ALTER TABLE public.objectives
    ADD CONSTRAINT "objectives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_userId_fkey') THEN
    ALTER TABLE public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scim_configs_workspaceId_fkey') THEN
    ALTER TABLE public.scim_configs
    ADD CONSTRAINT "scim_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scim_groups_workspaceId_fkey') THEN
    ALTER TABLE public.scim_groups
    ADD CONSTRAINT "scim_groups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_createdById_fkey') THEN
    ALTER TABLE public.share_links
    ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_workspaceId_fkey') THEN
    ALTER TABLE public.share_links
    ADD CONSTRAINT "share_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprints_releaseId_fkey') THEN
    ALTER TABLE public.sprints
    ADD CONSTRAINT "sprints_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprints_workspaceId_fkey') THEN
    ALTER TABLE public.sprints
    ADD CONSTRAINT "sprints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sso_providers_createdById_fkey') THEN
    ALTER TABLE public.sso_providers
    ADD CONSTRAINT "sso_providers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sso_providers_workspaceId_fkey') THEN
    ALTER TABLE public.sso_providers
    ADD CONSTRAINT "sso_providers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_teamId_fkey') THEN
    ALTER TABLE public.team_members
    ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_userId_fkey') THEN
    ALTER TABLE public.team_members
    ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_workspaceId_fkey') THEN
    ALTER TABLE public.teams
    ADD CONSTRAINT "teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_createdById_fkey') THEN
    ALTER TABLE public.webhook_endpoints
    ADD CONSTRAINT "webhook_endpoints_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_workspaceId_fkey') THEN
    ALTER TABLE public.webhook_endpoints
    ADD CONSTRAINT "webhook_endpoints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
