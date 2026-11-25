/**
 * 运行期配置占位文件（开发/默认值）。
 *
 * 便携版在启动时由 bin/run-frontend.js 依据 .env 覆写同名文件
 * （apps/frontend/public/runtime-config.js），因此换 IP / 换端口无需重新构建。
 *
 * 各字段留空时，前端会从 window.location 推导：
 *   apiUrl  = <当前页面 protocol>//<当前页面 hostname>:<backendPort>/api
 * 详见 src/lib/runtime-config.ts。
 */
window.__PINECONE_RUNTIME__ = window.__PINECONE_RUNTIME__ || {};
