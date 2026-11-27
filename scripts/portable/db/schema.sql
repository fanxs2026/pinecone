--
-- PostgreSQL database dump
--


-- Dumped from database version 18.7
-- Dumped by pg_dump version 18.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: ActionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ActionType" AS ENUM (
    'CREATED',
    'UPDATED',
    'STATUS_CHANGED',
    'DELETED',
    'TIME_LOGGED'
);


--
-- Name: EntityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EntityType" AS ENUM (
    'IDEA',
    'FEATURE',
    'STORY',
    'SUPPORT',
    'TEST_CASE',
    'IMPORT_JOB'
);


--
-- Name: RelationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RelationType" AS ENUM (
    'PROMOTED_FROM',
    'CLONED_FROM',
    'RELATED'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'MEMBER',
    'VIEWER'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "userId" uuid,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    action public."ActionType" NOT NULL,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip text
);


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
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


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
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
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_rules (
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


--
-- Name: ci_builds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ci_builds (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "ciConfigId" uuid,
    name text NOT NULL,
    status text NOT NULL,
    branch text,
    commit text,
    url text,
    "releaseId" uuid,
    "testRunCount" integer DEFAULT 0 NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ci_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ci_configs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    "secretEnc" text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
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
-- Name: custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_fields (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    type text DEFAULT 'TEXT'::text NOT NULL,
    options jsonb,
    "isRequired" boolean DEFAULT false NOT NULL,
    "defaultValue" jsonb,
    description text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboards (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    name text DEFAULT '我的报表'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: entity_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_counters (
    "workspaceId" uuid NOT NULL,
    "entityType" text NOT NULL,
    seq integer DEFAULT 0 NOT NULL
);


--
-- Name: entity_relations; Type: TABLE; Schema: public; Owner: -
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
-- Name: entity_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_themes (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    "themeId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_outbox (
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


--
-- Name: features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.features (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    code text,
    "releaseId" uuid,
    "parentFeatureId" uuid,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'P3'::text NOT NULL,
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
    "deletedAt" timestamp(3) without time zone,
    "teamId" uuid,
    "isEpic" boolean DEFAULT false NOT NULL,
    custom_fields jsonb
);


--
-- Name: github_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.github_configs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "repoFullName" text NOT NULL,
    "webhookSecret" text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    provider text DEFAULT 'GITHUB'::text NOT NULL
);


--
-- Name: github_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.github_links (
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


--
-- Name: ideas; Type: TABLE; Schema: public; Owner: -
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
    "deletedAt" timestamp(3) without time zone,
    "teamId" uuid,
    "sprintId" uuid,
    custom_fields jsonb
);


--
-- Name: import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_jobs (
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


--
-- Name: installed_plugins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installed_plugins (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "pluginId" text NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    description text,
    config jsonb,
    "installedById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: instance_heartbeats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_heartbeats (
    id uuid NOT NULL,
    "instanceId" text NOT NULL,
    version text,
    edition text DEFAULT 'COMMUNITY'::text NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "checkCount" integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_codes (
    id uuid NOT NULL,
    code text NOT NULL,
    note text,
    "maxUses" integer DEFAULT 1 NOT NULL,
    "usedCount" integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    active boolean DEFAULT true NOT NULL,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: kb_comments; Type: TABLE; Schema: public; Owner: -
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
-- Name: kb_page_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_page_links (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "pageId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "linkType" text DEFAULT 'REFERENCE'::text NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: kb_page_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_page_tags (
    "pageId" uuid NOT NULL,
    "tagId" uuid NOT NULL
);


--
-- Name: kb_page_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_page_versions (
    id text NOT NULL,
    "pageId" text NOT NULL,
    version integer NOT NULL,
    "contentSnapshot" jsonb,
    "editorId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: kb_pages; Type: TABLE; Schema: public; Owner: -
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
    "deletedAt" timestamp(3) without time zone,
    visibility text DEFAULT 'SPACE'::text NOT NULL,
    "allowedRoleIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "searchVector" tsvector
);


--
-- Name: kb_spaces; Type: TABLE; Schema: public; Owner: -
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
-- Name: kb_tags; Type: TABLE; Schema: public; Owner: -
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
-- Name: key_result_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_result_items (
    id uuid NOT NULL,
    "keyResultId" uuid NOT NULL,
    "entityType" text NOT NULL,
    "entityId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: key_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_results (
    id uuid NOT NULL,
    "objectiveId" uuid NOT NULL,
    title text NOT NULL,
    target text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
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


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
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


--
-- Name: objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objectives (
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


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: registration_whitelist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_whitelist (
    id uuid NOT NULL,
    email text NOT NULL,
    note text,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: releases; Type: TABLE; Schema: public; Owner: -
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
    milestone text,
    narrative text,
    "dependsOnId" uuid
);


--
-- Name: report_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_subscriptions (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    name text NOT NULL,
    schedule text DEFAULT 'DAILY'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: scim_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_configs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    "tokenHash" text,
    "groupRoleMappings" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: scim_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_groups (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "externalId" text,
    "displayName" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "memberIds" text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: score_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.score_history (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    model text DEFAULT 'RICE'::text NOT NULL,
    dimensions jsonb NOT NULL,
    "weightedScore" double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scores (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    model text DEFAULT 'RICE'::text NOT NULL,
    dimensions jsonb NOT NULL,
    "weightedScore" double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text,
    is_secret boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
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


--
-- Name: sprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprints (
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


--
-- Name: sso_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sso_providers (
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


--
-- Name: status_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_transitions (
    id uuid NOT NULL,
    "fromStatusId" uuid NOT NULL,
    "toStatusId" uuid NOT NULL,
    "allowedRoles" public."UserRole"[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
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
    priority text DEFAULT 'P3'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "assigneeId" uuid,
    "estimateHours" numeric(10,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdById" uuid NOT NULL,
    "releaseId" uuid,
    "assigneeName" text,
    "deletedAt" timestamp(3) without time zone,
    "teamId" uuid,
    "sprintId" uuid,
    "parentId" uuid,
    kind text DEFAULT 'FEATURE'::text NOT NULL,
    custom_fields jsonb
);


--
-- Name: story_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_statuses (
    id uuid NOT NULL,
    "workflowId" uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    type text DEFAULT 'CUSTOM'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "wipLimit" integer
);


--
-- Name: supports; Type: TABLE; Schema: public; Owner: -
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
    "releaseId" uuid,
    "deletedAt" timestamp(3) without time zone,
    "teamId" uuid,
    severity text,
    "rootCause" text,
    "discoveryPhase" text,
    custom_fields jsonb
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid NOT NULL,
    "teamId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: telemetry_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetry_reports (
    id uuid NOT NULL,
    "instanceId" text NOT NULL,
    edition text NOT NULL,
    version text,
    counts jsonb NOT NULL,
    "reportedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: test_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_cases (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    code text,
    title text NOT NULL,
    description text,
    type text DEFAULT 'FEATURE'::text NOT NULL,
    steps jsonb,
    "expectedResult" text,
    priority text DEFAULT 'P2'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "storyId" uuid,
    "releaseId" uuid,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: test_plan_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_plan_cases (
    id uuid NOT NULL,
    "testPlanId" uuid NOT NULL,
    "testCaseId" uuid NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: test_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_plans (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "releaseId" uuid,
    name text NOT NULL,
    description text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_runs (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "testCaseId" uuid NOT NULL,
    "releaseId" uuid,
    status text DEFAULT 'UNTESTED'::text NOT NULL,
    "actualResult" text,
    "supportId" uuid,
    "executedById" uuid,
    "executedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "planId" uuid
);


--
-- Name: themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.themes (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    title text NOT NULL,
    description text,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
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
-- Name: todo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.todo_items (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "ideaId" uuid NOT NULL,
    title text NOT NULL,
    description text,
    "assigneeId" uuid NOT NULL,
    "dueDate" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "completedById" uuid,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    name text,
    "passwordHash" text NOT NULL,
    "refreshTokenHash" text,
    avatar text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "isSystemAdmin" boolean DEFAULT false NOT NULL
);


--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    "entityId" uuid NOT NULL,
    "voterUserId" uuid,
    "voterEmail" text,
    "voterName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoints (
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


--
-- Name: webhook_inbound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_inbound (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    token text,
    "encodingAESKey" text,
    "callbackPath" text NOT NULL,
    "commandPrefix" text DEFAULT '/pinecone'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdById" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
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
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role public."UserRole" DEFAULT 'MEMBER'::public."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "trashPurgeEnabled" boolean DEFAULT true NOT NULL,
    "trashPurgeDays" integer DEFAULT 180 NOT NULL,
    "feedbackPortalEnabled" boolean DEFAULT false NOT NULL,
    "feedbackPortalToken" text,
    "feedbackPortalRequireEmail" boolean DEFAULT true NOT NULL,
    "feedbackPortalTarget" text DEFAULT 'SUPPORT'::text NOT NULL,
    "scoringConfig" jsonb
);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: ci_builds ci_builds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_builds
    ADD CONSTRAINT ci_builds_pkey PRIMARY KEY (id);


--
-- Name: ci_configs ci_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_configs
    ADD CONSTRAINT ci_configs_pkey PRIMARY KEY (id);


--
-- Name: ci_configs ci_configs_workspaceId_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_configs
    ADD CONSTRAINT "ci_configs_workspaceId_name_key" UNIQUE ("workspaceId", name);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: custom_fields custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);


--
-- Name: dashboards dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboards
    ADD CONSTRAINT dashboards_pkey PRIMARY KEY (id);


--
-- Name: entity_counters entity_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_counters
    ADD CONSTRAINT entity_counters_pkey PRIMARY KEY ("workspaceId", "entityType");


--
-- Name: entity_relations entity_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT entity_relations_pkey PRIMARY KEY (id);


--
-- Name: entity_themes entity_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_themes
    ADD CONSTRAINT entity_themes_pkey PRIMARY KEY (id);


--
-- Name: event_outbox event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: github_configs github_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_configs
    ADD CONSTRAINT github_configs_pkey PRIMARY KEY (id);


--
-- Name: github_links github_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_pkey PRIMARY KEY (id);


--
-- Name: ideas ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_pkey PRIMARY KEY (id);


--
-- Name: import_jobs import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);


--
-- Name: installed_plugins installed_plugins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_plugins
    ADD CONSTRAINT installed_plugins_pkey PRIMARY KEY (id);


--
-- Name: instance_heartbeats instance_heartbeats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_heartbeats
    ADD CONSTRAINT instance_heartbeats_pkey PRIMARY KEY (id);


--
-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);


--
-- Name: kb_comments kb_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT kb_comments_pkey PRIMARY KEY (id);


--
-- Name: kb_page_links kb_page_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_page_links
    ADD CONSTRAINT kb_page_links_pkey PRIMARY KEY (id);


--
-- Name: kb_page_tags kb_page_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT kb_page_tags_pkey PRIMARY KEY ("pageId", "tagId");


--
-- Name: kb_page_versions kb_page_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_page_versions
    ADD CONSTRAINT kb_page_versions_pkey PRIMARY KEY (id);


--
-- Name: kb_pages kb_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT kb_pages_pkey PRIMARY KEY (id);


--
-- Name: kb_spaces kb_spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_spaces
    ADD CONSTRAINT kb_spaces_pkey PRIMARY KEY (id);


--
-- Name: kb_tags kb_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT kb_tags_pkey PRIMARY KEY (id);


--
-- Name: key_result_items key_result_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_result_items
    ADD CONSTRAINT key_result_items_pkey PRIMARY KEY (id);


--
-- Name: key_results key_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_results
    ADD CONSTRAINT key_results_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: objectives objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_tokenHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_tokenHash_key" UNIQUE ("tokenHash");


--
-- Name: registration_whitelist registration_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_whitelist
    ADD CONSTRAINT registration_whitelist_pkey PRIMARY KEY (id);


--
-- Name: releases releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
-- Name: report_subscriptions report_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_subscriptions
    ADD CONSTRAINT report_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: scim_configs scim_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_configs
    ADD CONSTRAINT scim_configs_pkey PRIMARY KEY (id);


--
-- Name: scim_groups scim_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_pkey PRIMARY KEY (id);


--
-- Name: score_history score_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_history
    ADD CONSTRAINT score_history_pkey PRIMARY KEY (id);


--
-- Name: scores scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scores
    ADD CONSTRAINT scores_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: status_transitions status_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT status_transitions_pkey PRIMARY KEY (id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: story_statuses story_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_statuses
    ADD CONSTRAINT story_statuses_pkey PRIMARY KEY (id);


--
-- Name: supports supports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT supports_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: telemetry_reports telemetry_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_reports
    ADD CONSTRAINT telemetry_reports_pkey PRIMARY KEY (id);


--
-- Name: test_cases test_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_pkey PRIMARY KEY (id);


--
-- Name: test_plan_cases test_plan_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plan_cases
    ADD CONSTRAINT test_plan_cases_pkey PRIMARY KEY (id);


--
-- Name: test_plans test_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plans
    ADD CONSTRAINT test_plans_pkey PRIMARY KEY (id);


--
-- Name: test_runs test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_pkey PRIMARY KEY (id);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: todo_items todo_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todo_items
    ADD CONSTRAINT todo_items_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbound webhook_inbound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound
    ADD CONSTRAINT webhook_inbound_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: activities_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activities_workspaceId_createdAt_idx" ON public.activities USING btree ("workspaceId", "createdAt");


--
-- Name: api_tokens_workspaceId_revokedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "api_tokens_workspaceId_revokedAt_idx" ON public.api_tokens USING btree ("workspaceId", "revokedAt");


--
-- Name: attachments_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachments_entityType_entityId_idx" ON public.attachments USING btree ("entityType", "entityId");


--
-- Name: attachments_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachments_workspaceId_idx" ON public.attachments USING btree ("workspaceId");


--
-- Name: automation_rules_workspaceId_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_rules_workspaceId_enabled_idx" ON public.automation_rules USING btree ("workspaceId", enabled);


--
-- Name: ci_builds_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ci_builds_releaseId_idx" ON public.ci_builds USING btree ("releaseId");


--
-- Name: ci_builds_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ci_builds_workspaceId_idx" ON public.ci_builds USING btree ("workspaceId");


--
-- Name: ci_configs_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ci_configs_workspaceId_idx" ON public.ci_configs USING btree ("workspaceId");


--
-- Name: comments_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_entityType_entityId_idx" ON public.comments USING btree ("entityType", "entityId");


--
-- Name: comments_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_workspaceId_createdAt_idx" ON public.comments USING btree ("workspaceId", "createdAt");


--
-- Name: custom_fields_workspaceId_entityType_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "custom_fields_workspaceId_entityType_isActive_idx" ON public.custom_fields USING btree ("workspaceId", "entityType", "isActive");


--
-- Name: custom_fields_workspaceId_entityType_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "custom_fields_workspaceId_entityType_key_key" ON public.custom_fields USING btree ("workspaceId", "entityType", key);


--
-- Name: dashboards_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dashboards_workspaceId_idx" ON public.dashboards USING btree ("workspaceId");


--
-- Name: entity_relations_sourceEntityType_sourceEntityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entity_relations_sourceEntityType_sourceEntityId_idx" ON public.entity_relations USING btree ("sourceEntityType", "sourceEntityId");


--
-- Name: entity_relations_targetEntityType_targetEntityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entity_relations_targetEntityType_targetEntityId_idx" ON public.entity_relations USING btree ("targetEntityType", "targetEntityId");


--
-- Name: entity_themes_entityType_entityId_themeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "entity_themes_entityType_entityId_themeId_key" ON public.entity_themes USING btree ("entityType", "entityId", "themeId");


--
-- Name: entity_themes_themeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entity_themes_themeId_idx" ON public.entity_themes USING btree ("themeId");


--
-- Name: event_outbox_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "event_outbox_status_createdAt_idx" ON public.event_outbox USING btree (status, "createdAt");


--
-- Name: event_outbox_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "event_outbox_workspaceId_createdAt_idx" ON public.event_outbox USING btree ("workspaceId", "createdAt");


--
-- Name: features_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "features_assigneeId_idx" ON public.features USING btree ("assigneeId");


--
-- Name: features_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX features_code_key ON public.features USING btree (code);


--
-- Name: features_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "features_createdById_idx" ON public.features USING btree ("createdById");


--
-- Name: features_workspaceId_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "features_workspaceId_releaseId_idx" ON public.features USING btree ("workspaceId", "releaseId");


--
-- Name: features_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "features_workspaceId_status_idx" ON public.features USING btree ("workspaceId", status);


--
-- Name: github_configs_workspaceId_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "github_configs_workspaceId_provider_idx" ON public.github_configs USING btree ("workspaceId", provider);


--
-- Name: github_configs_workspaceId_repoFullName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "github_configs_workspaceId_repoFullName_key" ON public.github_configs USING btree ("workspaceId", "repoFullName");


--
-- Name: github_links_workspaceId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "github_links_workspaceId_entityType_entityId_idx" ON public.github_links USING btree ("workspaceId", "entityType", "entityId");


--
-- Name: ideas_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ideas_assigneeId_idx" ON public.ideas USING btree ("assigneeId");


--
-- Name: ideas_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ideas_code_key ON public.ideas USING btree (code);


--
-- Name: ideas_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ideas_createdById_idx" ON public.ideas USING btree ("createdById");


--
-- Name: ideas_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ideas_workspaceId_status_idx" ON public.ideas USING btree ("workspaceId", status);


--
-- Name: import_jobs_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "import_jobs_workspaceId_createdAt_idx" ON public.import_jobs USING btree ("workspaceId", "createdAt");


--
-- Name: installed_plugins_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "installed_plugins_workspaceId_idx" ON public.installed_plugins USING btree ("workspaceId");


--
-- Name: installed_plugins_workspaceId_pluginId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "installed_plugins_workspaceId_pluginId_key" ON public.installed_plugins USING btree ("workspaceId", "pluginId");


--
-- Name: instance_heartbeats_instanceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "instance_heartbeats_instanceId_key" ON public.instance_heartbeats USING btree ("instanceId");


--
-- Name: instance_heartbeats_lastSeenAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "instance_heartbeats_lastSeenAt_idx" ON public.instance_heartbeats USING btree ("lastSeenAt");


--
-- Name: invite_codes_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invite_codes_active_idx ON public.invite_codes USING btree (active);


--
-- Name: invite_codes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invite_codes_code_key ON public.invite_codes USING btree (code);


--
-- Name: kb_comments_pageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_comments_pageId_idx" ON public.kb_comments USING btree ("pageId");


--
-- Name: kb_comments_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_comments_workspaceId_idx" ON public.kb_comments USING btree ("workspaceId");


--
-- Name: kb_page_links_pageId_entityType_entityId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kb_page_links_pageId_entityType_entityId_key" ON public.kb_page_links USING btree ("pageId", "entityType", "entityId");


--
-- Name: kb_page_links_workspaceId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_page_links_workspaceId_entityType_entityId_idx" ON public.kb_page_links USING btree ("workspaceId", "entityType", "entityId");


--
-- Name: kb_page_versions_pageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_page_versions_pageId_idx" ON public.kb_page_versions USING btree ("pageId");


--
-- Name: kb_page_versions_pageId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kb_page_versions_pageId_version_key" ON public.kb_page_versions USING btree ("pageId", version);


--
-- Name: kb_pages_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_pages_parentId_idx" ON public.kb_pages USING btree ("parentId");


--
-- Name: kb_pages_searchVector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_pages_searchVector_idx" ON public.kb_pages USING gin ("searchVector");


--
-- Name: kb_pages_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_pages_spaceId_idx" ON public.kb_pages USING btree ("spaceId");


--
-- Name: kb_pages_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_pages_status_idx ON public.kb_pages USING btree (status);


--
-- Name: kb_pages_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_pages_workspaceId_idx" ON public.kb_pages USING btree ("workspaceId");


--
-- Name: kb_pages_workspaceId_spaceId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kb_pages_workspaceId_spaceId_slug_key" ON public.kb_pages USING btree ("workspaceId", "spaceId", slug);


--
-- Name: kb_spaces_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_spaces_workspaceId_idx" ON public.kb_spaces USING btree ("workspaceId");


--
-- Name: kb_spaces_workspaceId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kb_spaces_workspaceId_slug_key" ON public.kb_spaces USING btree ("workspaceId", slug);


--
-- Name: kb_tags_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kb_tags_workspaceId_idx" ON public.kb_tags USING btree ("workspaceId");


--
-- Name: kb_tags_workspaceId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kb_tags_workspaceId_slug_key" ON public.kb_tags USING btree ("workspaceId", slug);


--
-- Name: key_result_items_keyResultId_entityType_entityId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "key_result_items_keyResultId_entityType_entityId_key" ON public.key_result_items USING btree ("keyResultId", "entityType", "entityId");


--
-- Name: key_results_objectiveId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "key_results_objectiveId_idx" ON public.key_results USING btree ("objectiveId");


--
-- Name: licenses_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "licenses_expiresAt_idx" ON public.licenses USING btree ("expiresAt");


--
-- Name: licenses_licenseKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "licenses_licenseKey_key" ON public.licenses USING btree ("licenseKey");


--
-- Name: licenses_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX licenses_status_idx ON public.licenses USING btree (status);


--
-- Name: notifications_userId_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_userId_read_idx" ON public.notifications USING btree ("userId", read);


--
-- Name: notifications_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_workspaceId_createdAt_idx" ON public.notifications USING btree ("workspaceId", "createdAt");


--
-- Name: objectives_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "objectives_workspaceId_status_idx" ON public.objectives USING btree ("workspaceId", status);


--
-- Name: password_reset_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "password_reset_tokens_userId_idx" ON public.password_reset_tokens USING btree ("userId");


--
-- Name: registration_whitelist_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX registration_whitelist_email_key ON public.registration_whitelist USING btree (email);


--
-- Name: releases_dependsOnId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "releases_dependsOnId_idx" ON public.releases USING btree ("dependsOnId");


--
-- Name: releases_workspaceId_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "releases_workspaceId_startDate_idx" ON public.releases USING btree ("workspaceId", "startDate");


--
-- Name: releases_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "releases_workspaceId_status_idx" ON public.releases USING btree ("workspaceId", status);


--
-- Name: report_subscriptions_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_subscriptions_workspaceId_idx" ON public.report_subscriptions USING btree ("workspaceId");


--
-- Name: scim_configs_workspaceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "scim_configs_workspaceId_key" ON public.scim_configs USING btree ("workspaceId");


--
-- Name: scim_groups_workspaceId_externalId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "scim_groups_workspaceId_externalId_key" ON public.scim_groups USING btree ("workspaceId", "externalId");


--
-- Name: score_history_entityType_entityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "score_history_entityType_entityId_createdAt_idx" ON public.score_history USING btree ("entityType", "entityId", "createdAt");


--
-- Name: scores_entityType_entityId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "scores_entityType_entityId_key" ON public.scores USING btree ("entityType", "entityId");


--
-- Name: scores_workspaceId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "scores_workspaceId_entityType_entityId_idx" ON public.scores USING btree ("workspaceId", "entityType", "entityId");


--
-- Name: share_links_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX share_links_token_key ON public.share_links USING btree (token);


--
-- Name: share_links_workspaceId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "share_links_workspaceId_entityType_entityId_idx" ON public.share_links USING btree ("workspaceId", "entityType", "entityId");


--
-- Name: sprints_workspaceId_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sprints_workspaceId_releaseId_idx" ON public.sprints USING btree ("workspaceId", "releaseId");


--
-- Name: sso_providers_workspaceId_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sso_providers_workspaceId_active_idx" ON public.sso_providers USING btree ("workspaceId", active);


--
-- Name: status_transitions_fromStatusId_toStatusId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "status_transitions_fromStatusId_toStatusId_key" ON public.status_transitions USING btree ("fromStatusId", "toStatusId");


--
-- Name: stories_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stories_assigneeId_idx" ON public.stories USING btree ("assigneeId");


--
-- Name: stories_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stories_code_key ON public.stories USING btree (code);


--
-- Name: stories_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stories_createdById_idx" ON public.stories USING btree ("createdById");


--
-- Name: stories_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stories_releaseId_idx" ON public.stories USING btree ("releaseId");


--
-- Name: stories_workspaceId_featureId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stories_workspaceId_featureId_idx" ON public.stories USING btree ("workspaceId", "featureId");


--
-- Name: stories_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stories_workspaceId_status_idx" ON public.stories USING btree ("workspaceId", status);


--
-- Name: story_statuses_workflowId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "story_statuses_workflowId_name_key" ON public.story_statuses USING btree ("workflowId", name);


--
-- Name: supports_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supports_assigneeId_idx" ON public.supports USING btree ("assigneeId");


--
-- Name: supports_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supports_code_key ON public.supports USING btree (code);


--
-- Name: supports_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supports_createdById_idx" ON public.supports USING btree ("createdById");


--
-- Name: supports_workspaceId_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supports_workspaceId_releaseId_idx" ON public.supports USING btree ("workspaceId", "releaseId");


--
-- Name: supports_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supports_workspaceId_status_idx" ON public.supports USING btree ("workspaceId", status);


--
-- Name: team_members_teamId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON public.team_members USING btree ("teamId", "userId");


--
-- Name: teams_workspaceId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "teams_workspaceId_name_key" ON public.teams USING btree ("workspaceId", name);


--
-- Name: telemetry_reports_instanceId_reportedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "telemetry_reports_instanceId_reportedAt_idx" ON public.telemetry_reports USING btree ("instanceId", "reportedAt");


--
-- Name: telemetry_reports_reportedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "telemetry_reports_reportedAt_idx" ON public.telemetry_reports USING btree ("reportedAt");


--
-- Name: test_cases_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX test_cases_code_key ON public.test_cases USING btree (code);


--
-- Name: test_cases_workspaceId_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_cases_workspaceId_releaseId_idx" ON public.test_cases USING btree ("workspaceId", "releaseId");


--
-- Name: test_cases_workspaceId_storyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_cases_workspaceId_storyId_idx" ON public.test_cases USING btree ("workspaceId", "storyId");


--
-- Name: test_plan_cases_testCaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_plan_cases_testCaseId_idx" ON public.test_plan_cases USING btree ("testCaseId");


--
-- Name: test_plan_cases_testPlanId_testCaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "test_plan_cases_testPlanId_testCaseId_key" ON public.test_plan_cases USING btree ("testPlanId", "testCaseId");


--
-- Name: test_plans_workspaceId_releaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_plans_workspaceId_releaseId_idx" ON public.test_plans USING btree ("workspaceId", "releaseId");


--
-- Name: test_runs_planId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_runs_planId_idx" ON public.test_runs USING btree ("planId");


--
-- Name: test_runs_testCaseId_releaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "test_runs_testCaseId_releaseId_key" ON public.test_runs USING btree ("testCaseId", "releaseId");


--
-- Name: test_runs_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "test_runs_workspaceId_status_idx" ON public.test_runs USING btree ("workspaceId", status);


--
-- Name: themes_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "themes_workspaceId_idx" ON public.themes USING btree ("workspaceId");


--
-- Name: time_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_date_idx ON public.time_entries USING btree (date);


--
-- Name: time_entries_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_entityType_entityId_idx" ON public.time_entries USING btree ("entityType", "entityId");


--
-- Name: time_entries_storyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_storyId_idx" ON public.time_entries USING btree ("storyId");


--
-- Name: time_entries_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_userId_idx" ON public.time_entries USING btree ("userId");


--
-- Name: time_entries_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_workspaceId_idx" ON public.time_entries USING btree ("workspaceId");


--
-- Name: todo_items_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "todo_items_assigneeId_idx" ON public.todo_items USING btree ("assigneeId");


--
-- Name: todo_items_workspaceId_ideaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "todo_items_workspaceId_ideaId_idx" ON public.todo_items USING btree ("workspaceId", "ideaId");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: votes_entityType_entityId_voterEmail_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "votes_entityType_entityId_voterEmail_key" ON public.votes USING btree ("entityType", "entityId", "voterEmail");


--
-- Name: votes_entityType_entityId_voterUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "votes_entityType_entityId_voterUserId_key" ON public.votes USING btree ("entityType", "entityId", "voterUserId");


--
-- Name: votes_workspaceId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "votes_workspaceId_entityType_entityId_idx" ON public.votes USING btree ("workspaceId", "entityType", "entityId");


--
-- Name: webhook_endpoints_workspaceId_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "webhook_endpoints_workspaceId_active_idx" ON public.webhook_endpoints USING btree ("workspaceId", active);


--
-- Name: webhook_inbound_workspaceId_platform_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "webhook_inbound_workspaceId_platform_key" ON public.webhook_inbound USING btree ("workspaceId", platform);


--
-- Name: workflows_workspaceId_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "workflows_workspaceId_entityType_key" ON public.workflows USING btree ("workspaceId", "entityType");


--
-- Name: workspace_members_workspaceId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON public.workspace_members USING btree ("workspaceId", "userId");


--
-- Name: workspaces_feedbackPortalToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "workspaces_feedbackPortalToken_key" ON public.workspaces USING btree ("feedbackPortalToken");


--
-- Name: workspaces_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces USING btree (slug);


--
-- Name: activities activities_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: activities activities_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: api_tokens api_tokens_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT "api_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: api_tokens api_tokens_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT "api_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachments attachments_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attachments attachments_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: automation_rules automation_rules_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT "automation_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ci_builds ci_builds_ciConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_builds
    ADD CONSTRAINT "ci_builds_ciConfigId_fkey" FOREIGN KEY ("ciConfigId") REFERENCES public.ci_configs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ci_builds ci_builds_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_builds
    ADD CONSTRAINT "ci_builds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ci_configs ci_configs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ci_configs
    ADD CONSTRAINT "ci_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comments comments_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_fields custom_fields_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT "custom_fields_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: entity_relations entity_relations_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT "entity_relations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: features features_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: features features_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: features features_parentFeatureId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_parentFeatureId_fkey" FOREIGN KEY ("parentFeatureId") REFERENCES public.features(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: features features_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: features features_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT "features_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: github_configs github_configs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_configs
    ADD CONSTRAINT "github_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: github_links github_links_configId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT "github_links_configId_fkey" FOREIGN KEY ("configId") REFERENCES public.github_configs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: github_links github_links_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT "github_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ideas ideas_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ideas ideas_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ideas ideas_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT "ideas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: import_jobs import_jobs_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: import_jobs import_jobs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: installed_plugins installed_plugins_installedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_plugins
    ADD CONSTRAINT "installed_plugins_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: installed_plugins installed_plugins_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_plugins
    ADD CONSTRAINT "installed_plugins_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_comments kb_comments_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: kb_comments kb_comments_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_comments kb_comments_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.kb_comments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: kb_comments kb_comments_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_comments
    ADD CONSTRAINT "kb_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_page_tags kb_page_tags_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT "kb_page_tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_page_tags kb_page_tags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_page_tags
    ADD CONSTRAINT "kb_page_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.kb_tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_pages kb_pages_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: kb_pages kb_pages_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.kb_pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: kb_pages kb_pages_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.kb_spaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: kb_pages kb_pages_updaterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_updaterId_fkey" FOREIGN KEY ("updaterId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: kb_pages kb_pages_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_pages
    ADD CONSTRAINT "kb_pages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_spaces kb_spaces_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_spaces
    ADD CONSTRAINT "kb_spaces_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kb_tags kb_tags_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT "kb_tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: key_result_items key_result_items_keyResultId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_result_items
    ADD CONSTRAINT "key_result_items_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES public.key_results(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: key_results key_results_objectiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_results
    ADD CONSTRAINT "key_results_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES public.objectives(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notifications notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: objectives objectives_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT "objectives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: releases releases_dependsOnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT "releases_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: releases releases_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT "releases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: scim_configs scim_configs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_configs
    ADD CONSTRAINT "scim_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: scim_groups scim_groups_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT "scim_groups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: score_history score_history_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_history
    ADD CONSTRAINT "score_history_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: share_links share_links_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: share_links share_links_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT "share_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sprints sprints_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT "sprints_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sprints sprints_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT "sprints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sso_providers sso_providers_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT "sso_providers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sso_providers sso_providers_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT "sso_providers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: status_transitions status_transitions_fromStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT "status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES public.story_statuses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: status_transitions status_transitions_toStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_transitions
    ADD CONSTRAINT "status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES public.story_statuses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stories stories_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: stories stories_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stories stories_featureId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES public.features(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stories stories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stories stories_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: stories stories_sprintId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES public.sprints(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: stories stories_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT "stories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_statuses story_statuses_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_statuses
    ADD CONSTRAINT "story_statuses_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supports supports_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supports supports_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supports supports_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supports supports_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supports
    ADD CONSTRAINT "supports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_members team_members_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_members team_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: teams teams_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT "teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_cases test_cases_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT "test_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: test_cases test_cases_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT "test_cases_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_cases test_cases_storyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT "test_cases_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_cases test_cases_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT "test_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_plan_cases test_plan_cases_testCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plan_cases
    ADD CONSTRAINT "test_plan_cases_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES public.test_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_plan_cases test_plan_cases_testPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plan_cases
    ADD CONSTRAINT "test_plan_cases_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES public.test_plans(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_plans test_plans_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plans
    ADD CONSTRAINT "test_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: test_plans test_plans_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plans
    ADD CONSTRAINT "test_plans_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_plans test_plans_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plans
    ADD CONSTRAINT "test_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_runs test_runs_executedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_runs test_runs_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.test_plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_runs test_runs_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_runs test_runs_supportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES public.supports(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: test_runs test_runs_testCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES public.test_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: test_runs test_runs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT "test_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entries time_entries_storyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entries time_entries_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: time_entries time_entries_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: todo_items todo_items_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todo_items
    ADD CONSTRAINT "todo_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: todo_items todo_items_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todo_items
    ADD CONSTRAINT "todo_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: todo_items todo_items_ideaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todo_items
    ADD CONSTRAINT "todo_items_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES public.ideas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: todo_items todo_items_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todo_items
    ADD CONSTRAINT "todo_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: webhook_endpoints webhook_endpoints_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT "webhook_endpoints_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_endpoints webhook_endpoints_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT "webhook_endpoints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: webhook_inbound webhook_inbound_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound
    ADD CONSTRAINT "webhook_inbound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_inbound webhook_inbound_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound
    ADD CONSTRAINT "webhook_inbound_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflows workflows_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT "workflows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- Name: TABLE custom_fields; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_fields TO pinecone_app;


--
-- PostgreSQL database dump complete
--

--
-- ===== 增量补齐区（快照之后新增的迁移，按时间顺序追加，全部幂等） =====
--
-- 为什么放在这里而不是改上面的 CREATE TABLE：
--   这份 schema.sql 是 pg_dump 快照，只要「最终结构」正确即可；幂等的 ALTER/CREATE
--   IF NOT EXISTS 既能用于全新库，也能直接拿到已部署库上执行（不需要重建库丢数据）。
-- ⚠️ 每次新增 Prisma 迁移，必须在这里同步追加等价 DDL，否则便携版建库会缺列，
--    运行期报 P2022 "column ... does not exist" → 前端统一显示 internal server error。
--

--
-- 2026-11-02 add_entity_due_dates：实体交付时限（承诺完成日）
-- 对应 apps/backend/prisma/migrations/20261102140000_add_entity_due_dates/migration.sql
--
ALTER TABLE public.stories  ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.supports ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS "stories_workspaceId_due_date_idx"  ON public.stories  USING btree ("workspaceId", due_date);
CREATE INDEX IF NOT EXISTS "features_workspaceId_due_date_idx" ON public.features USING btree ("workspaceId", due_date);
CREATE INDEX IF NOT EXISTS "supports_workspaceId_due_date_idx" ON public.supports USING btree ("workspaceId", due_date);

--
-- 2026-11-02 add_saved_views：列表保存视图
-- 对应 apps/backend/prisma/migrations/20261102160000_add_saved_views/migration.sql
--
CREATE TABLE IF NOT EXISTS public.saved_views (
    id uuid NOT NULL,
    "workspaceId" uuid NOT NULL,
    "entityType" public."EntityType" NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    columns jsonb,
    "isShared" boolean DEFAULT false NOT NULL,
    "createdById" uuid NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "saved_views_workspaceId_entityType_idx"
    ON public.saved_views USING btree ("workspaceId", "entityType");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_pkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_pkey" PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_workspaceId_entityType_name_key') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_workspaceId_entityType_name_key"
            UNIQUE ("workspaceId", "entityType", name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_workspaceId_fkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_createdById_fkey') THEN
        ALTER TABLE public.saved_views ADD CONSTRAINT "saved_views_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- 新表授权（角色不存在时跳过，便于在非便携版环境复用本段）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pinecone_app') THEN
        GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.saved_views TO pinecone_app;
    END IF;
END $$;

--
-- ===== 以下与 db/patches/20261126_uuid_alignment_and_fkeys.sql 保持逐字一致 =====
--
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
