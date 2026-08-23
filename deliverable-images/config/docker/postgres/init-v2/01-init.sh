#!/bin/bash
# Pinecone DB 初始化：创建最小权限应用用户（仅 DML）。
# 密码来自 compose 环境变量 APP_DB_PASSWORD（生产必须为强随机值，勿与登录账号复用）。
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
CREATE USER pinecone_app WITH PASSWORD '${APP_DB_PASSWORD}';
GRANT CONNECT ON DATABASE pinecone TO pinecone_app;
GRANT USAGE ON SCHEMA public TO pinecone_app;
ALTER SCHEMA public OWNER TO pinecone_admin;
EOSQL

echo "pinecone_app user created (schema owner: pinecone_admin)"
