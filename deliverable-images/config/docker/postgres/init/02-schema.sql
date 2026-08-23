CREATE TYPE public."ActionType" AS ENUM (
    'CREATED',
    'UPDATED',
    'STATUS_CHANGED',
    'DELETED',
    'TIME_LOGGED'
);


--
--

CREATE TYPE public."EntityType" AS ENUM (
    'IDEA',
    'FEATURE',
    'STORY',
    'SUPPORT'
);


--
--

CREATE TYPE public."RelationType" AS ENUM (
    'PROMOTED_FROM',
    'CLONED_FROM',
    'RELATED'
);


--
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'MEMBER',
    'VIEWER'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
--

CREATE TABLE public.activities (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "userId" uuid,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    action public."ActionType" NOT NULL,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.attachments (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    "fileName" text NOT NULL,
    "fileSize" integer NOT NULL,
    "mimeType" text NOT NULL,
    "storagePath" text NOT NULL,
    "uploadedById" uuid NOT NULL,
    category text DEFAULT 'FILE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.comments (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    content text NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

CREATE TABLE public.entity_relations (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "sourceEntityType" public."EntityType" NOT NULL,
    "sourceEntityId" uuid NOT NULL,
    "targetEntityType" public."EntityType" NOT NULL,
    "targetEntityId" uuid NOT NULL,
    "relationType" public."RelationType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.features (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    code text,
    "releaseId" uuid,
    "parentFeatureId" uuid,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'P2'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "assigneeId" uuid,
    "assigneeName" text,
    "effortEstimate" numeric(10,2),
    "effortUnit" text DEFAULT 'HOURS'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    tags text[],
    "createdById" uuid NOT NULL,
    CONSTRAINT chk_features_status CHECK ((status = ANY (ARRAY['OPEN'::text, 'READY_FOR_GROOMING'::text, 'DECOMPOSITION'::text, 'IN_DEVELOPING'::text, 'IN_VERIFICATION'::text, 'CLOSED'::text])))
);


--
--

CREATE TABLE public.ideas (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    code text,
    title text NOT NULL,
    description text,
    category text,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "assigneeId" uuid,
    "assigneeName" text,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    tags text[],
    CONSTRAINT chk_ideas_status CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'PLANNED'::text, 'SHIPPED'::text, 'REJECTED'::text, 'ALREADY_EXISTING'::text, 'DUPLICATED'::text, 'DRAFT'::text])))
);


--
--

