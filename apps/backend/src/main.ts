import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { runWithRequestContext } from './common/request-context';
import { getEffectiveEdition, getPineEdition } from './common/config/edition';
import { describeLicense } from './common/license/license-state';
import { isEnterprisePayloadPresent } from './common/license/ee-payload';
import { firstUserBecomesAdminEnabled } from './common/config/platform-admin';
import { PrismaService } from './prisma/prisma.service';

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
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads',
      setHeaders: (res) => {
        // 防 MIME 嗅探：上传白名单已排除 html/svg，但文本类附件（txt/md/csv/sql）
        // 若被浏览器猜成 text/html 就会同源执行脚本。nosniff 关掉这条路径。
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    });
  }

  app.setGlobalPrefix('api');

  // CORS: strict allowlist of frontend origins (no wildcard with credentials).
  // Supports comma-separated FRONTEND_URL values (http + https for local https demo).
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:6173,https://localhost:6173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // 便携版/局域网部署：前端与后端同机不同端口，客户用 192.168.x.x 打开 UI 时，
  // Origin 的 hostname 与 API 请求的 Host 相同。此时 FRONTEND_URL 白名单必然对不上。
  // 默认关闭（Docker/托管保持严格白名单），仅 CORS_ALLOW_SAME_HOST=true 时放行，
  // 且只放行 hostname 完全一致（或互为 loopback）的来源，不会放宽到任意站点。
  const allowSameHost = (process.env.CORS_ALLOW_SAME_HOST || 'false').toLowerCase() === 'true';
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

  app.enableCors((req: Request, cb) => {
    const origin = req.header('Origin');
    const grant = { origin: true, credentials: true };
    const deny = { origin: false };

    // Non-browser clients (curl, mobile, server-side) send no Origin header.
    if (!origin) return cb(null, grant);
    if (allowedOrigins.includes(origin)) return cb(null, grant);

    if (allowSameHost) {
      try {
        const originHost = new URL(origin).hostname;
        const reqHost = String(req.headers.host || '').split(':')[0];
        const sameHost =
          originHost === reqHost ||
          (LOOPBACK_HOSTS.has(originHost) && LOOPBACK_HOSTS.has(reqHost));
        if (sameHost) return cb(null, grant);
      } catch {
        // malformed Origin -> fall through to deny
      }
    }
    return cb(null, deny);
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

  // 版本与授权状态：一眼看出「声明了企业版但实际跑社区版」的原因
  const declared = getPineEdition();
  const effective = getEffectiveEdition();
  const editionLogger = new Logger('Edition');
  editionLogger.log(
    `declared=${declared} effective=${effective} | licence: ${describeLicense()} | ee-payload=${
      isEnterprisePayloadPresent() ? 'present' : 'absent'
    }`
  );
  if (declared === 'enterprise' && effective !== 'enterprise') {
    editionLogger.warn(
      'Enterprise edition not active -> running as community. Check the line above: ' +
        'licence state and ee-payload presence are the two usual causes.',
    );
  }

  // 首次部署提示：开关开启但库里一个用户都没有 → 打印醒目横幅。
  // 注意：便携包里后端窗口是最小化的、日志被重定向，所以这里必须打一个
  // **纯 ASCII 固定标记** FIRST-RUN-ADMIN-PENDING，供 start.bat 用 findstr 捕获后
  // 在客户看得见的控制台再提示一次。改标记时务必同步 scripts/pack-portable.js。
  if (firstUserBecomesAdminEnabled()) {
    try {
      const prisma = app.get(PrismaService);
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        const frontendPort = process.env.FRONTEND_PORT || '6173';
        const bar = '='.repeat(66);
        new Logger('FirstRun').warn(
          [
            '',
            bar,
            '  FIRST-RUN-ADMIN-PENDING',
            '  数据库里还没有任何用户。第一个注册的账号会自动成为平台管理员。',
            `  请立即打开 http://<本机IP>:${frontendPort} 完成管理员注册。`,
            '  注册完成后，把 .env 的 FIRST_USER_BECOMES_ADMIN 改为 false 更安全。',
            bar,
            '',
          ].join('\n')
        );
      }
    } catch (e) {
      // 数据库未就绪不应阻塞启动，仅提示
      new Logger('FirstRun').warn(
        '无法检查用户表（数据库可能未就绪）: ' + (e as Error).message
      );
    }
  }

  await app.listen(port);
  const scheme = httpsOptions ? 'https' : 'http';
  console.log(`Pinecone API running on ${scheme}://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs at ${scheme}://localhost:${port}/api/docs`);
  }
}
bootstrap();
