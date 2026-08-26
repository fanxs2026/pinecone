FROM node:22-alpine AS builder

# 版本（社区版 / 企业版）：仅影响是否注入企业 overlay 与运行时 PINE_EDITION。
ARG EDITION=community
ARG COMMIT_SHA=unknown

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

# ── 企业版 overlay 注入（BuildKit 外部构建上下文 eeoverlay）──
# 必须在 COPY src 之后、build 之前注入：否则紧随其后的 COPY apps/backend/src 会把注入的
# 企业模块覆盖回公开仓库版本（社区版无企業模块）。
# 社区版：release 脚本传入【仅含空目录】的 scaffold，GUARD 跳过 -> 零企业代码。
# 企业版：传入 pinecone-overlay 仓库根，布局契约见 scripts/build-ee.sh：
#   <overlay>/backend/modules/ee/<mod>  ->  apps/backend/src/modules/<mod>
COPY --from=eeoverlay /backend/modules/ee ./_ee_be
RUN if [ -d ./_ee_be ] && [ -n "$(ls -A ./_ee_be 2>/dev/null)" ]; then \
      for m in ./_ee_be/*; do \
        name=$(basename "$m"); \
        rm -rf "apps/backend/src/modules/$name"; \
        cp -r "$m" "apps/backend/src/modules/$name"; \
      done; \
      rm -rf ./_ee_be; \
    fi

RUN pnpm --filter backend build && \
    pnpm --filter backend exec prisma generate && \
    # 瘦身：只产出 backend 生产依赖树（pnpm 官方独立部署方案，替代 COPY 全量根 node_modules）
    # --legacy 因 workspace 未开 inject-workspace-packages（backend 无 workspace 依赖，legacy 等价）
    pnpm --filter @pinecone/backend deploy --prod --legacy /out/backend

# ── Production image ──
FROM node:22-alpine

# 重新声明 ARG（FROM 边界会清空上一阶段 ARG 作用域）
ARG EDITION=community
ARG COMMIT_SHA=unknown

WORKDIR /app

# 只带 backend 生产依赖（deploy 产物 node_modules，无 frontend 依赖/devDependencies）
COPY --from=builder /out/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
# 运行时不需要 prisma CLI / schema / migrations（迁移在部署期由 CI 执行，见 DEPLOYMENT.md）

# 企业版：让 ee-gate.ts 中的 import('@ee/...') 在编译后的 CJS 运行时可解析。
# 仓库与 overlay 均无 @ee/* tsconfig 别名，也无 node_modules/@ee，
# 故在此将 node_modules/@ee 软链到编译产物 modules 目录。社区版跳过 -> 零泄露。
RUN if [ "$EDITION" = "enterprise" ] && [ -d /app/apps/backend/dist/modules ]; then \
      ln -sfn /app/apps/backend/dist/modules /app/apps/backend/node_modules/@ee; \
    fi

ENV NODE_ENV=production
ENV PINE_EDITION=${EDITION}
LABEL pinecone.commit="${COMMIT_SHA}"

EXPOSE 3000
# 直接用 node 启动——不用 pnpm（pnpm 每次运行做 supply-chain 联网验证会卡住容器启动）
CMD ["node", "/app/apps/backend/dist/main"]
