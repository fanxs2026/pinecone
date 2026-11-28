# Pinecone 部署文档

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend    │────▶│  Backend    │────▶│  PostgreSQL  │
│  Next.js 16  │     │  NestJS 11  │     │  18.4        │
│  Port 6173   │     │  Port 3000  │     │  Port 5432   │
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

- Frontend: https://localhost:6173
- API: http://localhost:3000/api
- Swagger Docs: http://localhost:3000/api/docs

## TLS / HTTPS（生产必备）

### 推荐拓扑：单域名 + 反代路径分流

```
https://pm.example.com/         → 前端 Next.js (:6173)
https://pm.example.com/api/     → 后端 NestJS (:3000)
https://pm.example.com/uploads/ → 后端静态资源
https://pm.example.com/ws       → Socket.IO
```

TLS 在反代（Nginx / Caddy / 云负载均衡）终结，应用层保持 HTTP：

| 变量 | 值 | 说明 |
|---|---|---|
| `HTTPS_ENABLED` | `false` | 反代后面跑 HTTP |
| `TRUST_PROXY` | `1` | 读 `X-Forwarded-Proto` 还原原始协议 |
| `COOKIE_SECURE` | `true` | 公网必须；cookie 仅在 https 下发送 |
| `FRONTEND_URL` / `API_URL` / `WS_URL` | `https://pm.example.com` | 同域时前端可用相对路径 `/api` |

**为什么坚持单域名**：前端与 API 同源 → 只需一张证书、无需 CORS 白名单、`SameSite` / `Secure`
cookie 不跨源，直接消掉一整类「页面能开、接口请求被拦」的故障。

### 证书部署检查清单

| # | 检查项 | 合格标准 | 常见错法 |
|---|---|---|---|
| 1 | 签发方 | 公共 CA（Let's Encrypt / DigiCert / 云厂商 DV） | 用自签证书却不给客户端导入根证书 |
| 2 | 域名匹配 | 证书 SAN 含用户地址栏的**确切域名** | 证书签给域名，用户却用 IP 访问（公共 CA 不签内网 IP） |
| 3 | 证书链完整 | 部署 **fullchain**（站点证书 + 中间证书） | 只传站点证书 → 桌面正常、Android / 部分客户端报错 |
| 4 | 有效期与续期 | Let's Encrypt 90 天，自动续期 + 到期告警 | 忘记续期 → 到期当天全站不可用 |
| 5 | 私钥权限 | `600`，不进版本库（`certs/` 已 gitignore） | 私钥随镜像 / 压缩包分发 |
| 6 | 唯一入口 | 前端与 API 同域，只暴露一个 443 | 前端 443、API 3443 → 两张证书、两处信任 |
| 7 | 客户端时间 | 与 NTP 同步 | 时间偏差越过 notBefore → 提示「证书尚未生效」 |

### 部署后自检（三条命令）

```bash
# 1) 页面与 API 都通
curl -sI https://pm.example.com/ | head -1
curl -s  https://pm.example.com/api/health          # 期望 {"status":"ok",...}

# 2) 证书主体与有效期
openssl s_client -connect pm.example.com:443 -servername pm.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates

# 3) 证书链是否完整（期望 ≥2：站点证书 + 中间证书）
openssl s_client -connect pm.example.com:443 -servername pm.example.com -showcerts </dev/null 2>/dev/null \
  | grep -c "BEGIN CERTIFICATE"
```

### 本地开发：一条命令生成受信证书

```bash
pnpm cert:dev            # 等价于 node scripts/dev-cert.js
```

- 有 `mkcert` → 走 mkcert（`-install` + 签发）
- 没有 `mkcert` → 用本机 openssl 自建**本地根 CA**，并自动装进系统受信任根
  （网络受限、装不了 mkcert 时同样可用，2026-11-28 实测）
- 产物固定为 `certs/pinecone.crt` + `certs/pinecone.key`，`.env` 与前端 dev 脚本**都无需改动**
- 覆盖主机：`localhost` / `127.0.0.1` / `::1`
- 其他开关：`--no-trust`（只签发不碰信任库，CI 用）、`--clean`（打印卸载 CA 的命令）

> ⚠️ 换证书后必须**完全退出浏览器再打开**。浏览器会在进程内缓存「该证书不可信」的判断，
> 只关标签页不会刷新 —— 否则会出现「命令行 curl 正常、浏览器仍报无法连接」的假故障。

## 故障速查

### 登录时提示「无法连接服务器」

先做一件事：**让用户在浏览器地址栏直接打开 `https://<域名>/api/health`**，结果直接指向病因。

| 打开结果 | 判定 | 处理 |
|---|---|---|
| 弹出「您的连接不是私密连接」 | API 证书未被信任 | 换受信证书；内网自签需向所有客户端分发 CA |
| 返回 `{"status":"ok",...}` | 证书 OK，问题在别处 | 查反代路由、CORS（`FRONTEND_URL` 是否含真实 origin）、出口网络策略 |
| 502 / 504 | 反代连不到后端 | 查后端进程与 upstream 地址 / 端口 |

### 其他常见登录异常

| 现象 | 判定 | 处理 |
|---|---|---|
| 提示「登录失败，请检查邮箱和密码」 | 凭据真的不符 | 核对密码；注意浏览器密码管理器可能填充**旧密码** |
| 表单看着已填，提交却报字段校验错误 | 密码管理器自动填充未触发 `onChange`，受控表单 state 仍为空 | 已在登录页修复（提交时用 ref 读 DOM 实际值）；仍有问题先硬刷新页面 |
| 登录返回 201，下一个请求 401 | 纯 HTTP 下 `Secure` cookie 被浏览器丢弃 | 必须 https；临时调试可 `COOKIE_SECURE=false`，但用局域网 IP 访问仍会掉线 |
| 只有部分设备报证书错误 | 证书链不全 | 部署 fullchain |
| 某天所有 https 突然失效 | 证书过期 | 续期并检查自动续期任务 |

> 排查顺序：**先证明证书（`/api/health`）→ 再证明后端（日志）→ 最后才怀疑账号密码**。
> 旧版本前端曾把「网络错误」和「密码错误」合并成同一句提示，导致排查方向被带偏
> （v1.0.x 已拆分为「无法连接服务器 / 请填写必填项 / 邮箱或密码错误」三种文案）。

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

Backend runs on http://localhost:3000, frontend on https://localhost:6173.

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `PORT` | API port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pinecone_app:@localhost:5432/pinecone` |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | (required) |
| `FRONTEND_URL` | Frontend URL for CORS | `https://localhost:6173` |

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
