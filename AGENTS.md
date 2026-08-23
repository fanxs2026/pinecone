# Pinecone — AGENTS.md

Quickstart for OpenCode sessions. High-signal facts only.

## Repo structure

pnpm workspace monorepo with Turborepo. Two apps, no shared packages.

```
Pinecone/
├── apps/backend/     # NestJS 11 API + Prisma 7
├── apps/frontend/    # Next.js 16 App Router + Tailwind CSS 4
├── docker/           # Dockerfiles + postgres init SQL
├── docker-compose.yml      # dev: postgres + redis only
├── docker-compose.prod.yml # full stack: postgres + redis + backend + frontend
├── .env               # local dev secrets (gitignored)
├── .env.example       # template (committed)
├── tsconfig.base.json # shared TS config (apps override/extend)
├── turbo.json         # task pipeline
└── pnpm-workspace.yaml
```

- No `packages/` dir exists despite the workspace glob.
- Root `tsconfig.base.json` exists but neither app actually extends it — each app has its own standalone `tsconfig.json` with different settings.

## Commands

### Root (turbo orchestration)

| Command | What |
|---------|------|
| `pnpm dev` | Start both apps in watch mode |
| `pnpm build` | Build both apps |
| `pnpm lint` | Lint both apps |
| `pnpm typecheck` | Type-check both apps (`dependsOn: ["^build"]` — run `pnpm build` first) |
| `pnpm clean` | Remove dist/.next artifacts |

### Backend (`apps/backend/`)

| Command | What |
|---------|------|
| `pnpm --filter backend dev` | `nest start --watch` |
| `pnpm --filter backend build` | `nest build` to `dist/` |
| `pnpm --filter backend lint` | ESLint `src/**/*.ts test/**/*.ts` |
| `pnpm --filter backend typecheck` | `tsc --noEmit` |
| `pnpm --filter backend test` | Jest (unit tests, `*.spec.ts`) |
| `pnpm --filter backend test:e2e` | Jest e2e (`test/jest-e2e.json`, `*.e2e-spec.ts`) |
| `pnpm --filter backend exec prisma generate` | Regenerate Prisma client (output: `src/generated/`) |
| `pnpm --filter backend exec prisma migrate dev` | Run pending migrations |
| `pnpm --filter backend exec prisma db seed` | Seed via `tsx prisma/seed.ts` |

### Frontend (`apps/frontend/`)

| Command | What |
|---------|------|
| `pnpm --filter frontend dev` | `next dev` (port 5173) |
| `pnpm --filter frontend build` | `next build` |
| `pnpm --filter frontend lint` | `next lint` |
| `pnpm --filter frontend typecheck` | `tsc --noEmit` |

## Setup (local dev)

```bash
pnpm install
docker compose up -d postgres redis      # start infra
pnpm --filter backend exec prisma migrate dev  # apply migrations
pnpm --filter backend exec prisma db seed       # seed (currently no-op)
pnpm dev  # or filter-specific: pnpm --filter backend dev
```

Backend: `http://localhost:3000`, Swagger: `http://localhost:3000/api/docs`
Frontend: `http://localhost:5173`

**Env**: Root `.env` read by backend's `prisma.config.ts` (does `dotenv` from `../../.env`). Both dev servers read from root `.env`. Frontend uses `NEXT_PUBLIC_*` vars.

## Database

- PostgreSQL 18.4, Prisma 7 with `@prisma/adapter-pg` (PgAdapter)
- Two DB users: `pinecone_admin` (owns schema, DDL) and `pinecone_app` (DML, read/write)
- Prisma client generated to `apps/backend/src/generated/` (CJS module format)
- Prisma config file: `apps/backend/prisma.config.ts` overrides default schema path and datasource URLs
- Shadow database required for migrations (`SHADOW_DATABASE_URL`)
- Schema has `tags` (String[]) on Idea, Feature, Support models for keyword labels
- `Attachment` model for file uploads (polymorphic via entityType/entityId, category: FILE|SCREENSHOT)
- `TimeEntry` supports both story-bound and entity-bound entries (optional storyId + entityType/entityId)

## Backend architecture

