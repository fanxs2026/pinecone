#!/usr/bin/env bash
# 生成自签名证书（本地/演示 HTTPS 用）。
# 用法：./scripts/gen-cert.sh [局域网IP]
# 输出：certs/pinecone.crt + certs/pinecone.key（SAN 含 localhost/127.0.0.1/局域网IP）
# 生产环境请替换为正式证书（Let's Encrypt / 云证书），路径不变。
set -euo pipefail
cd "$(dirname "$0")/.."

# 探测 openssl（Git Bash 的 /usr/bin 可能不在 PATH）
OPENSSL=$(command -v openssl || echo "/c/Program Files/Git/usr/bin/openssl.exe")
if ! "$OPENSSL" version >/dev/null 2>&1; then
  echo "!! 未找到 openssl，请安装或指定路径" >&2
  exit 1
fi

LAN_IP="${1:-192.168.1.3}"
mkdir -p certs

"$OPENSSL" req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/pinecone.key \
  -out certs/pinecone.crt \
  -days 825 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}"

echo ""
echo "✅ 证书已生成：certs/pinecone.crt + certs/pinecone.key"
echo ""
echo "在 .env 中启用 HTTPS："
echo "  HTTPS_ENABLED=true"
echo "  HTTPS_CERT_PATH=certs/pinecone.crt"
echo "  HTTPS_KEY_PATH=certs/pinecone.key"
echo ""
echo "然后重启后端与前端："
echo "  后端：node apps/backend/dist/main.js（自动读 HTTPS_* 以 https 监听）"
echo "  前端：cd apps/frontend && NODE_ENV=production node server.js"
