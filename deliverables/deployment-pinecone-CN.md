# Pinecone 部署说明（中文）

> 日期：2026-08-21 ｜ 适用版本：Pinecone 2.2.0  
> 本文覆盖两种部署方式：**Docker 全栈（推荐）** 与 **无 Docker（源码 + Node/PostgreSQL/Redis 原生）**。自签证书问题不在本文讨论范围（生产由部署方提供正规 TLS）。

---

## 目录

- [1. 准备事项](#1-准备事项)
- [2. 方式 A：Docker 全栈部署（推荐）](#2-方式-adocker-全栈部署推荐)
- [3. 方式 B：无 Docker 原生部署](#3-方式-b无-docker-原生部署)
- [4. 环境变量配置](#4-环境变量配置)
- [5. 数据库初始化](#5-数据库初始化)
- [6. HTTPS 与反向代理](#6-https-与反向代理)
- [7. 验证与健康检查](#7-验证与健康检查)
- [8. 备份与回滚](#8-备份与回滚)
- [9. 故障排查](#9-故障排查)

---

## 1. 准备事项

| 组件 | 版本要求 |
| --- | --- |
| Docker / Docker Compose | 较新版本（推荐 Docker 24+） |
| Node.js（仅无 Docker 方式） | ≥ 22.12（含 corepack） |
| pnpm（仅无 Docker 方式） | 11（锁定 `pnpm@11.10.0`） |
| PostgreSQL（仅无 Docker 方式） | 18 |
| Redis（仅无 Docker 方式） | 7 |
| 操作系统 | Linux / macOS / Windows（WSL2 推荐） |

无论哪种方式，**密钥都必须替换为强随机值**：

```bash
# JWT secrets（≥32 字符）
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# 数据库 app 用户密码（≥16 字符）
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## 2. 方式 A：Docker 全栈部署（推荐）

所有服务（postgres + redis + backend + frontend）由 `docker-compose.prod.yml` 编排，适合大多数生产场景。

### 2.1 准备环境变量

```bash
cd <项目根目录>
cp docker/.env.prod.example .env.prod
# 编辑 .env.prod，至少设置：
#   DB_PASSWORD / APP_DB_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   FRONTEND_URL / API_URL / WS_URL / REGISTRATION_MODE / REGISTRATION_ADMIN_EMAILS
```

> 完整变量说明见 [第 4 节](#4-环境变量配置) 与 `docker/.env.prod.example` 注释。

### 2.2 构建并启动

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

首次启动 postgres 容器会执行 `docker/postgres/init-v2/01-init.sh` 创建 `pinecone_admin`（DDL）与 `pinecone_app`（DML）两个角色；**表结构由后端 `prisma migrate deploy` 在建库后应用**（compose 的健康检查依赖 postgres，backend 启动会自动建表）。

### 2.3 检查状态

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
# 期望：postgres/redis healthy，backend/frontend Up
```

- 前端：<http://localhost:6173>（或 `FRONTEND_PORT`）
- 后端 API：<http://localhost:3000/api>（或 `BACKEND_PORT`）
- 知识库协同 WS：<http://localhost:3002>（或 `KB_COLLAB_PORT`）

### 2.4 离线 tar 分发（无源码环境）

客户环境无需源码，分发 `pinecone-release-*.zip`：

```bash
unzip pinecone-release-1.0.0.zip
cd <包目录>
docker load < pinecone-backend.tar
docker load < pinecone-frontend.tar
cd config && cp .env.prod.example .env.prod   # 编辑后
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d   # 注意：不要 --build
```

> ⚠️ 离线包不含源码，启动**不要加 `--build`**，否则 compose 会尝试从目录重建失败。postgres/redis 联网环境会自动拉取。

---

## 3. 方式 B：无 Docker 原生部署

适合已有 PostgreSQL/Redis 实例、希望直接用 Node 运行前后端的场景。

### 3.1 基础设施（二选一）

- **用仓库自带的 dev compose 起 PG/Redis**（仅基础设施）：
  ```bash
  docker compose up -d postgres redis
  ```
- 或复用你现有的 PostgreSQL 18 + Redis 7 实例。

### 3.2 创建数据库角色

无 Docker 方式不会自动跑 init 脚本，需手动创建两个角色（与 `docker/postgres/init-v2/01-init.sh` 一致）：

```sql
-- 以超级用户执行
CREATE ROLE pinecone_admin LOGIN PASSWORD '<DB_PASSWORD>' CREATEDB;
CREATE ROLE pinecone_app  LOGIN PASSWORD '<APP_DB_PASSWORD>';
CREATE DATABASE pinecone OWNER pinecone_admin;
-- 授予 app 用户对业务表的 DML（migrate deploy 后执行 grant，或由 init 脚本处理）
```

> `pinecone_admin` 用于迁移（DDL），`pinecone_app` 用于运行时（仅 DML，最小权限）。

### 3.3 安装依赖

```bash
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm install --frozen-lockfile
```

### 3.4 配置环境变量

```bash
cp .env.example .env
# 编辑 .env：DATABASE_URL(用 pinecone_admin) / APP_DB_PASSWORD / JWT_* / REDIS_URL / FRONTEND_URL / NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
```

> 运行时若希望后端用 `pinecone_app` 连接，可将 `DATABASE_URL` 改为 `pinecone_app@...`（迁移阶段仍建议用 admin）。

### 3.5 数据库迁移

```bash
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
```

### 3.6 构建并运行后端

```bash
pnpm --filter backend build          # nest build -> apps/backend/dist
NODE_ENV=production node apps/backend/dist/main.js
# 或用：pnpm --filter backend start
```

### 3.7 构建并运行前端

```bash
# NEXT_PUBLIC_* 是构建时内联，必须在 build 前设好
export NEXT_PUBLIC_API_URL=http://localhost:3000/api
export NEXT_PUBLIC_WS_URL=http://localhost:3000/ws
pnpm --filter frontend build
NODE_ENV=production pnpm --filter frontend start   # 默认监听 3000；可 -p 6173
```

> 前端 `next start` 默认端口 3000；若与后端同机，请用反向代理区分路径（`/api` 转发后端，`/` 转发前端），或改端口。

### 3.8 进程管理建议

生产建议用 `pm2` 或 systemd 托管 `node dist/main.js` 与 `next start`；或用方式 A 的容器化。

---

## 4. 环境变量配置

关键变量（完整见 `.env.example` / `docker/.env.prod.example`）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PINE_EDITION` | 否 | `community`（默认）\| `enterprise` |
| `DATABASE_URL` | 是 | PG 连接（migrate 用 admin；运行时可用 `pinecone_app`） |
| `APP_DB_PASSWORD` | 是 | `pinecone_app`（DML）用户密码 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 是 | ≥32 字符随机，过弱后端拒绝启动 |
| `FIELD_ENCRYPTION_SECRET` | 建议 | 可逆密文（SSO/webhook secret）独立 AES-256-GCM 密钥 |
| `REDIS_URL` | 是 | `redis://host:6379` |
| `FRONTEND_URL` | 生产是 | 真实前端源（CORS + WS 白名单） |
| `API_URL` / `WS_URL` | 生产是 | 公网 API / WS 基址 |
| `COOKIE_SECURE` | 生产 | HTTPS 反代时 `true` |
| `REGISTRATION_MODE` | 生产 | `open` \| `whitelist` \| `invite`（未设默认 fail-closed=whitelist） |
| `REGISTRATION_ADMIN_EMAILS` | 生产 | 逗号分隔管理员邮箱 |
| `EMAIL_*` | 否 | SMTP（密码重置 / to-do 通知） |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 否 | BYO LLM（OpenAI 兼容） |
| `KB_COLLAB_PORT` | 否 | 知识库协同 WS 端口（默认 3002） |

---

## 5. 数据库初始化

- **建表统一走 `prisma migrate deploy`**（2026-08-21 起废弃 init 快照建表）。新库流程：postgres 健康 → 用 `pinecone_admin` 执行 `prisma migrate deploy` → 应用启动。
- **迁移链已修复**：空库 `migrate deploy` 全绿（64 表 = 64 模型），重跑为 no-op。
- 备份位于 `backups/`（历史快照，非必需）。

---

## 6. HTTPS 与反向代理

生产**必须启用 TLS**。推荐在 backend(3000)/frontend(3000 或 6173) 前置 LB/反代（Nginx/Caddy/Traefik/云 LB），于 443 用正规证书终止 HTTPS，内网明文转发到后端。后端已就绪：`TRUST_PROXY` 读取、`COOKIE_SECURE` 随 `x-forwarded-proto: https` 自动生效。

**三处必须一致**：
1. 前端 `NEXT_PUBLIC_API_URL=https://<域名>/api`（构建时内联，改域名需重新 build 前端）
2. 后端 `COOKIE_SECURE=true`
3. `SSO_REDIRECT_BASE_URL` 等回调用 https 域名

后端原生 HTTPS（无反代时）：设 `HTTPS_ENABLED=true` + 证书路径 + `COOKIE_SECURE=true`。

---

## 7. 验证与健康检查

```bash
# 后端健康检查
curl http://localhost:3000/api/health

# 前端可访问
curl -I http://localhost:6173/

# 关键旅程 E2E（可选，需独立 e2e 库）
DATABASE_URL=<e2e-db> REGISTRATION_MODE=open REGISTRATION_ADMIN_EMAILS=e2e-admin@test.local \
  node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand
```

登录后检查：能创建工作区、需求/功能/任务 CRUD、看板拖拽、工时记录。

---

## 8. 备份与回滚

- **数据备份**：`scripts/backup-db.js` 执行 pg_dump → AES-256-GCM 加密；恢复用 `scripts/decrypt-backup.js` + 备份密钥。建议异机存放、定期验证恢复。
- **迁移回滚**：Prisma 迁移按文件顺序应用；回滚需 `prisma migrate resolve` 或 `prisma migrate deploy` 到上一版本（生产前请在 staging 演练）。
- **镜像回滚**：发布用不可变 tag（`BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG`）；回滚 = load 上一版 tar 或重新 build 旧 commit，禁止以 `:latest` 作为回滚凭据。

---

## 9. 故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 后端启动即退出，报 secret 过短 | `JWT_*` 不足 32 字符 | 替换为 ≥32 字符随机值 |
| 登录后接口 403（企业功能） | `PINE_EDITION=community` | 社区版本就隐藏企业功能，属正常 |
| 注册提示受限 | `REGISTRATION_MODE` 未设为 `open` | 设为 `open` 或加白名单/邀请码 |
| WebSocket 连不上 | `WS_URL` 与前端不符 / 未走 https | 检查 `NEXT_PUBLIC_WS_URL` 与反代 |
| 附件无法访问 | 反代误配 `location /uploads` 直出卷 | 严禁直出卷，走 `/api/.../download` 鉴权 |
| 前端改域名不生效 | `NEXT_PUBLIC_*` 需重新 build | 改 env 后重新 `pnpm --filter frontend build` |

详细生产部署检查项见 [deploy-checklist-prod](./deploy-checklist-prod-2026-08-08.md)。
