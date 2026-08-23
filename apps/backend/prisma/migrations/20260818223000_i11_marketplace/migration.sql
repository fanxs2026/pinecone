-- I11 插件市场骨架（2026-08-18 P2）：工作区已安装插件
CREATE TABLE "installed_plugins" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "pluginId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "description" TEXT,
  "config" JSONB,
  "installedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installed_plugins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "installed_plugins_workspaceId_pluginId_key" ON "installed_plugins"("workspaceId", "pluginId");
CREATE INDEX "installed_plugins_workspaceId_idx" ON "installed_plugins"("workspaceId");
ALTER TABLE "installed_plugins" ADD CONSTRAINT "installed_plugins_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installed_plugins" ADD CONSTRAINT "installed_plugins_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
