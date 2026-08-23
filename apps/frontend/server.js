/**
 * Pinecone 前端生产 server（Next.js custom server，支持 HTTP/HTTPS 双模式）
 *
 * 用法：
 *   NODE_ENV=production node server.js          # 默认 http://localhost:6173
 *   HTTPS_ENABLED=true node server.js           # https（需 HTTPS_CERT_PATH/HTTPS_KEY_PATH）
 *
 * 证书：本地用 scripts/gen-cert.sh 生成自签名证书；生产替换为正式证书（Let's Encrypt 等）
 */
'use strict';

// 加载项目根 .env（自定义 server 不像 next CLI 会自动加载；手写解析避免依赖 dotenv）
const path = require('path');
const fs = require('fs');
(function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env 不存在时忽略（环境变量由系统注入的场景）
  }
})();

const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const { parse } = require('url');
const { readFileSync } = require('fs');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = Number(process.env.PORT || 6173);

app.prepare().then(() => {
  const requestHandler = (req, res) => handle(req, res, parse(req.url, true));

  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  // 证书路径相对项目根解析（.env 里写 certs/pinecone.key，而 CWD 可能在 apps/frontend）
  const root = path.resolve(__dirname, '../../');
  const certPath = path.resolve(root, process.env.HTTPS_CERT_PATH || 'certs/pinecone.crt');
  const keyPath = path.resolve(root, process.env.HTTPS_KEY_PATH || 'certs/pinecone.key');

  if (httpsEnabled && certPath && keyPath) {
    const server = createHttpsServer(
      { key: readFileSync(keyPath), cert: readFileSync(certPath) },
      requestHandler,
    );
    server.listen(port, () => {
      console.log(`Pinecone frontend running on https://localhost:${port}`);
    });
  } else {
    createHttpServer(requestHandler).listen(port, () => {
      console.log(`Pinecone frontend running on http://localhost:${port}`);
    });
  }
});
