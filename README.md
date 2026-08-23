# Pinecone · Enterprise Requirements Management Platform

> English is the primary language for this README. A Chinese version is available at [README.zh-CN.md](./README.zh-CN.md).

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.2.0-green.svg)]()
[![CI](https://img.shields.io/badge/CI-passing-brightgreen.svg)]()

Pinecone is an enterprise requirements management platform covering the full lifecycle of **Ideas, Features, Stories and Support tickets**, extended with a complete **product discovery layer (feedback portal / voting / theme aggregation / RICE·ICE priority scoring), a testing loop (cases / runs / plans / CI / manual walkthrough), an open platform (Webhooks / CSV import / generic CI ingestion), enterprise integration (SSO OIDC·SAML + SCIM provisioning), governance & security (audit / encrypted backup / recycle bin), and smart experience (AI summary / PWA / Gantt / public roadmap narrative)**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
  - [Docker Full-Stack (Recommended)](#1-docker-full-stack-recommended)
  - [Offline tar Distribution](#2-offline-tar-distribution)
  - [Local Development (No Docker)](#3-local-development-no-docker)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Testing & CI](#testing--ci)
- [Documentation](#documentation)
- [License](#license)

---

## Features

### Core Entities & Collaboration
- **Four-entity lifecycle**: Idea (requirement) / Feature / Story (task) / Support ticket — CRUD, status flow, kanban drag-and-drop, clone & promote relations.
- **Release management**: organize requirements and tasks by release cycle, with a switchable list ⇄ Gantt view.
- **Comments / Time tracking / Attachments**: entity comments, TimeEntry logging, MIME-whitelist uploads.
- **Knowledge Base**: spaces / pages / templates / page move / Markdown export, rich text (task lists, tables).
- **Workspace members & roles**: ADMIN / MEMBER / VIEWER, enforced by `WorkspaceRoleGuard`.
- **Realtime collaboration**: Socket.IO WebSocket live updates · **i18n**: 中文 / English (next-intl).

### Product Discovery
- **Feedback Portal**: a login-free public page (`/feedback/:token`) where external customers submit feedback and vote; token-based rate limiting + optional email verification; submissions are tagged `portal` for triage.
- **Voting**: count votes on Idea / Support / Feature, dual-channel (internal signed-in users + portal customers), unique constraint prevents ballot stuffing.
- **Theme aggregation**: merge multiple feedback items into a theme, aggregate total votes, one-click "promote to feature" creating a Feature with the relation written.
- **Priority scoring (RICE / ICE / CUSTOM)**: workspace-configurable weights; **RICE's Reach defaults to the item's vote count**, letting "democracy" directly drive ordering; falls back to manual priority when unset.

### Testing Loop
- **TestCase / TestRun**: case management (step JSON / priority / type), execution marking (PASS/FAIL/BLOCKED), rerun coverage.
- **One-click defect from failure**: a failed execution becomes `Support[type=DEFECT]` with a back-link (with `severity` + `rootCause`).
- **TestPlan + case library**: regression / acceptance / ad-hoc plan batches, bulk pull cases, pass-rate rollup; case library supports **cross-release templates**.
- **Manual walkthrough page**: derive a walkthrough batch from a plan, step through cases continuously (step / expected → PASS/FAIL/BLOCKED + note → one-click defect → prev/next + progress bar).
- **Test automation integration**: import CI JUnit XML results → auto-match / create cases → auto-create execution records → report.
- **Defect-fix tasks**: cloning a `Support[type=DEFECT]` auto-marks the new task as `Story[kind=DEFECT]` (red "defect" badge); tech-debt tasks marked `CHORE` (gray "tech-debt" badge).

### Open Platform
- **Webhook**: endpoint management & event subscription (transactional outbox delivery + HMAC signature + replay protection + built-in auto-delivery loop + delivery history / manual resend).
- **Generic CI result ingestion**: `POST /ci/results` dual-channel auth (HMAC signature / API Token), receives JUnit results and writes TestRun; supports **GitHub / GitLab / Gitee** inbound events (commit/PR ↔ entity linking).
- **CSV import**: RFC4180 parsing + injection sanitization + value mapping + reference resolution + per-row error report.

### Enterprise & Governance
- **SSO dual protocol**: **OIDC** (auth code + PKCE + domain whitelist JIT provisioning) · **SAML 2.0** (SP-initiated + ACS assertion verification + SP metadata export), compatible with Entra ID / ADFS / Okta / Ping, etc.
- **SCIM 2.0 user & group provisioning**: IdP auto-syncs users/groups, **group→role mapping** (RBAC, supports exact mapping), Bearer Token auth.
- **Audit admin surface**: platform-level system admin (`isSystemAdmin`) + settings "System Admin" tab for audit query and CSV export.
- **Encrypted backup**: pg_dump → AES-256-GCM encryption + retention policy + decrypt tool.
- **Soft delete + recycle bin**: core entities are soft-deleted and recoverable.
- **Auth**: registration access control (open / whitelist / invite), scrypt password hashing, JWT dual-cookie, password recovery (SMTP).

### Open Core & Editions

Pinecone follows an **Open Core** model: this public repository contains the **Community Edition** (all core entities, discovery, testing loop, CSV import, collaboration, and the enterprise feature *switches*). Advanced governance and enterprise-integration features are delivered as **Pinecone Enterprise** (closed-source overlay, licensed separately).

| Capability | Community | Enterprise |
|---|:---:|:---:|
| Idea / Feature / Story / Support / Release / Test / Hours | ✅ | ✅ |
| Product discovery (votes, themes, feedback portal, scoring RICE/ICE) | ✅ | ✅ |
| CSV import & export (CSV / XLSX / PDF) | ✅ | ✅ |
| Knowledge base (Tiptap collaboration) | ✅ | ✅ |
| API (JWT + API Token scopes, webhook outbox) | ✅ | ✅ |
| SSO (OIDC / SAML 2.0) | — | ✅ |
| SCIM 2.0 provisioning | — | ✅ |
| Platform audit log & admin surface | — | ✅ |
| Encrypted backup (AES-256-GCM) & recycle bin | — | ✅ |
| CI result ingestion (GitHub / GitLab / Gitee) | — | ✅ |
| Automation rules engine | ✅ (engine) | ✅ (rule management UI) |
| AI summary (BYO endpoint) | ✅ | ✅ |
| License management & instance telemetry | — | ✅ |

> Community deployments run with `PINE_EDITION=community` (default): enterprise endpoints return `403` and enterprise UI surfaces show an upgrade card. See [`docs/enterprise.md`](docs/enterprise.md) for the full Enterprise feature overview.

### Smart & UX
- **AI summary**: BYO (bring your own API key, OpenAI-compatible endpoint, supports on-prem models) generates workspace / release overviews; auto template fallback when no key.
- **PWA offline**: Service Worker precache + offline fallback, installable to desktop / phone.
- **Draggable Gantt**: drag bars in the release plan view to adjust start/end, drag edges to stretch, drag diamonds to change milestone dates.
- **Public roadmap sharing (NARRATIVE)**: a release cycle can generate a share token exposing a **narrative roadmap** (grouped by status + milestones + multi-release aggregation), with brandable title/color; voters receive in-app / email notifications on status changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm + Turborepo |
| Backend | NestJS 11 · Prisma 7 · PostgreSQL 18 · Redis · Socket.IO · JWT dual-cookie (scrypt password hashing) |
| Frontend | Next.js 16 (App Router) · Tailwind CSS 4 · next-intl · TanStack React Query · Zustand · dnd-kit |
| Open Platform | Webhook (HMAC + outbox + built-in delivery loop) · CSV parsing · SSO (OIDC PKCE + SAML 2.0) · SCIM 2.0 |
| Smart | OpenAI-compatible LLM (BYO key) · PWA (Service Worker) · SVG Gantt (zero-dependency) |
| Deployment | Docker Compose full-stack (postgres 18.4 + redis 7 + backend + frontend), offline tar distribution supported |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Next.js Frontend (App Router)            │
│  (dashboard) pages+overview │ (auth) login/register │ (kb) │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP(S) / JSON (axios, Bearer JWT + httpOnly cookie)
┌────────────────────────▼────────────────────────────────┐
│                    NestJS Backend (REST API)              │
│  Auth(+Mail) / Workspaces / Ideas / Supports / Features / │
│  Stories / Releases / TimeTracking / KnowledgeBase /      │
│  Dashboard / Comments / Activities / Relations / Uploads  │
│  TestCases / TestPlans / TestAutomation / Webhooks /      │
│  Imports / Sso(SAML) / Scim / Audit / Trash / Ai /        │
│  FeedbackPortal / Votes / Themes / Scores / Ci            │
└────────────────────────┬────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────▼────────────────────────────────┐
│               PostgreSQL Database (Prisma Schema)         │
└─────────────────────────────────────────────────────────┘
```

- **Auth model**: JWT authentication (`JwtAuthGuard`) + workspace role authorization (`WorkspaceRoleGuard`, role hierarchy `VIEWER < MEMBER < ADMIN`). Access/refresh tokens are transported via **httpOnly cookies** (XSS-safe).
- **Realtime**: Socket.IO gateway is hardened — JWT validation + active-user recheck + per-user connection cap + workspace-membership join check.
- **Entity code**: `{WORKSPACE_SLUG-upper}-{prefix}-{seq}`, prefix `I`=Idea, `F`=Feature, `T`=Story, `S`=Support; generated by an atomic UPSERT on an `entity_counters` table (no race under concurrency).
- **CI**: GitHub Actions (` .github/workflows/ci.yml`) runs gitleaks → pnpm audit → empty-DB `prisma migrate deploy` regression gate → typecheck → unit → e2e key journeys → dual build.

---

## Quick Start

### 1. Docker Full-Stack (Recommended)

```bash
# Prepare environment (reference .env.example)
cp .env.example .env.prod
# Edit .env.prod, at minimum set:
#   DB_PASSWORD / APP_DB_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# Build and start the full stack (postgres + redis + backend + frontend)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Check status (expect all 4 services Up, postgres/redis healthy)
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# Backend health check
curl http://localhost:3000/api/health
```

- Frontend: <http://localhost:6173> (`FRONTEND_PORT` configurable)
- Backend API: <http://localhost:3000/api> (`BACKEND_PORT` configurable)
- ⚠️ On first boot the postgres container runs the init script (creates DB, roles, users); schema is then applied by `prisma migrate deploy`.

### HTTPS (Enterprise Deployment Required)

Production should **always enable TLS**. Two approaches:

**Option A — Nginx reverse proxy terminates TLS (recommended, enterprise standard)**

Frontend/backend containers still serve HTTP; Nginx exposes `https://`:

```nginx
server {
    listen 443 ssl;
    server_name pinecone.example.com;
    ssl_certificate     /etc/letsencrypt/live/pinecone.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pinecone.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:6173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
server { listen 80; server_name pinecone.example.com; return 301 https://$host$request_uri; }
```

Access: frontend `https://pinecone.example.com/`, API `https://pinecone.example.com/api`.

**Option B — Backend native HTTPS (direct connect without a proxy)**

```bash
HTTPS_ENABLED=true
HTTPS_CERT_PATH=/path/fullchain.pem
HTTPS_KEY_PATH=/path/privkey.pem
COOKIE_SECURE=true     # must match https
```

> **⚠️ When enabling HTTPS, three settings must agree**: (1) frontend `NEXT_PUBLIC_API_URL=https://<domain>/api`; (2) backend `COOKIE_SECURE=true`; (3) `SSO_REDIRECT_BASE_URL` uses the https domain. Any mismatch breaks login/SSO/WebSocket.

### 2. Offline tar Distribution

For customer environments without source access, distribute the single `pinecone-release-*.zip` package:

```bash
unzip pinecone-release-1.0.0.zip
cd <package dir>
docker load < pinecone-backend.tar
docker load < pinecone-frontend.tar

cd config
cp .env.prod.example .env.prod
# Edit .env.prod: DB passwords, JWT secrets, FRONTEND_URL / API_URL / WS_URL, REGISTRATION_ADMIN_EMAILS

# Start (do NOT add --build; the package has no source)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 3. Local Development (No Docker)

Requirements: Node.js ≥ 22.12 (with corepack), pnpm 11 (pinned `pnpm@11.10.0`), PostgreSQL 18, Redis 7.

```bash
# Enable and pin pnpm
corepack enable
corepack prepare pnpm@11.10.0 --activate

# Install dependencies (strict, from lockfile)
pnpm install --frozen-lockfile

# Configure environment (database / JWT / Redis)
cp .env.example .env

# Start dev servers
pnpm dev
# backend:  http://localhost:3000  (NestJS watch)
# frontend: http://localhost:6173  (Next.js dev)
```

> ⚠️ For local dev with HTTPS enabled, the frontend must also align `NEXT_PUBLIC_API_URL` and start with `--experimental-https`; the three protocol settings must agree.

---

## Environment Variables

Key variables (full list in `.env.example` / `docker/.env.prod.example`):

| Variable | Required | Purpose |
|---|---|---|
| `PINE_EDITION` | no | `community` (default) \| `enterprise` — enterprise features hidden + 403 at API when community |
| `DATABASE_URL` | yes | PostgreSQL connection (admin user for migrate; `pinecone_app` for runtime) |
| `APP_DB_PASSWORD` | yes | Password for the minimal-privilege `pinecone_app` (DML) user |
| `JWT_ACCESS_SECRET` | yes | ≥32-char random; backend refuses to start if weak |
| `JWT_REFRESH_SECRET` | yes | ≥32-char random |
| `FIELD_ENCRYPTION_SECRET` | recommended | Separate AES-256-GCM key for reversible secrets (SSO clientSecret / webhook secret) |
| `REDIS_URL` | yes | Redis connection |
| `FRONTEND_URL` | yes (prod) | Real frontend origin (CORS + WebSocket allowlist) |
| `API_URL` / `WS_URL` | yes (prod) | Public API / WebSocket base URLs |
| `COOKIE_SECURE` | prod | `true` when behind HTTPS reverse proxy |
| `REGISTRATION_MODE` | prod | `open` \| `whitelist` \| `invite` (fail-closed to `whitelist` if unset) |
| `REGISTRATION_ADMIN_EMAILS` | prod | Comma-separated admin emails (manages whitelist / invites / users) |
| `EMAIL_*` | no | SMTP for password reset / to-do notifications |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | no | BYO LLM for AI summary (OpenAI-compatible) |

> Generate strong secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## Project Structure

```
pinecone/
├── apps/
│   ├── backend/            # NestJS 11 API (Prisma + Socket.IO)
│   │   └── src/modules/    # auth / webhooks / imports / sso / audit /
│   │                       # trash / ai / test-automation / test-plans /
│   │                       # feedback-portal / votes / themes / scores / ci ...
│   └── frontend/           # Next.js 16 (App Router + Tailwind 4)
│       └── src/app/        # pages: entity mgmt / testing loop / KB / releases (Gantt) ...
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   ├── .env.prod.example
│   └── postgres/           # init SQL (creates roles/users, not tables)
├── deliverables/           # docs (user manual / SSO guide / design docs / deploy / reports)
├── scripts/                # utilities (backup / decrypt / verify)
├── docker-compose.prod.yml # production full-stack
├── docker-compose.yml      # local dev infra (postgres + redis)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Scripts

```bash
# Root (turbo orchestration)
pnpm dev          # start both apps in watch mode
pnpm build        # build both apps
pnpm lint         # lint both apps
pnpm typecheck    # type-check both apps (dependsOn build)
pnpm clean        # remove dist/.next artifacts

# Backend (apps/backend)
pnpm --filter backend dev        # nest start --watch
pnpm --filter backend build      # nest build -> dist/
pnpm --filter backend lint
pnpm --filter backend typecheck  # tsc --noEmit
pnpm --filter backend test       # jest unit
pnpm --filter backend test:e2e   # jest e2e (key journeys)
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy

# Frontend (apps/frontend)
pnpm --filter frontend dev       # next dev (port 6173)
pnpm --filter frontend build     # next build
pnpm --filter frontend lint
pnpm --filter frontend typecheck # tsc --noEmit
```

---

## Testing & CI

- **Unit tests**: Jest (`*.spec.ts`). Coverage is still sparse outside the e2e suite — contributions welcome.
- **E2E (key journeys)**: `apps/backend/test/key-journeys.e2e-spec.ts` covers register/login, workspace, 4-entity CRUD, reparent cycle prevention, time tracking, and audit — **10/10 passing**. Run with:
  ```bash
  DATABASE_URL=<e2e-db> REGISTRATION_MODE=open REGISTRATION_ADMIN_EMAILS=e2e-admin@test.local \
    node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand
  ```
  The e2e database should be recreated each run (drop + create + `prisma migrate deploy`).
- **CI gate** (`.github/workflows/ci.yml`): gitleaks secret scan → `pnpm audit` → empty-DB `prisma migrate deploy` regression → frontend/backend typecheck → unit → e2e key journeys → dual build. A `.gitleaks.toml` allowlist prevents false positives from test fixtures.

---

## Documentation

| Document | Description |
|---|---|
| [User Manual (EN)](deliverables/user-manual-pinecone-1.0-EN.md) | End-user usage guide |
| [User Manual (CN)](deliverables/user-manual-pinecone-1.0-CN.md) | 用户操作手册（中文） |
| [Deployment Guide (EN)](deliverables/deployment-pinecone-EN.md) | Docker + no-Docker deployment |
| [Deployment Guide (CN)](deliverables/deployment-pinecone-CN.md) | 部署说明（Docker / 无 Docker） |
| [Enterprise SSO Guide](deliverables/sso-enterprise-guide-1.0.0.md) | OIDC / SAML / SCIM IdP config cheat-sheet |

---

## License

Pinecone uses a **dual license: AGPL-3.0 (community) + commercial license**:

- **Community**: the source repository is licensed under the [GNU Affero General Public License v3.0](LICENSE). You may freely use, modify, and redistribute it, but if you modify it and offer it as a network service to others, you must release the corresponding modifications (AGPL §13).
- **Commercial**: for enterprise mirror-deployment scenarios, contact the author for a commercial license (not bound by copyleft, allows closed-source integration).

Copyright © 2026 fanxs2026