- NestJS 11 with Express platform
- Global prefix: `/api` (set in `main.ts`)
- Global ValidationPipe: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- CORS: reads `FRONTEND_URL` env var (defaults to `http://localhost:5173`)
- Swagger docs at `/api/docs` with Bearer auth
- PrismaModule is `@Global()`, so every module gets PrismaService without re-importing
- Path aliases: `@/*` → `src/*`, `@generated/*` → `src/generated/*`
- Auth: JWT access (15m) + refresh (7d) tokens via Passport. Refresh tokens stored as bcrypt hash, rotated on every use.
- Entity code format: `{SLUG}-{PREFIX}-{SEQUENCE4}` — IDEA→I, FEATURE→F, SUPPORT→S. Uses scan+increment, retries on unique violation.
- Auth cookie for frontend middleware: `pinecone-auth` (just a marker; actual auth is Bearer header + zustand persist)

### API route pattern

All entity routes scoped under workspace:
```
/workspaces/:wsId/{ideas|releases|features|stories|supports|workflows|time-entries|comments|history|relations}
```

### Module list

Auth, Workspaces, Ideas, Releases, Features, Stories, Supports, Workflows, TimeTracking, Realtime (Socket.IO), Activities, Comments, Relations, Uploads.

### Guards (in `common/guards/`)

- `JwtAuthGuard` — requires valid JWT access token
- `WorkspaceRoleGuard` — checks workspace membership + role hierarchy (`VIEWER < MEMBER < ADMIN`)
- `OwnershipGuard` — checks entity ownership

### Decorators (in `common/decorators/`)

- `@CurrentUser()` — extracts user from request
- `@Roles('ADMIN')` — required role for WorkspaceRoleGuard

## Frontend architecture

- Next.js 16 App Router, TSX strict mode, `@/*` alias to `src/*`
- Tailwind CSS 4 with `@tailwindcss/postcss` (PostCSS plugin, not the classic Tailwind config)
  - **No `tailwind.config.*` file** — Tailwind v4 uses CSS-based config in `globals.css`
- Layout: `(auth)/` (login/register, public), `(dashboard)/` (protected by middleware)
- Auth middleware (`middleware.ts`): checks `pinecone-auth` cookie. Public: `/login`, `/register`. Protected: most app routes.
- State: Zustand (auth + workspace selection) persisted to localStorage. TanStack React Query (server data, staleTime: 60s, retry: 1).
- API client: Axios with auto-refresh token queue (deduplicates concurrent 401 retries).
- UI: shadcn-style components in `components/ui/` (button, card, input, avatar, badge, label, skeleton)
- Realtime: Socket.IO client (`hooks/use-realtime.ts`)
- DnD: `@dnd-kit` (sortable features/stories)
- Only built-in Next.js lint (`next lint`) — no ESLint config file found
- Tag auto-suggest: `GET /workspaces/:wsId/tags` returns all unique tags across Idea/Feature/Support
- File uploads stored on disk under `uploads/`, served statically at `/uploads/` via Express
- Log work (time entry) available on all entity detail pages via `LogWorkDialog` component

## Testing quirks

- **Zero test coverage currently** (all tests are effectively no-ops or nonexistent)
- Backend has Jest config (`*.spec.ts`) and e2e config (`*.e2e-spec.ts`) — both set `--passWithNoTests`
- Frontend has `vitest` in devDependencies but **no vitest config or test files**
- E2E test (`test/app.e2e-spec.ts`) requires running backend instance or mocking AppModule
- Snapshot workflows: none

## Docker

- Dev: `docker compose up -d postgres redis` — PostgreSQL on 5432, Redis on 6379
- Prod: `docker compose -f docker-compose.prod.yml up -d` — full stack
- Dockerfiles use Node 22 Alpine, multi-stage builds with corepack + pnpm
- Prod backend init SQL creates restricted `pinecone_app` user (MQL-only, no DDL)

## Known issues (from code analysis)

1. WebSocket (Socket.IO) has zero authentication — no guard on the gateway
2. Hardcoded DB password and JWT secrets in `.env` committed to git history
3. `WorkspacesController` has no auth guard — publicly accessible
4. Entity code generator uses scan+increment (not atomic counter) — race condition under concurrent requests
5. Prisma generates ESM-first client (via `moduleFormat: "cjs"`) but the adapter pattern may fail with certain TS targets
6. `RelationType` enum has `CLONED` but code generator only handles IDEA/FEATURE/SUPPORT — STORY and relations missing

## What NOT to do

- Do NOT add `@ts-ignore`, `@ts-expect-error`, or `as any` to suppress type errors
- Do NOT add new packages to the workspace glob without verifying `packages/` exists
- Do NOT edit generated code in `apps/backend/src/generated/` — always run `prisma generate`
- Do NOT commit `.env` or any real secrets
- Do NOT refactor while fixing bugs — fix minimally, stay within module boundaries
