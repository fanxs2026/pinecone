# Pinecone 部署文档

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend    │────▶│  Backend    │────▶│  PostgreSQL  │
│  Next.js 16  │     │  NestJS 11  │     │  18.4        │
│  Port 5173   │     │  Port 3000  │     │  Port 5432   │
└─────────────┘     │  + WebSocket │     └─────────────┘
                    │  Socket.IO   │     ┌─────────────┐
                    └─────────────┘     │  Redis 7     │
                                        └─────────────┘
```

## Prerequisites

- Docker & Docker Compose (for production)
- Node.js 22+ (for local development)
- pnpm 9+ (for local development)
- PostgreSQL 18.4 (for local development without Docker)

## Quick Start (Production)

### 1. Configure environment

```bash
cp docker/.env.prod.example .env
# Edit .env with your passwords and secrets
```

### 2. Start all services

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### 3. Database schema

**Fresh deploy** — after the postgres container is healthy (it only creates
roles via `01-init.sh`; tables are NOT created by init since 2026-08-21), run
migrations with the DDL user `pinecone_admin` from your local machine or CI:

```bash
cd apps/backend
DATABASE_URL="postgresql://pinecone_admin:<password>@host:5432/pinecone" npx prisma migrate deploy
```

The backend container does **no DDL** at runtime (runtime image has no prisma CLI),
and the legacy `docker/postgres/init/02-schema.sql` snapshot was removed — it was
out of sync (missing 37 tables) and drifted from the migration chain.

**Upgrade an existing database** — run the same command above (use the DDL user
`pinecone_admin`).

### 4. Access the application

- Frontend: http://localhost:5173
- API: http://localhost:3000/api
- Swagger Docs: http://localhost:3000/api/docs

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start database

```bash
# Option A: Docker
docker compose up -d postgres redis

# Option B: Local PostgreSQL (if already running)
# Ensure PostgreSQL 18.4 is running on port 5432
```

### 3. Run migrations

```bash
pnpm --filter backend exec prisma migrate dev
```

### 4. Start dev servers

```bash
# Terminal 1: Backend
pnpm --filter backend dev

# Terminal 2: Frontend
pnpm --filter frontend dev
```

Backend runs on http://localhost:3000, frontend on http://localhost:5173.

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `PORT` | API port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pinecone_app:@localhost:5432/pinecone` |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | (required) |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |

### Frontend

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3000/api` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `http://localhost:3000/ws` |

## Project Structure

```
Pinecone/
├── apps/
│   ├── backend/          # NestJS 11 API
│   │   ├── prisma/       # Schema + migrations
│   │   └── src/
│   │       ├── modules/  # Feature modules
│   │       └── common/   # Shared guards, decorators
│   └── frontend/         # Next.js 16 app
│       └── src/
│           ├── app/      # Routes + pages
│           ├── components/ # UI + layout components
│           └── lib/      # API client, utilities
├── docker/               # Dockerfiles + config
└── docker-compose*.yml   # Compose files
```

## API Endpoints

| Prefix | Module | Description |
|---|---|---|
| `/api/auth` | Auth | Register, login, refresh, me |
| `/api/workspaces` | Workspaces | CRUD + member management |
| `/api/workspaces/:wsId/ideas` | Ideas | Requirement ideas CRUD |
| `/api/workspaces/:wsId/releases` | Releases | Release lifecycle management |
| `/api/workspaces/:wsId/features` | Features | Feature planning with sort |
| `/api/workspaces/:wsId/stories` | Stories | Story CRUD with workspace scope |
| `/api/workspaces/:wsId/workflows` | Workflows | Status workflow engine |
| `/api/workspaces/:wsId/time-entries` | Time Tracking | Time logging per story |
| `/ws` | Realtime | Socket.IO WebSocket for live updates |

## 结构一致性校验（三条链路必须收敛）

同一个产品有三条建库/发布路径，任何一条偏离 `apps/backend/prisma/schema.prisma`，运行期都会
表现成 `P2022 column ... does not exist` → 前端统一提示 internal server error，且报错点离
「建库」很远（2026-11-26 实测：便携版缺 `supports.due_date`，新建支持请求 500）。

| 链路 | 建库方式 | 校验命令 |
|---|---|---|
| 开发环境 | 本地 PG，手工补丁 | `node scripts/verify-db-schema.js` |
| Docker / CI | `prisma migrate deploy` | `node scripts/verify-migrate-fresh-db.js` |
| Windows 便携包 | `db/schema.sql` 快照 + 增量区 | `node scripts/verify-portable-fresh-db.js` |

前三者最终都会落到同一个比对器 `verify-db-schema.js`（表/列/类型/可空/索引/唯一/外键/枚举）。
文件级还有一道更快的门禁 `verify-portable-schema.js`，已接入 CI 与 `scripts/verify.bat`。

### 已部署实例怎么升级（不丢数据）

`db/schema.sql` 只对「全新库」生效。已经跑过 `setup-db.bat` 的实例，靠增量补丁追平：

```bash
node bin\patch-db.js --check    # 只探测缺什么，不改库
node bin\patch-db.js            # 按文件名顺序执行 db/patches/*.sql
# 然后重启后端服务
```

在仓库里可以直接用：`node scripts/apply-db-patches.js`（可加 `--url=` 指向任意库）。

### 打便携包的前置门禁

`pack-portable.js` 现在会在拷贝前做三件事，任何一条不过直接失败：

1. **产物新鲜度**：`dist/main.js` 必须晚于 `apps/backend/src`，`.next/BUILD_ID` 必须晚于
   `apps/frontend/src`，`src/generated` 必须晚于 `schema.prisma`；EE 版还会额外比对
   `--overlay` 里的企业模块。刻意打过期包时加 `--allow-stale`。
2. **结构一致性**：`verify-portable-schema.js`，防止 schema.sql 落后于迁移。
3. 前端产物必须用 `--build-frontend` 构建（清空 `NEXT_PUBLIC_*`，地址在运行期按访问域名推导）。

> `verify.bat` 的 frontend build 也已改为清空 `NEXT_PUBLIC_*`；此前它把
> `http://localhost:3000/api` 硬编码进产物，再用这份产物打包就会让客户机请求自己的 localhost。
