# Pinecone · 企业需求管理平台

> 中文版 README。英文主版请见 [README.md](./README.md)。

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.2.0-green.svg)]()
[![CI](https://img.shields.io/badge/CI-passing-brightgreen.svg)]()

Pinecone 是一个面向企业的需求管理平台，覆盖**需求、特性、任务、支持单**的全生命周期管理，并延伸出完整的**产品发现层（客户反馈门户 / 投票 / 主题聚合 / 优先级评分 RICE·ICE）、测试闭环（用例 / 执行 / 计划 / CI 集成 / 手动走查）、开放平台（Webhook / CSV 导入 / 通用 CI 回写）、企业集成（SSO OIDC·SAML + SCIM 预配）、治理安全（审计 / 加密备份 / 回收站）与智能化体验（AI 摘要 / PWA / 甘特 / 公开路线图叙事）**。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构](#架构)
- [快速开始](#快速开始)
  - [Docker 全栈部署（推荐）](#1-docker-全栈部署推荐)
  - [离线 tar 包分发](#2-离线-tar-包分发)
  - [本地开发（无 Docker）](#3-本地开发无-docker)
- [环境变量](#环境变量)
- [目录结构](#目录结构)
- [常用命令](#常用命令)
- [测试与 CI](#测试与-ci)
- [文档索引](#文档索引)
- [许可证](#许可证)

---

## 功能特性

### 核心实体与协作
- **四类实体全生命周期**：Idea（需求）/ Feature（特性）/ Story（任务）/ Support（支持单），CRUD、状态流转、看板拖拽、克隆与 promote 关联。
- **Release 发布周期管理**：按发布批次组织需求与任务，甘特视图（列表 ⇄ 甘特图切换）。
- **评论 / 工时 / 附件**：实体评论、TimeEntry 工时、MIME 白名单上传。
- **知识库**：空间 / 页面 / 模板 / 页面移动 / 导出 Markdown，富文本（含任务列表、表格）。
- **工作区成员与角色**：ADMIN / MEMBER / VIEWER，由 `WorkspaceRoleGuard` 守卫。
- **实时协作**：Socket.IO WebSocket 实时更新 · **国际化**：中文 / English（next-intl）。

### 产品发现层
- **客户反馈门户**：免登录公开页（`/feedback/:token`），外部客户直接提交反馈并投票；令牌限速 + 可选邮箱校验，提交标记 `portal` 便于审核。
- **投票**：Idea / Support / Feature 计票，内部登录用户与门户客户双通道，唯一约束防重复刷票。
- **主题聚合**：把多条反馈归并成主题、聚合票数总量，一键「提升为特性」创建 Feature 并写关联。
- **优先级评分（RICE / ICE / CUSTOM）**：工作区级可配置加权；**RICE 的 Reach 默认自动取该条反馈的投票数**，让"民主"直接驱动排序；未填评分时回退手动优先级。

### 测试闭环
- **TestCase / TestRun**：用例管理（步骤 JSON / 优先级 / 类型）、执行标记（PASS/FAIL/BLOCKED）、重跑覆盖。
- **失败一键建缺陷**：失败执行直接转 `Support[type=DEFECT]` 并回链（带 `severity` 严重度 + `rootCause` 根因）。
- **TestPlan + 用例库**：回归 / 验收 / 专项计划批次，批量拉入用例，通过率进度汇总；用例库支持**跨发布周期模板**。
- **手动走查页**：从计划派生走查批次，逐条用例连续走查（步骤 / 预期 → PASS/FAIL/BLOCKED + 备注 → 一键建缺陷 → 上一例/下一例 + 进度条）。
- **测试自动化集成**：导入 CI 的 JUnit XML 结果 → 自动匹配 / 创建用例 → 自动建执行记录 → 报告。
- **缺陷修复任务**：从 `Support[type=DEFECT]` 克隆的任务自动标记为 `Story[kind=DEFECT]`（红色「缺陷」徽标），技术债类任务标 `CHORE`（灰色「技术债」徽标）。

### 开放平台
- **Webhook**：端点管理与事件订阅（outbox 事务投递 + HMAC 签名 + 防重放 + 内置自动投递循环 + 投递历史 / 手动重发）。
- **通用 CI 结果回写**：`POST /ci/results` 双通道认证（HMAC 签名 / API Token），接收 JUnit 结果写 TestRun；支持 **GitHub / GitLab / Gitee** 入站事件（commit/PR 关联实体）。
- **CSV 导入**：RFC4180 解析 + 注入清洗 + 值映射 + 引用解析 + 行级错误报告。

### 企业集成与治理
- **SSO 双协议**：**OIDC**（授权码 + PKCE + 域名白名单 JIT 建号）· **SAML 2.0**（SP 发起 + ACS 断言验证 + SP 元数据导出），兼容 Entra ID / ADFS / Okta / Ping 等。
- **SCIM 2.0 用户与组预配**：IdP 自动同步用户/组，**组名→角色映射**（RBAC 落地），Bearer Token 鉴权。
- **审计管理面**：平台级系统管理员（`isSystemAdmin`）+ 设置页「系统管理」页签操作审计查询与 CSV 导出。
- **加密备份**：pg_dump → AES-256-GCM 加密 + 保留策略 + 解密工具。
- **软删除 + 回收站**：核心实体软删可恢复。
- **认证**：注册开放控制（open / whitelist / invite）、scrypt 密码哈希、JWT 双 Cookie、密码找回（SMTP）。

### 开源内核与版本（Open Core & Editions）

Pinecone 采用 **Open Core** 模式：本公开仓库包含**社区版**（全部核心实体、产品发现、测试闭环、CSV 导入、协作能力，以及企业功能的*开关*）。高级治理与企业集成能力通过 **Pinecone Enterprise**（闭源叠加层，单独授权）交付。

| 能力 | 社区版 | 企业版 |
|---|:---:|:---:|
| Idea / Feature / Story / Support / Release / Test / 工时 | ✅ | ✅ |
| 产品发现（投票、主题、反馈门户、RICE/ICE 评分） | ✅ | ✅ |
| CSV 导入导出（CSV / XLSX / PDF） | ✅ | ✅ |
| 知识库（Tiptap 协作） | ✅ | ✅ |
| API（JWT + API Token 作用域、webhook outbox） | ✅ | ✅ |
| SSO（OIDC / SAML 2.0） | — | ✅ |
| SCIM 2.0 预配 | — | ✅ |
| 平台审计日志与管理面 | — | ✅ |
| 加密备份（AES-256-GCM）与回收站 | — | ✅ |
| CI 结果回写（GitHub / GitLab / Gitee） | — | ✅ |
| 自动化规则引擎 | ✅（引擎） | ✅（规则管理 UI） |
| AI 摘要（BYO 端点） | ✅ | ✅ |
| License 管理与实例遥测 | — | ✅ |

> 社区版以 `PINE_EDITION=community`（默认）运行：企业端点返回 `403`，企业 UI 面展示升级卡片。完整企业功能概览见 [`docs/enterprise.md`](docs/enterprise.md)。

### 智能化与体验
- **AI 摘要**：BYO（自带 API Key，OpenAI 兼容端点，支持内网模型）生成工作区 / 发布概况，无 Key 自动模板降级。
- **PWA 离线**：Service Worker 预缓存 + 离线回退，可安装到桌面 / 手机。
- **可拖拽甘特**：发布计划视图内拖拽条形调整起止、拖边缘拉伸、拖菱形改里程碑日期。
- **公开发布分享（NARRATIVE）**：发布周期可生成分享令牌，对外展示**叙事化路线图**（按状态分组 + 里程碑 + 多发布聚合），支持品牌化标题/配色；投票人状态变更会收到站内/邮件通知。

---

## 技术栈

| 层 | 技术 |
|---|---|
| Monorepo | pnpm + Turborepo |
| 后端 | NestJS 11 · Prisma 7 · PostgreSQL 18 · Redis · Socket.IO · JWT 双 Cookie（scrypt 密码哈希） |
| 前端 | Next.js 16（App Router）· Tailwind CSS 4 · next-intl · TanStack React Query · Zustand · dnd-kit |
| 开放平台 | Webhook（HMAC + outbox + 内置投递循环）· CSV 解析 · SSO（OIDC PKCE + SAML 2.0）· SCIM 2.0 |
| 智能化 | OpenAI 兼容 LLM（BYO Key）· PWA（Service Worker）· SVG 甘特（零依赖） |
| 部署 | Docker Compose 全栈（postgres 18.4 + redis 7 + backend + frontend），支持离线 tar 分发 |

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                  Next.js 前端 (App Router)               │
│  (dashboard) 业务页面+概览 │ (auth) 登录注册 │ (kb) 知识库 │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP(S) / JSON (axios, Bearer JWT + httpOnly cookie)
┌────────────────────────▼────────────────────────────────┐
│                    NestJS 后端 (REST API)                │
│  Auth(+Mail) / Workspaces / Ideas / Supports / Features /│
│  Stories / Releases / TimeTracking / KnowledgeBase /     │
│  Dashboard / Comments / Activities / Relations / Uploads │
│  TestCases / TestPlans / TestAutomation / Webhooks /     │
│  Imports / Sso(SAML) / Scim / Audit / Trash / Ai /       │
│  FeedbackPortal / Votes / Themes / Scores / Ci           │
└────────────────────────┬────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────▼────────────────────────────────┐
│                 PostgreSQL 数据库 (Prisma Schema)        │
└─────────────────────────────────────────────────────────┘
```

- **认证模型**：JWT 认证（`JwtAuthGuard`）+ 工作区角色授权（`WorkspaceRoleGuard`，等级 `VIEWER < MEMBER < ADMIN`）。访问/刷新令牌通过 **httpOnly Cookie** 传输（XSS 安全）。
- **实时**：Socket.IO 网关已加固——JWT 校验 + active 复查 + 每用户连接上限 + 工作区成员 join 校验。
- **实体编号**：`{工作区SLUG大写}-{前缀}-{序号}`，前缀 `I`=需求、`F`=特性、`T`=任务、`S`=支持；基于 `entity_counters` 表的**原子 UPSERT** 生成，并发无竞态。
- **CI**：GitHub Actions（`.github/workflows/ci.yml`）依次执行 gitleaks → pnpm audit → 空库 `prisma migrate deploy` 回归门禁 → typecheck → unit → e2e 关键旅程 → 双端 build。

---

## 快速开始

### 1. Docker 全栈部署（推荐）

```bash
# 准备环境变量（参考 .env.example）
cp .env.example .env.prod
# 编辑 .env.prod，至少设置：
#   DB_PASSWORD / APP_DB_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# 构建并启动全栈（postgres + redis + backend + frontend）
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 查看状态（期望 4 个服务全部 Up，postgres/redis healthy）
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 后端健康检查
curl http://localhost:3000/api/health
```

- 前端：<http://localhost:6173>（可配置 `FRONTEND_PORT`）
- 后端 API：<http://localhost:3000/api>（可配置 `BACKEND_PORT`）
- ⚠️ 首次启动 postgres 容器执行 init 脚本（建库、建用户），表结构由 `prisma migrate deploy` 应用。

### HTTPS（企业部署必读）

生产环境应**始终启用 TLS**。两种方式：

**方式 A：Nginx 反向代理终结 TLS（推荐）**

前端/后端容器仍以 HTTP 服务，由 Nginx 对外提供 `https://`：

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

访问：前端 `https://pinecone.example.com/`，API `https://pinecone.example.com/api`。

**方式 B：后端原生 HTTPS（无反代时直连）**

```bash
HTTPS_ENABLED=true
HTTPS_CERT_PATH=/path/fullchain.pem
HTTPS_KEY_PATH=/path/privkey.pem
COOKIE_SECURE=true     # 必须与 https 同步开启
```

> **⚠️ 启用 HTTPS 后三处必须一致**：(1) 前端 `NEXT_PUBLIC_API_URL=https://<域名>/api`；(2) 后端 `COOKIE_SECURE=true`；(3) `SSO_REDIRECT_BASE_URL` 使用 https 域名。任一处不一致会导致登录/SSO/WebSocket 失败。

### 2. 离线 tar 包分发

客户环境无需源码，直接分发 `pinecone-release-*.zip` 单包：

```bash
unzip pinecone-release-1.0.0.zip
cd <包目录>
docker load < pinecone-backend.tar
docker load < pinecone-frontend.tar

cd config
cp .env.prod.example .env.prod
# 编辑 .env.prod：DB 密码、JWT secrets、FRONTEND_URL / API_URL / WS_URL、REGISTRATION_ADMIN_EMAILS

# 启动（不要加 --build，本包不含源码）
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 3. 本地开发（无 Docker）

要求：Node.js ≥ 22.12（含 corepack）、pnpm 11（锁 `pnpm@11.10.0`）、PostgreSQL 18、Redis 7。

```bash
# 启用并固定 pnpm 版本
corepack enable
corepack prepare pnpm@11.10.0 --activate

# 安装依赖（严格按 lockfile）
pnpm install --frozen-lockfile

# 配置环境变量（数据库 / JWT / Redis）
cp .env.example .env

# 启动前后端开发服务
pnpm dev
# backend:  http://localhost:3000  (NestJS watch)
# frontend: http://localhost:6173  (Next.js dev)
```

---

## 环境变量

关键变量（完整见 `.env.example` / `docker/.env.prod.example`）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `PINE_EDITION` | 否 | `community`（默认）\| `enterprise` —— 社区版隐藏企业功能 + API 403 |
| `DATABASE_URL` | 是 | PostgreSQL 连接（migrate 用 admin；运行时用 `pinecone_app`） |
| `APP_DB_PASSWORD` | 是 | 最小权限 `pinecone_app`（DML）用户密码 |
| `JWT_ACCESS_SECRET` | 是 | ≥32 字符随机；过弱后端拒绝启动 |
| `JWT_REFRESH_SECRET` | 是 | ≥32 字符随机 |
| `FIELD_ENCRYPTION_SECRET` | 建议 | 可逆密文（SSO clientSecret / webhook secret）独立 AES-256-GCM 密钥 |
| `REDIS_URL` | 是 | Redis 连接 |
| `FRONTEND_URL` | 生产是 | 真实前端源（CORS + WebSocket 白名单） |
| `API_URL` / `WS_URL` | 生产是 | 公网 API / WebSocket 基址 |
| `COOKIE_SECURE` | 生产 | HTTPS 反代时设 `true` |
| `REGISTRATION_MODE` | 生产 | `open` \| `whitelist` \| `invite`（未设默认 fail-closed=whitelist） |
| `REGISTRATION_ADMIN_EMAILS` | 生产 | 逗号分隔管理员邮箱（管理白名单/邀请码/用户） |
| `EMAIL_*` | 否 | SMTP（密码重置 / to-do 通知） |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 否 | BYO LLM（OpenAI 兼容） |

> 生成强密钥：`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## 目录结构

```
pinecone/
├── apps/
│   ├── backend/            # NestJS 11 API（Prisma + Socket.IO）
│   │   └── src/modules/    # auth / webhooks / imports / sso / audit /
│   │                       # trash / ai / test-automation / test-plans /
│   │                       # feedback-portal / votes / themes / scores / ci ...
│   └── frontend/           # Next.js 16（App Router + Tailwind 4）
│       └── src/app/        # 页面：实体管理 / 测试闭环 / 知识库 / 发布计划（含甘特）...
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   ├── .env.prod.example
│   └── postgres/           # init SQL（建角色/用户，不建表）
├── deliverables/           # 交付文档（用户手册 / SSO 指南 / 设计文档 / 部署 / 报告）
├── scripts/                # 工具脚本（备份 / 解密 / 验证）
├── docker-compose.prod.yml # 生产全栈
├── docker-compose.yml      # 本地开发基础设施（postgres + redis）
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 常用命令

```bash
# 根（turbo 编排）
pnpm dev          # 前后端 watch 启动
pnpm build        # 双端构建
pnpm lint         # 双端 lint
pnpm typecheck    # 双端类型检查（依赖 build）
pnpm clean        # 清理 dist/.next

# 后端（apps/backend）
pnpm --filter backend dev        # nest start --watch
pnpm --filter backend build      # nest build -> dist/
pnpm --filter backend lint
pnpm --filter backend typecheck  # tsc --noEmit
pnpm --filter backend test       # jest unit
pnpm --filter backend test:e2e   # jest e2e（关键旅程）
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy

# 前端（apps/frontend）
pnpm --filter frontend dev       # next dev（端口 6173）
pnpm --filter frontend build     # next build
pnpm --filter frontend lint
pnpm --filter frontend typecheck # tsc --noEmit
```

---

## 测试与 CI

- **单元测试**：Jest（`*.spec.ts`）。除 e2e 外覆盖率仍偏稀疏，欢迎贡献。
- **E2E（关键旅程）**：`apps/backend/test/key-journeys.e2e-spec.ts` 覆盖注册登录 / 工作区 / 4 实体 CRUD / reparent 防环 / 工时 / 审计，**10/10 全绿**。运行：
  ```bash
  DATABASE_URL=<e2e-db> REGISTRATION_MODE=open REGISTRATION_ADMIN_EMAILS=e2e-admin@test.local \
    node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand
  ```
  e2e 库建议每次重建（drop + create + `prisma migrate deploy`）。
- **CI 门禁**（`.github/workflows/ci.yml`）：gitleaks 密钥扫描 → `pnpm audit` → 空库 `prisma migrate deploy` 回归 → 前后端 typecheck → unit → e2e 关键旅程 → 双端 build。`.gitleaks.toml` 白名单防止测试 fixture 误报。

---

## 文档索引

| 文档 | 说明 |
|---|---|
| [用户手册（英文）](deliverables/user-manual-pinecone-1.0-EN.md) | End-user usage guide |
| [用户手册（中文）](deliverables/user-manual-pinecone-1.0-CN.md) | 功能使用说明 |
| [部署说明（英文）](deliverables/deployment-pinecone-EN.md) | Docker + 无 Docker 部署 |
| [部署说明（中文）](deliverables/deployment-pinecone-CN.md) | 部署说明（Docker / 无 Docker） |
| [企业 SSO 对接指南](deliverables/sso-enterprise-guide-1.0.0.md) | OIDC / SAML / SCIM IdP 配置速查 |

---

## 许可证

Pinecone 采用 **AGPL-3.0 社区版 + 商业授权** 双许可模式：

- **社区版**：源码仓库遵循 [GNU Affero General Public License v3.0](LICENSE)。您可以自由使用、修改与分发，但修改后对外提供网络服务时须开源对应修改（AGPL §13）。
- **商业授权**：面向企业客户镜像部署场景，可联系作者获取商业授权（不受 copyleft 限制，可闭源集成）。

Copyright © 2026 fanxs2026
