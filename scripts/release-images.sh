#!/usr/bin/env bash
# ============================================================================
# Pinecone 发布：构建不可变 tag 镜像并导出离线分发包（条件 Go 门槛，2026-08-19）
#
# 用途：发布不再依赖 :latest 可变标签——每次发版打 vX.Y.Z-<commit-sha> 不可变 tag，
#       保留上一版 tar 供回滚；:latest 仅作滚动指针。
#
# 用法（在仓库根目录，Git Bash）：
#   scripts/release-images.sh v1.0.0
#
# 产物：
#   dist/pinecone-backend-vX.Y.Z-<sha>.tar
#   dist/pinecone-frontend-vX.Y.Z-<sha>.tar
#   （同时打 :latest 指针，便于 compose 默认拉取）
#
# 部署：docker load < dist/pinecone-*.tar，然后
#   BACKEND_IMAGE_TAG=vX.Y.Z-<sha> FRONTEND_IMAGE_TAG=vX.Y.Z-<sha> \
#     docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
#
# 回滚：docker load < dist/pinecone-*-<上一版sha>.tar 后以上一版 tag 重启即可。
# ============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <version>   e.g. $0 v1.0.0" >&2
  exit 1
fi
VERSION="$1"
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
TAG="${VERSION}-${COMMIT_SHA}"
mkdir -p dist

echo "==> Building pinecone-backend:${TAG} (commit ${COMMIT_SHA})"
docker build \
  --build-arg COMMIT_SHA="${COMMIT_SHA}" \
  -t "pinecone-backend:${TAG}" \
  -t pinecone-backend:latest \
  -f docker/backend.Dockerfile .
echo "==> Saving dist/pinecone-backend-${TAG}.tar"
docker save -o "dist/pinecone-backend-${TAG}.tar" "pinecone-backend:${TAG}"

echo "==> Building pinecone-frontend:${TAG}"
docker build \
  --build-arg COMMIT_SHA="${COMMIT_SHA}" \
  -t "pinecone-frontend:${TAG}" \
  -t pinecone-frontend:latest \
  -f docker/frontend.Dockerfile .
echo "==> Saving dist/pinecone-frontend-${TAG}.tar"
docker save -o "dist/pinecone-frontend-${TAG}.tar" "pinecone-frontend:${TAG}"

echo ""
echo "==> Done. Immutable tag: ${TAG}"
echo "    Deploy: docker load < dist/pinecone-backend-${TAG}.tar && docker load < dist/pinecone-frontend-${TAG}.tar"
echo "    Then:   BACKEND_IMAGE_TAG=${TAG} FRONTEND_IMAGE_TAG=${TAG} docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"
echo "    Rollback: load previous dist/pinecone-*-<prev-sha>.tar and restart with previous TAG."
