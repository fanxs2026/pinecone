FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/package.json apps/backend/

RUN pnpm install --frozen-lockfile

# 分步 COPY：绝不 COPY 整个 apps/frontend 目录（会带进宿主 node_modules，破坏容器内依赖链接）
COPY apps/frontend/src apps/frontend/src
COPY apps/frontend/public apps/frontend/public
COPY apps/frontend/next.config.ts apps/frontend/tsconfig.json apps/frontend/postcss.config.mjs apps/frontend/next-env.d.ts apps/frontend/
# NEXT_PUBLIC_* vars are inlined at build time — inject the API/WS URL here
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL=http://localhost:3000/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
# B4 修复：KB 协同 WS 地址（生产须与后端发布端口/TLS 一致）
ARG NEXT_PUBLIC_KB_COLLAB_URL=wss://localhost:3002/kb-collab
ENV NEXT_PUBLIC_KB_COLLAB_URL=$NEXT_PUBLIC_KB_COLLAB_URL
# next.config.ts 已开 output:'standalone' → 产出 .next/standalone（最小 server + traced node_modules）
RUN pnpm --filter frontend build

# ── Production image ──
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# standalone 最小产物：server.js + traced node_modules（不再拷贝全量根 node_modules）
# 注意：monorepo 下 Next 以仓库根为 tracing root，standalone 布局嵌套在 apps/frontend/ 下（dir = __dirname）
COPY --from=builder /app/apps/frontend/.next/standalone ./
# 静态资源与 public 需单独拷贝（standalone 不包含），且要落在 server 的 app dir（apps/frontend）下
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public

EXPOSE 3000
# 直启 standalone server（不再 sh -c next start）
CMD ["node", "apps/frontend/server.js"]
