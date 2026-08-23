FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/prisma/schema.prisma apps/backend/prisma/

RUN pnpm install --frozen-lockfile

# 分步 COPY：绝不 COPY 整个 apps/backend 目录（会带进宿主 node_modules，破坏容器内依赖链接）
COPY apps/backend/src apps/backend/src
COPY apps/backend/nest-cli.json apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/prisma.config.ts apps/backend/
RUN pnpm --filter backend build && \
    pnpm --filter backend exec prisma generate && \
    # 瘦身：只产出 backend 生产依赖树（pnpm 官方独立部署方案，替代 COPY 全量根 node_modules）
    # --legacy 因 workspace 未开 inject-workspace-packages（backend 无 workspace 依赖，legacy 等价）
    pnpm --filter @pinecone/backend deploy --prod --legacy /out/backend

# ── Production image ──
FROM node:22-alpine

WORKDIR /app

# 只带 backend 生产依赖（deploy 产物 node_modules，无 frontend 依赖/devDependencies）
COPY --from=builder /out/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
# 运行时不需要 prisma CLI / schema / migrations（迁移在部署期由 CI 执行，见 DEPLOYMENT.md）

EXPOSE 3000
# 直接用 node 启动——不用 pnpm（pnpm 每次运行做 supply-chain 联网验证会卡住容器启动）
CMD ["node", "/app/apps/backend/dist/main"]
