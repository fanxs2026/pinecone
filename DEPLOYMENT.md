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
