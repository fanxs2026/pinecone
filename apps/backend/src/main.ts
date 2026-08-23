import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { runWithRequestContext } from './common/request-context';

async function bootstrap() {
  // HTTPS 支持：配置 HTTPS_ENABLED=true + HTTPS_CERT_PATH/HTTPS_KEY_PATH 后以 https 监听
  // （本地用 scripts/gen-cert.sh 生成自签名证书；生产替换为正式证书即可）
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  const certPath = process.env.HTTPS_CERT_PATH;
  const keyPath = process.env.HTTPS_KEY_PATH;

  let httpsOptions: { key: Buffer; cert: Buffer } | undefined;
  if (httpsEnabled && certPath && keyPath) {
    // 证书路径相对项目根解析（dev CWD 在 apps/backend，直接相对路径会找不到）
    const projectRoot = resolve(__dirname, '../../..');
    httpsOptions = {
      key: readFileSync(resolve(projectRoot, keyPath)),
      cert: readFileSync(resolve(projectRoot, certPath)),
    };
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...(httpsOptions ? { httpsOptions } : {}),
    rawBody: true,
  });

  // F-3 修复（2026-08-19 上线前全检）：反代后按真实客户端 IP 限流。
  // 默认信任 loopback（本机 nginx/反代）；生产若用独立 LB 请设 TRUST_PROXY=<LB IP 或 true>。
  // Express trust proxy 支持 'loopback' | 'true' | 跳数 | IP/子网 | 数组（见 Express 文档）。
  const trustProxy = process.env.TRUST_PROXY || 'loopback';
  if (trustProxy !== 'false') {
    app.set('trust proxy', trustProxy);
  }

  // 2026-08-19 设置·系统管理可读性：请求级上下文（AsyncLocalStorage）——捕获客户端 IP 供
  // service 层 activity 记录使用（trust proxy 已配置，req.ip 为真实客户端地址）
  app.use((req: Request, _res: Response, next: NextFunction) => {
    runWithRequestContext({ ip: (req.ip as string) || req.socket?.remoteAddress }, () => next());
  });

  // 知识库文档 body 上限：Tiptap JSON（含内嵌 base64 图片/大表格）可轻松超
  // Express 默认 100kb → 保存 413。放宽到 10mb（内嵌图片已限 1MB/张，附件走 uploads）。
  app.useBodyParser('json', { limit: '10mb' });

  // Serve uploaded files statically — development only.
  // In production the /uploads directory must NOT be publicly exposed;
  // attachments should be served through an authenticated endpoint or
  // private object storage (see uploads module).
  if (process.env.NODE_ENV !== 'production') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  }

  app.setGlobalPrefix('api');

  // CORS: strict allowlist of frontend origins (no wildcard with credentials).
  // Supports comma-separated FRONTEND_URL values (http + https for local https demo).
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:6173,https://localhost:6173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      // Allow non-browser clients (curl, mobile) and same-origin requests.
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  // Baseline security headers (OWASP Secure Headers Project).
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // P2-18 修复：HTTPS 下启用 HSTS（生产走 TLS）
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Expose Swagger docs in non-production environments only
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Pinecone API')
      .setDescription(
        'Aha!-style requirements management system.\n\n' +
          'I10 API 治理（2026-08-18 P2）：全局前缀 /api；认证 = Bearer JWT（Web）或 API Token（pc_tok_ 前缀，SHA-256 存储）；' +
          '全局限流 100 req/min/IP（Throttler）；Swagger 仅非生产暴露。',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const scheme = httpsOptions ? 'https' : 'http';
  console.log(`Pinecone API running on ${scheme}://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs at ${scheme}://localhost:${port}/api/docs`);
  }
}
bootstrap();