CREATE TABLE public.kb_comments (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "pageId" uuid NOT NULL,
    "parentId" uuid,
    "authorId" uuid NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
--

CREATE TABLE public.kb_page_tags (
    "pageId" uuid NOT NULL,
    "tagId" uuid NOT NULL
);


--
--

CREATE TABLE public.kb_pages (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "spaceId" uuid,
    "parentId" uuid,
    path text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    content jsonb,
    "contentText" text,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "authorId" uuid NOT NULL,
    "updaterId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
--

CREATE TABLE public.kb_spaces (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    icon text,
    description text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    visibility text DEFAULT 'everyone'::text NOT NULL
);


--
--

CREATE TABLE public.kb_tags (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.releases (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    version text,
    description text,
    "startDate" date,
    "endDate" date,
    "stageDate" date,
    "productionDate" date,
    status text DEFAULT 'PLANNING'::text NOT NULL,
    "totalCapacity" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT chk_releases_status CHECK ((status = ANY (ARRAY['PLANNING'::text, 'IN_PROGRESS'::text, 'CLOSED'::text])))
);


--
--

CREATE TABLE public.status_transitions (
    id uuid NOT NULL,
    "fromStatusId" uuid NOT NULL,
    "toStatusId" uuid NOT NULL,
    "allowedRoles" public."UserRole"[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.stories (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "featureId" uuid NOT NULL,
    code text,
    title text NOT NULL,
    description text,
    "acceptanceCriteria" text,
    "storyPoints" integer,
    priority text DEFAULT 'P2'::text NOT NULL,
    status text DEFAULT 'TODO'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "assigneeId" uuid,
    "estimateHours" numeric(10,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdById" uuid NOT NULL,
    "releaseId" uuid,
    "assigneeName" text,
    CONSTRAINT chk_stories_status CHECK ((status = ANY (ARRAY['TODO'::text, 'IN_PROGRESS'::text, 'REVIEW'::text, 'DONE'::text, 'BLOCKED'::text])))
);


--
--

CREATE TABLE public.story_statuses (
    id uuid NOT NULL,
    "workflowId" uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    type text DEFAULT 'CUSTOM'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.supports (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    code text,
    title text NOT NULL,
    description text,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "createdById" uuid NOT NULL,
    "assigneeId" uuid,
    "assigneeName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    tags text[],
    type text DEFAULT 'SUPPORT_REQUEST'::text NOT NULL,
    CONSTRAINT chk_supports_status CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'CLOSED'::text])))
);


--
--

CREATE TABLE public.time_entries (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "storyId" uuid,
    "userId" uuid NOT NULL,
    "entityType" text,
    "entityId" uuid,
    description text NOT NULL,
    hours numeric(10,2) NOT NULL,
    date date NOT NULL,
    billable boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    name text,
    "passwordHash" text NOT NULL,
    "refreshTokenHash" text,
    avatar text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

CREATE TABLE public.workflows (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

CREATE TABLE public.workspace_members (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role public."UserRole" DEFAULT 'MEMBER'::public."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
--

CREATE TABLE public.workspaces (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT entity_relations_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT kb_comments_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT kb_page_tags_pkey PRIMARY KEY ("pageId", "tagId");


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT kb_pages_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.kb_spaces
    ADD CONSTRAINT kb_spaces_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT kb_tags_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_tokenHash_key" UNIQUE ("tokenHash");


--
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT status_transitions_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.story_statuses
    ADD CONSTRAINT story_statuses_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT supports_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
--

CREATE INDEX "activities_workspaceId_createdAt_idx" ON public.activities USING btree ("workspaceId", "createdAt");


--
--

CREATE INDEX "attachments_entityType_entityId_idx" ON public.attachments USING btree ("entityType", "entityId");


--
--

CREATE INDEX "attachments_workspaceId_idx" ON public.attachments USING btree ("workspaceId");


--
--

CREATE INDEX "comments_entityType_entityId_idx" ON public.comments USING btree ("entityType", "entityId");


--
--

CREATE INDEX "comments_workspaceId_createdAt_idx" ON public.comments USING btree ("workspaceId", "createdAt");


--
--

CREATE INDEX "entity_relations_sourceEntityType_sourceEntityId_idx" ON public.entity_relations USING btree ("sourceEntityType", "sourceEntityId");


--
--

CREATE INDEX "entity_relations_targetEntityType_targetEntityId_idx" ON public.entity_relations USING btree ("targetEntityType", "targetEntityId");


--
--

CREATE INDEX "features_assigneeId_idx" ON public.features USING btree ("assigneeId");


--
--

CREATE UNIQUE INDEX features_code_key ON public.features USING btree (code);


--
--

CREATE INDEX "features_createdById_idx" ON public.features USING btree ("createdById");


--
--

CREATE INDEX "features_workspaceId_releaseId_idx" ON public.features USING btree ("workspaceId", "releaseId");


--
--

CREATE INDEX "features_workspaceId_status_idx" ON public.features USING btree ("workspaceId", status);


--
--

CREATE INDEX "ideas_assigneeId_idx" ON public.ideas USING btree ("assigneeId");


--
--

CREATE UNIQUE INDEX ideas_code_key ON public.ideas USING btree (code);


--
--

CREATE INDEX "ideas_createdById_idx" ON public.ideas USING btree ("createdById");


--
--

CREATE INDEX "ideas_workspaceId_status_idx" ON public.ideas USING btree ("workspaceId", status);


--
--

CREATE INDEX "kb_comments_pageId_idx" ON public.kb_comments USING btree ("pageId");


--
--

CREATE INDEX "kb_comments_workspaceId_idx" ON public.kb_comments USING btree ("workspaceId");


--
--

CREATE INDEX "kb_pages_parentId_idx" ON public.kb_pages USING btree ("parentId");


--
--

CREATE INDEX "kb_pages_spaceId_idx" ON public.kb_pages USING btree ("spaceId");


--
--

CREATE INDEX kb_pages_status_idx ON public.kb_pages USING btree (status);


--
--

CREATE INDEX "kb_pages_workspaceId_idx" ON public.kb_pages USING btree ("workspaceId");


--
--

CREATE UNIQUE INDEX "kb_pages_workspaceId_spaceId_slug_key" ON public.kb_pages USING btree ("workspaceId", "spaceId", slug);


--
--

CREATE INDEX "kb_spaces_workspaceId_idx" ON public.kb_spaces USING btree ("workspaceId");


--
--

CREATE UNIQUE INDEX "kb_spaces_workspaceId_slug_key" ON public.kb_spaces USING btree ("workspaceId", slug);


--
--

CREATE INDEX "kb_tags_workspaceId_idx" ON public.kb_tags USING btree ("workspaceId");


--
--

CREATE UNIQUE INDEX "kb_tags_workspaceId_slug_key" ON public.kb_tags USING btree ("workspaceId", slug);


--
--

CREATE INDEX password_reset_tokens_userid_idx ON public.password_reset_tokens USING btree ("userId");


--
--

CREATE INDEX "releases_workspaceId_startDate_idx" ON public.releases USING btree ("workspaceId", "startDate");


--
--

CREATE INDEX "releases_workspaceId_status_idx" ON public.releases USING btree ("workspaceId", status);


--
--

CREATE UNIQUE INDEX "status_transitions_fromStatusId_toStatusId_key" ON public.status_transitions USING btree ("fromStatusId", "toStatusId");


--
--

CREATE INDEX "stories_assigneeId_idx" ON public.stories USING btree ("assigneeId");


--
--

CREATE UNIQUE INDEX stories_code_key ON public.stories USING btree (code);


--
--

CREATE INDEX "stories_createdById_idx" ON public.stories USING btree ("createdById");


--
--

CREATE INDEX "stories_releaseId_idx" ON public.stories USING btree ("releaseId");


--
--

CREATE INDEX "stories_workspaceId_featureId_idx" ON public.stories USING btree ("workspaceId", "featureId");


--
--

CREATE INDEX "stories_workspaceId_status_idx" ON public.stories USING btree ("workspaceId", status);


--
--

CREATE UNIQUE INDEX "story_statuses_workflowId_name_key" ON public.story_statuses USING btree ("workflowId", name);


--
--

CREATE INDEX "supports_assigneeId_idx" ON public.supports USING btree ("assigneeId");


--
--

CREATE UNIQUE INDEX supports_code_key ON public.supports USING btree (code);


--
--

CREATE INDEX "supports_createdById_idx" ON public.supports USING btree ("createdById");


--
--

CREATE INDEX "supports_workspaceId_status_idx" ON public.supports USING btree ("workspaceId", status);


--
--

CREATE INDEX time_entries_date_idx ON public.time_entries USING btree (date);


--
--

CREATE INDEX "time_entries_entityType_entityId_idx" ON public.time_entries USING btree ("entityType", "entityId");


--
--

CREATE INDEX "time_entries_storyId_idx" ON public.time_entries USING btree ("storyId");


--
--

CREATE INDEX "time_entries_userId_idx" ON public.time_entries USING btree ("userId");


--
--

CREATE INDEX "time_entries_workspaceId_idx" ON public.time_entries USING btree ("workspaceId");


--
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
--

CREATE UNIQUE INDEX "workflows_workspaceId_entityType_key" ON public.workflows USING btree ("workspaceId", "entityType");


--
--

CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON public.workspace_members USING btree ("workspaceId", "userId");


--
--

CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces USING btree (slug);


--
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT "entity_relations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_parentFeatureId_fkey" FOREIGN KEY ("parentFeatureId") REFERENCES public.features(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.kb_comments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT "kb_page_tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT "kb_page_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.kb_tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.kb_spaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_updaterId_fkey" FOREIGN KEY ("updaterId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_spaces
    ADD CONSTRAINT "kb_spaces_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT "kb_tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT "releases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT "status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES public.story_statuses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT "status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES public.story_statuses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES public.features(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.story_statuses
    ADD CONSTRAINT "story_statuses_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT "workflows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--



-- ── 6. 应用用户授权（表级 DML 权限）──
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pinecone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pinecone_app;
-- 未来新建的表自动授权（默认权限）
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pinecone_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pinecone_app;

-- =====================================================================
-- 2026-08-07 增量：用户禁用 + to-do + 注册控制（与 prisma/migrations/20260807_add_todo_invite_whitelist 同步）
-- =====================================================================

-- AlterTable: users.active（账号禁用）
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: todo_items（Idea to-do）
CREATE TABLE "todo_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ideaId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" UUID NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "todo_items_workspaceId_ideaId_idx" ON "todo_items"("workspaceId", "ideaId");
CREATE INDEX "todo_items_assigneeId_idx" ON "todo_items"("assigneeId");

-- CreateTable: invite_codes（注册邀请码）
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");
CREATE INDEX "invite_codes_active_idx" ON "invite_codes"("active");

-- CreateTable: registration_whitelist（注册白名单）
CREATE TABLE "registration_whitelist" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registration_whitelist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registration_whitelist_email_key" ON "registration_whitelist"("email");

-- Foreign keys (todo_items)
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 授权给运行时用户（DML）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pinecone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pinecone_app;

-- =====================================================================
-- 完成！验证：\dt 应看到 26 张表；用 pinecone_app 登录应能读写
-- =====================================================================
