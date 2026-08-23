# Pinecone Deployment Guide (English)

> Date: 2026-08-21 ｜ Version: Pinecone 2.2.0  
> Covers two deployment options: **Docker full-stack (recommended)** and **No-Docker (source + Node/PostgreSQL/Redis native)**. Self-signed certificates are out of scope—production should use a proper TLS cert provided by the deployer.

---

## Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Option A: Docker Full-Stack (Recommended)](#2-option-a-docker-full-stack-recommended)
- [3. Option B: No-Docker Native Deployment](#3-option-b-no-docker-native-deployment)
- [4. Environment Variables](#4-environment-variables)
- [5. Database Initialization](#5-database-initialization)
- [6. HTTPS & Reverse Proxy](#6-https--reverse-proxy)
- [7. Verification & Health Checks](#7-verification--health-checks)
- [8. Backup & Rollback](#8-backup--rollback)
- [9. Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

| Component | Requirement |
| --- | --- |
| Docker / Docker Compose | Recent (Docker 24+ recommended) |
| Node.js (no-Docker only) | ≥ 22.12 (with corepack) |
| pnpm (no-Docker only) | 11 (pinned `pnpm@11.10.0`) |
| PostgreSQL (no-Docker only) | 18 |
| Redis (no-Docker only) | 7 |
| OS | Linux / macOS / Windows (WSL2 recommended) |

In **all** cases, replace secrets with strong random values:

```bash
# JWT secrets (≥32 chars)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# DB app-user password (≥16 chars)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## 2. Option A: Docker Full-Stack (Recommended)

All services (postgres + redis + backend + frontend) are orchestrated by `docker-compose.prod.yml`—suitable for most production scenarios.

### 2.1 Prepare environment

```bash
cd <project root>
cp docker/.env.prod.example .env.prod
# Edit .env.prod, at minimum set:
#   DB_PASSWORD / APP_DB_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   FRONTEND_URL / API_URL / WS_URL / REGISTRATION_MODE / REGISTRATION_ADMIN_EMAILS
```

> See [Section 4](#4-environment-variables) and `docker/.env.prod.example` comments for the full list.

### 2.2 Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

On first boot the postgres container runs `docker/postgres/init-v2/01-init.sh` to create the `pinecone_admin` (DDL) and `pinecone_app` (DML) roles. **Schema is applied by the backend's `prisma migrate deploy` after the DB is healthy** (compose healthcheck depends on postgres; the backend creates tables on start).

### 2.3 Check status

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
# Expect: postgres/redis healthy, backend/frontend Up
```

- Frontend: <http://localhost:6173> (or `FRONTEND_PORT`)
- Backend API: <http://localhost:3000/api> (or `BACKEND_PORT`)
- KB collab WS: <http://localhost:3002> (or `KB_COLLAB_PORT`)

### 2.4 Offline tar distribution (no-source environments)

For customer environments without source, distribute `pinecone-release-*.zip`:

```bash
unzip pinecone-release-1.0.0.zip
cd <package dir>
docker load < pinecone-backend.tar
docker load < pinecone-frontend.tar
cd config && cp .env.prod.example .env.prod   # then edit
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d   # NOTE: no --build
```

> ⚠️ The offline package has no source; **do not add `--build`**, or compose will try to rebuild from the directory and fail. postgres/redis are pulled automatically when online.

---

## 3. Option B: No-Docker Native Deployment

For environments with existing PostgreSQL/Redis where you want to run the frontend/backend directly with Node.

### 3.1 Infrastructure (pick one)

- **Use the repo's dev compose for PG/Redis only**:
  ```bash
  docker compose up -d postgres redis
  ```
- Or reuse your existing PostgreSQL 18 + Redis 7 instances.

### 3.2 Create database roles

The no-Docker path does not auto-run the init script, so create the two roles manually (consistent with `docker/postgres/init-v2/01-init.sh`):

```sql
-- run as superuser
CREATE ROLE pinecone_admin LOGIN PASSWORD '<DB_PASSWORD>' CREATEDB;
CREATE ROLE pinecone_app  LOGIN PASSWORD '<APP_DB_PASSWORD>';
CREATE DATABASE pinecone OWNER pinecone_admin;
-- grant DML to pinecone_app after migrate deploy (handled by init script normally)
```

> `pinecone_admin` is for migrations (DDL); `pinecone_app` is for runtime (DML only, least privilege).

### 3.3 Install dependencies

```bash
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm install --frozen-lockfile
```

### 3.4 Configure environment

```bash
cp .env.example .env
# Edit .env: DATABASE_URL (pinecone_admin) / APP_DB_PASSWORD / JWT_* / REDIS_URL /
#            FRONTEND_URL / NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
```

> If you want the backend to connect as `pinecone_app` at runtime, change `DATABASE_URL` to `pinecone_app@...` (admin is still recommended for the migrate step).

### 3.5 Database migration

```bash
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
```

### 3.6 Build and run backend

```bash
pnpm --filter backend build          # nest build -> apps/backend/dist
NODE_ENV=production node apps/backend/dist/main.js
# or: pnpm --filter backend start
```

### 3.7 Build and run frontend

```bash
# NEXT_PUBLIC_* are inlined at build time—set before build
export NEXT_PUBLIC_API_URL=http://localhost:3000/api
export NEXT_PUBLIC_WS_URL=http://localhost:3000/ws
pnpm --filter frontend build
NODE_ENV=production pnpm --filter frontend start   # defaults to port 3000; use -p 6173
```

> `next start` defaults to port 3000; if colocated with the backend, use a reverse proxy to split paths (`/api` → backend, `/` → frontend), or change the port.

### 3.8 Process management

In production, manage `node dist/main.js` and `next start` with `pm2` or systemd; or use the containerized Option A.

---

## 4. Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PINE_EDITION` | no | `community` (default) \| `enterprise` |
| `DATABASE_URL` | yes | PG connection (admin for migrate; `pinecone_app` for runtime) |
| `APP_DB_PASSWORD` | yes | `pinecone_app` (DML) password |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | ≥32-char random; weak value refuses to boot |
| `FIELD_ENCRYPTION_SECRET` | recommended | Separate AES-256-GCM key for reversible secrets (SSO/webhook) |
| `REDIS_URL` | yes | `redis://host:6379` |
| `FRONTEND_URL` | prod | Real frontend origin (CORS + WS allowlist) |
| `API_URL` / `WS_URL` | prod | Public API / WS base URLs |
| `COOKIE_SECURE` | prod | `true` behind HTTPS reverse proxy |
| `REGISTRATION_MODE` | prod | `open` \| `whitelist` \| `invite` (unset defaults fail-closed=whitelist) |
| `REGISTRATION_ADMIN_EMAILS` | prod | Comma-separated admin emails |
| `EMAIL_*` | no | SMTP (password reset / to-do notifications) |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | no | BYO LLM (OpenAI-compatible) |
| `KB_COLLAB_PORT` | no | KB collab WS port (default 3002) |

---

## 5. Database Initialization

- **Schema is applied uniformly via `prisma migrate deploy`** (init-snapshot table creation was deprecated on 2026-08-21). New-DB flow: postgres healthy → run `prisma migrate deploy` as `pinecone_admin` → app starts.
- **Migration chain is fixed**: empty-DB `migrate deploy` is all-green (64 tables = 64 models), re-run is no-op.
- Backups live in `backups/` (historical snapshots, not required).

---

## 6. HTTPS & Reverse Proxy

Production **must enable TLS**. Recommended: place an LB/reverse proxy (Nginx/Caddy/Traefik/cloud LB) in front of backend(3000)/frontend(3000 or 6173), terminate HTTPS at 443 with a proper cert, and forward plaintext internally. The backend is ready: `TRUST_PROXY` is read, and `COOKIE_SECURE` auto-engages with `x-forwarded-proto: https`.

**Three settings must agree**:
1. Frontend `NEXT_PUBLIC_API_URL=https://<domain>/api` (inlined at build; changing domain requires rebuilding the frontend)
2. Backend `COOKIE_SECURE=true`
3. `SSO_REDIRECT_BASE_URL` etc. use the https domain

Backend native HTTPS (no proxy): set `HTTPS_ENABLED=true` + cert paths + `COOKIE_SECURE=true`.

---

## 7. Verification & Health Checks

```bash
# Backend health
curl http://localhost:3000/api/health

# Frontend reachable
curl -I http://localhost:6173/

# Key-journey E2E (optional, needs a separate e2e DB)
DATABASE_URL=<e2e-db> REGISTRATION_MODE=open REGISTRATION_ADMIN_EMAILS=e2e-admin@test.local \
  node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand
```

After login, verify: create workspace, Idea/Feature/Story CRUD, kanban drag, time logging.

---

## 8. Backup & Rollback

- **Data backup**: `scripts/backup-db.js` runs pg_dump → AES-256-GCM encryption; restore with `scripts/decrypt-backup.js` + backup key. Store off-site and verify recovery periodically.
- **Migration rollback**: Prisma applies migrations in file order; rollback via `prisma migrate resolve` or `prisma migrate deploy` to a prior version (practice on staging first).
- **Image rollback**: releases use immutable tags (`BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG`); rollback = load previous tar or rebuild old commit. Never use `:latest` as a rollback anchor.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Backend exits immediately, secret too short | `JWT_*` < 32 chars | Replace with ≥32-char random |
| 403 on enterprise features after login | `PINE_EDITION=community` | Expected—community hides enterprise features |
| "Registration restricted" | `REGISTRATION_MODE` not `open` | Set `open` or add whitelist/invite code |
| WebSocket won't connect | `WS_URL` mismatch / not https | Check `NEXT_PUBLIC_WS_URL` and proxy |
| Attachments inaccessible | Proxy misconfigures `location /uploads` to serve volume | Never serve the volume directly; use `/api/.../download` auth |
| Frontend domain change not applied | `NEXT_PUBLIC_*` needs rebuild | Re-run `pnpm --filter frontend build` after env change |

For detailed production checklists, see [deploy-checklist-prod](./deploy-checklist-prod-2026-08-08.md).
