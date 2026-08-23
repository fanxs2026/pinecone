-- P0: 客户反馈门户 + 投票 + 主题聚合 + 优先级评分（2026-08-14，手写迁移，禁 migrate dev 防重置）

-- AlterTable: workspaces 加配置列
ALTER TABLE "workspaces" ADD COLUMN "feedbackPortalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workspaces" ADD COLUMN "feedbackPortalToken" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "feedbackPortalRequireEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspaces" ADD COLUMN "feedbackPortalTarget" TEXT NOT NULL DEFAULT 'SUPPORT';
ALTER TABLE "workspaces" ADD COLUMN "scoringConfig" JSONB;

-- CreateTable: votes
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "voterUserId" UUID,
    "voterEmail" TEXT,
    "voterName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: themes
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: entity_themes
CREATE TABLE "entity_themes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "themeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entity_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scores
CREATE TABLE "scores" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'RICE',
    "dimensions" JSONB NOT NULL,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: workspaces.feedbackPortalToken unique
CREATE UNIQUE INDEX "workspaces_feedbackPortalToken_key" ON "workspaces"("feedbackPortalToken");

-- CreateIndex: votes
CREATE UNIQUE INDEX "votes_entityType_entityId_voterUserId_key" ON "votes"("entityType", "entityId", "voterUserId");
CREATE UNIQUE INDEX "votes_entityType_entityId_voterEmail_key" ON "votes"("entityType", "entityId", "voterEmail");
CREATE INDEX "votes_workspaceId_entityType_entityId_idx" ON "votes"("workspaceId", "entityType", "entityId");

-- CreateIndex: themes
CREATE INDEX "themes_workspaceId_idx" ON "themes"("workspaceId");

-- CreateIndex: entity_themes
CREATE UNIQUE INDEX "entity_themes_entityType_entityId_themeId_key" ON "entity_themes"("entityType", "entityId", "themeId");
CREATE INDEX "entity_themes_themeId_idx" ON "entity_themes"("themeId");

-- CreateIndex: scores
CREATE UNIQUE INDEX "scores_entityType_entityId_key" ON "scores"("entityType", "entityId");
CREATE INDEX "scores_workspaceId_entityType_entityId_idx" ON "scores"("workspaceId", "entityType", "entityId");
