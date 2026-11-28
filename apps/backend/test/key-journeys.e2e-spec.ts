import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * P0#4 最小关键旅程 e2e（2026-08-21）
 *
 * 运行前提（由调用方注入环境变量）：
 *   DATABASE_URL  -> 指向已执行过 `prisma migrate deploy` 的测试库
 *   REGISTRATION_MODE=open  （否则 register 被白名单/邀请码拦截）
 * 命令示例：
 *   DATABASE_URL=... REGISTRATION_MODE=open \
 *     node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand
 *
 * 覆盖：E1 注册/登录/me · E2 建 workspace · E3 四实体 CRUD · E4 reparent 防环 ·
 *       E5 工时记录 · E6 status 变更审计（STATUS_CHANGED）
 */
describe('Key journeys (e2e)', () => {
  let app: INestApplication;
  let server: any;

  const email = `e2e-${Date.now()}@test.local`;
  const password = 'E2eTest!23456';
  let accessToken: string;
  let wsId: string;
  let featureId: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    // 与 main.ts 保持一致，否则 DTO 校验行为失真
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('E1 注册 + 登录 + me（认证契约）', async () => {
    const reg = await request(server).post('/api/auth/register').send({ email, password, name: 'E2E User' });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.user.email).toBe(email);

    const login = await request(server).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(201);
    accessToken = login.body.accessToken;
    expect(accessToken).toBeTruthy();

    const me = await request(server).get('/api/auth/me').set(auth());
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it('E2 创建 workspace（成员自动建立）', async () => {
    const slug = `ws${Date.now()}`;
    const res = await request(server).post('/api/workspaces').set(auth()).send({ name: 'E2E Workspace', slug });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(slug);
    wsId = res.body.id;
    expect(wsId).toBeTruthy();
  });

  it('E3a ideas CRUD + 实体码', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/ideas`)
      .set(auth())
      .send({ title: 'E2E Idea' });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(create.body.code).toMatch(/^[A-Za-z0-9_-]+-I-\d+$/);

    const get = await request(server).get(`/api/workspaces/${wsId}/ideas/${id}`).set(auth());
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(id);

    const patch = await request(server)
      .patch(`/api/workspaces/${wsId}/ideas/${id}`)
      .set(auth())
      .send({ title: 'E2E Idea updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.title).toBe('E2E Idea updated');
  });

  it('E3b features CRUD + 实体码（保存 featureId 供 story 依赖）', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/features`)
      .set(auth())
      .send({ title: 'E2E Feature' });
    expect(create.status).toBe(201);
    featureId = create.body.id;
    expect(create.body.code).toMatch(/^[A-Za-z0-9_-]+-F-\d+$/);

    const get = await request(server).get(`/api/workspaces/${wsId}/features/${featureId}`).set(auth());
    expect(get.status).toBe(200);

    const patch = await request(server)
      .patch(`/api/workspaces/${wsId}/features/${featureId}`)
      .set(auth())
      .send({ title: 'E2E Feature updated' });
    expect(patch.status).toBe(200);
  });

  it('E3c stories CRUD + 实体码（依赖 feature）', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/stories`)
      .set(auth())
      .send({ title: 'E2E Story', featureId });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(create.body.code).toMatch(/^[A-Za-z0-9_-]+-T-\d+$/);

    const get = await request(server).get(`/api/workspaces/${wsId}/stories/${id}`).set(auth());
    expect(get.status).toBe(200);
  });

  it('E3d supports CRUD + 实体码', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/supports`)
      .set(auth())
      .send({ title: 'E2E Support' });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(create.body.code).toMatch(/^[A-Za-z0-9_-]+-S-\d+$/);

    const patch = await request(server)
      .patch(`/api/workspaces/${wsId}/supports/${id}`)
      .set(auth())
      .send({ title: 'E2E Support updated' });
    expect(patch.status).toBe(200);
  });

  it('E4 reparent 防环（自指 / 后代成环 / 跨空间父级均 400）', async () => {
    // 建 2 个 story：A（父）、B（子）
    const mk = async (title: string) => {
      const r = await request(server)
        .post(`/api/workspaces/${wsId}/stories`)
        .set(auth())
        .send({ title, featureId });
      expect(r.status).toBe(201);
      return r.body.id;
    };
    const a = await mk('E2E Parent');
    const b = await mk('E2E Child');

    // 正常重挂：B 的 parent = A
    const ok = await request(server)
      .patch(`/api/workspaces/${wsId}/stories/${b}`)
      .set(auth())
      .send({ parentId: a });
    expect(ok.status).toBe(200);
    expect(ok.body.parentId).toBe(a);

    // 自指成环 → 400
    const self = await request(server)
      .patch(`/api/workspaces/${wsId}/stories/${b}`)
      .set(auth())
      .send({ parentId: b });
    expect(self.status).toBe(400);

    // 后代成环：把 A 挂到 B 下（B 已是 A 的子）→ 400
    const cycle = await request(server)
      .patch(`/api/workspaces/${wsId}/stories/${a}`)
      .set(auth())
      .send({ parentId: b });
    expect(cycle.status).toBe(400);

    // 父级不存在/跨空间 → 400
    const ghost = await request(server)
      .patch(`/api/workspaces/${wsId}/stories/${b}`)
      .set(auth())
      .send({ parentId: '00000000-0000-0000-0000-000000000000' });
    expect(ghost.status).toBe(400);
  });

  it('E5 工时记录（story 绑定）', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/stories`)
      .set(auth())
      .send({ title: 'E2E Timed Story', featureId });
    const storyId = create.body.id;

    const entry = await request(server)
      .post(`/api/workspaces/${wsId}/time-entries`)
      .set(auth())
      .send({ storyId, hours: 2.5, date: '2026-08-21', description: 'e2e' });
    expect(entry.status).toBe(201);
    expect(entry.body.hours).toBe(2.5);

    const list = await request(server)
      .get(`/api/workspaces/${wsId}/time-entries?storyId=${storyId}`)
      .set(auth());
    expect(list.status).toBe(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items || list.body.data || [];
    expect(items.some((t: any) => t.hours === 2.5 && t.storyId === storyId)).toBe(true);
  });

  it('E6 status 变更审计（STATUS_CHANGED 落 activities）', async () => {
    const create = await request(server)
      .post(`/api/workspaces/${wsId}/stories`)
      .set(auth())
      .send({ title: 'E2E Audit Story', featureId });
    const storyId = create.body.id;
    expect(create.body.status).toBe('OPEN');

    const patch = await request(server)
      .patch(`/api/workspaces/${wsId}/stories/${storyId}`)
      .set(auth())
      .send({ status: 'IN_PROGRESS' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('IN_PROGRESS');

    const hist = await request(server)
      .get(`/api/workspaces/${wsId}/history`)
      .query({ entityType: 'STORY', entityId: storyId })
      .set(auth());
    expect(hist.status).toBe(200);
    const items = Array.isArray(hist.body) ? hist.body : hist.body.items || hist.body.data || [];
    expect(
      items.some((a: any) => JSON.stringify(a).includes('STATUS_CHANGED')),
    ).toBe(true);
  });

  it('E7 SMTP 管理端点（admin 保存+脱敏读；普通用户 403；坏配置测试邮件不 500）', async () => {
    // 清空平台设置，保证从"未配置"状态开始（e2e 库专用，幂等）
    await app.get(PrismaService).setting.deleteMany({});

    // 普通用户 → 403（REGISTRATION_ADMIN_EMAILS 未含当前 e2e 用户）
    const forbidden = await request(server).get('/api/admin/settings/smtp').set(auth());
    expect(forbidden.status).toBe(403);

    // admin 用户（运行 e2e 时 REGISTRATION_ADMIN_EMAILS=e2e-admin@test.local）
    // 幂等处理：库已有该用户（重复跑）→ 409 则改走登录
    const adminEmail = 'e2e-admin@test.local';
    let adminToken: string;
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ email: adminEmail, password, name: 'E2E Admin' });
    if (reg.status === 201) {
      adminToken = reg.body.accessToken;
    } else {
      const login = await request(server).post('/api/auth/login').send({ email: adminEmail, password });
      expect(login.status).toBe(201);
      adminToken = login.body.accessToken;
    }
    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    // 初始未配置
    const get0 = await request(server).get('/api/admin/settings/smtp').set(adminAuth);
    expect(get0.status).toBe(200);
    expect(get0.body.hasPass).toBe(false);

    // 保存（含授权码）
    const put = await request(server)
      .put('/api/admin/settings/smtp')
      .set(adminAuth)
      .send({ host: 'smtp.test.local', port: 465, user: 'test@test.local', pass: 'secret-code-123' });
    expect(put.status).toBe(200);
    expect(put.body.source).toBe('db');
    expect(put.body.host).toBe('smtp.test.local');
    expect(put.body.hasPass).toBe(true);
    expect(JSON.stringify(put.body)).not.toContain('secret-code-123'); // 授权码不回显

    // 读回仍脱敏
    const get1 = await request(server).get('/api/admin/settings/smtp').set(adminAuth);
    expect(get1.status).toBe(200);
    expect(get1.body.hasPass).toBe(true);
    expect(JSON.stringify(get1.body)).not.toContain('secret-code-123');

    // 坏配置发测试邮件 → 200 + ok:false（8s 连接超时快速失败，不 500）
    const test = await request(server).post('/api/admin/settings/smtp/test').set(adminAuth);
    expect(test.status).toBe(200);
    expect(test.body.ok).toBe(false);
    // 该用例会真的发起一次 SMTP 连接（连不上也要等 DNS/连接超时），
    // 默认 5s 在 DNS 解析慢的机器上会偶发超时，这里单独放宽
  }, 20000);

  /**
   * E8 退出登录（2026-11-26 修复的回归用例）
   *
   * 修复前的缺陷：CSRF 同站校验在 clearCookie 之前，跨站 Origin 直接 403，
   * 两个 cookie 一个都没清；前端已清本地态并跳 /login，又被 proxy 按残留 cookie
   * 弹回首页 → 用户卡在「未登录但进不了登录页」。
   *
   * 现在的契约：
   *   · 任何来源都必须清 cookie（不返回 403）
   *   · 只有同站才撤销服务端 refresh token（跨站仅本地清理，返回 "Logged out locally"）
   */
  it('E8 logout：跨站仍清 cookie 不 403 / 同站撤销会话', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:6173')
      .send({ email, password });
    expect(login.status).toBe(201);
    const rawCookies = (login.headers['set-cookie'] || []) as unknown as string[];
    expect(rawCookies.length).toBeGreaterThan(0);
    const cookieHeader = rawCookies.map((c) => c.split(';')[0]).join('; ');

    // ① 跨站来源：不得 403，且必须下发两个清除 cookie
    const cross = await request(server)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', cookieHeader);
    expect([200, 201]).toContain(cross.status);
    expect(cross.body.message).toBe('Logged out locally');
    const cleared = (cross.headers['set-cookie'] || []) as unknown as string[];
    expect(cleared.some((c) => c.startsWith('pinecone-access=;'))).toBe(true);
    expect(cleared.some((c) => c.startsWith('pinecone-refresh=;'))).toBe(true);

    // ② 同站：正常撤销服务端会话
    // 注意：同一性判定比的是 Origin 的 hostname 与请求 Host 的 hostname（忽略端口）。
    // supertest 默认 Host 是 127.0.0.1:<随机端口>，所以这里 Origin 也必须用 127.0.0.1，
    // 否则会被判成跨站（真实浏览器里两者天然一致）。
    const same = await request(server)
      .post('/api/auth/logout')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Cookie', cookieHeader);
    expect([200, 201]).toContain(same.status);
    expect(same.body.message).toBe('Logged out successfully');

    // ③ 撤销后 refresh 必须失败（旧 cookie 不能再换新 access token）
    const refresh = await request(server)
      .post('/api/auth/refresh')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Cookie', cookieHeader);
    expect(refresh.status).toBe(401);
  });

  /**
   * E9 厂商侧管理面已从发布软件移除（2026-11-28）
   *
   * 「客户管理后台（License 签发/续期/吊销）」与「活跃实例」是厂商运营能力，
   * 不进发布软件：前端页面、i18n 文案、API 客户端均已删除，
   * 后端 GET /api/telemetry/instances 与 /summary 也一并移除。
   * 回归断言：任何身份（含系统管理员）访问都应 404，防止接口被误加回来。
   */
  it('E9 厂商侧管理面不存在：telemetry 实例列表 / 汇总 / ping 均已移除（404）', async () => {
    const plain = await request(server).get('/api/telemetry/instances').set(auth());
    expect(plain.status).toBe(404);

    const plainSummary = await request(server).get('/api/telemetry/summary').set(auth());
    expect(plainSummary.status).toBe(404);

    // 接收端 ping 也已下线：无消费方，且 telemetry_report 逐条 insert 会无限增长
    const ping = await request(server).post('/api/telemetry/ping').send({ instanceId: 'e2e-probe' });
    expect(ping.status).toBe(404);

    // 客户端能力必须保留：更新检查 + 心跳
    const check = await request(server).get('/api/telemetry/updates/check?version=1.0.0');
    expect(check.status).toBe(200);
    expect(typeof check.body.latest).toBe('string');
  });

  /**
   * E10 交付时限（dueDate）写入（2026-11-26 线上故障回归）
   *
   * DTO 的 dueDate 是 `YYYY-MM-DD`（前端 date input 原生值），而 Prisma 的 DateTime
   * 只接受完整 ISO-8601 —— 直接透传会报
   * `Invalid value for argument 'dueDate': premature end of input`，表现为创建 500。
   * 三个实体（support / feature / story）共用 common/utils/date-only 的 toDateOnly。
   */
  it('E10 dueDate：纯日期可创建 / 可更新 / 可清空', async () => {
    const created = await request(server)
      .post(`/api/workspaces/${wsId}/supports`)
      .set(auth())
      .send({ title: '带交付时限的支持请求', dueDate: '2026-12-01' });
    expect(created.status).toBe(201);
    expect(String(created.body.dueDate).slice(0, 10)).toBe('2026-12-01');

    const patched = await request(server)
      .patch(`/api/workspaces/${wsId}/supports/${created.body.id}`)
      .set(auth())
      .send({ dueDate: '2027-01-15' });
    expect(patched.status).toBe(200);
    expect(String(patched.body.dueDate).slice(0, 10)).toBe('2027-01-15');

    const cleared = await request(server)
      .patch(`/api/workspaces/${wsId}/supports/${created.body.id}`)
      .set(auth())
      .send({ dueDate: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.dueDate).toBeNull();

    // feature 走同一工具，抽一条确认没有遗漏
    const feature = await request(server)
      .post(`/api/workspaces/${wsId}/features`)
      .set(auth())
      .send({ title: '带交付时限的特性', dueDate: '2026-12-31' });
    expect(feature.status).toBe(201);
    expect(String(feature.body.dueDate).slice(0, 10)).toBe('2026-12-31');
  });

  /**
   * E11 工时筛选（2026-11-27 新增的实体类型 / 发布周期过滤）
   *
   * 要点：
   *  - 发布周期的工时归属有三种（story.releaseId / story.feature.releaseId / 实体上），
   *    任一没覆盖都会筛出空列表
   *  - 非法 UUID 必须 400，而不是 Prisma P2023 冒成 500
   */
  it('E11 工时筛选：实体类型 / 发布周期 / 非法参数', async () => {
    const rel = await request(server)
      .post(`/api/workspaces/${wsId}/releases`)
      .set(auth())
      .send({ name: 'E2E 工时周期' });
    expect([200, 201]).toContain(rel.status);
    const releaseId = rel.body.id as string;

    const sup = await request(server)
      .post(`/api/workspaces/${wsId}/supports`)
      .set(auth())
      .send({ title: 'E2E 工时支持请求', releaseId });
    expect(sup.status).toBe(201);
    const supportId = sup.body.id as string;

    const entry = await request(server)
      .post(`/api/workspaces/${wsId}/time-entries`)
      .set(auth())
      .send({ entityType: 'SUPPORT', entityId: supportId, description: 'E2E 工时', hours: 1.5, date: '2026-11-27' });
    expect(entry.status).toBe(201);

    const byType = await request(server)
      .get(`/api/workspaces/${wsId}/time-entries?entityType=SUPPORT`)
      .set(auth());
    expect(byType.status).toBe(200);
    expect(byType.body.items.length).toBeGreaterThan(0);
    expect(byType.body.items.every((i: any) => i.entityType === 'SUPPORT')).toBe(true);

    const byRelease = await request(server)
      .get(`/api/workspaces/${wsId}/time-entries?releaseId=${releaseId}`)
      .set(auth());
    expect(byRelease.status).toBe(200);
    expect(byRelease.body.items.some((i: any) => i.entityId === supportId)).toBe(true);

    // 任务类型不会报错（该工作区可能没有任务工时，只要不是 500）
    const byStory = await request(server)
      .get(`/api/workspaces/${wsId}/time-entries?entityType=STORY`)
      .set(auth());
    expect(byStory.status).toBe(200);

    const bad = await request(server)
      .get(`/api/workspaces/${wsId}/time-entries?releaseId=not-a-uuid`)
      .set(auth());
    expect(bad.status).toBe(400);
  });

  /**
   * E12 附件下载（2026-11-27：前端此前只有删除按钮，接上了后端鉴权下载端点）
   * 顺带覆盖 multer 升级（2.1.1 → 2.5.0，via overrides）后的上传链路。
   */
  it('E12 附件上传 / 下载 / 预览 / 未授权', async () => {
    const entityId = '11111111-2222-3333-4444-555555555555';
    const up = await request(server)
      .post(`/api/workspaces/${wsId}/uploads?entityType=STORY&entityId=${entityId}&category=FILE`)
      .set(auth())
      .attach('file', Buffer.from('hello attachment'), { filename: '测试附件.txt', contentType: 'text/plain' });
    expect([200, 201]).toContain(up.status);
    const attId = up.body.id as string;
    expect(attId).toBeTruthy();
    // 中文文件名不能被 latin1 解码搞成乱码（2026-11-27 回归）
    expect(up.body.fileName).toBe('测试附件.txt');

    const dl = await request(server)
      .get(`/api/workspaces/${wsId}/uploads/${attId}/download`)
      .set(auth());
    expect(dl.status).toBe(200);
    expect(String(dl.headers['content-disposition'])).toContain('attachment');
    expect(dl.text).toBe('hello attachment');

    const inline = await request(server)
      .get(`/api/workspaces/${wsId}/uploads/${attId}/download?inline=1`)
      .set(auth());
    expect(inline.status).toBe(200);
    expect(String(inline.headers['content-disposition'])).toContain('inline');

    const anon = await request(server).get(`/api/workspaces/${wsId}/uploads/${attId}/download`);
    expect(anon.status).toBe(401);
  });

  /**
   * E13 附件类型与编码（2026-11-27）
   *  - .sql 脚本此前不在 MIME 白名单，被 400 拒掉
   *  - 文本类预览不带 charset，中文 Windows 浏览器按 GBK 解码 UTF-8 → 乱码
   */
  it('E13 附件：.sql 可上传、文本预览声明 UTF-8 并转换 GBK', async () => {
    const entityId = '11111111-2222-3333-4444-555555555555';
    const upload = (buf: Buffer, filename: string, contentType: string) =>
      request(server)
        .post(`/api/workspaces/${wsId}/uploads?entityType=STORY&entityId=${entityId}&category=FILE`)
        .set(auth())
        .attach('file', buf, { filename, contentType });

    const sql = await upload(Buffer.from('SELECT 1;'), 'script.sql', 'application/sql');
    expect([200, 201]).toContain(sql.status);

    // 浏览器对 .sql 常给空/octet-stream（未注册扩展名）→ 应按扩展名兜底放行
    const sqlOctet = await upload(Buffer.from('SELECT 1;'), 'script2.sql', 'application/octet-stream');
    expect([200, 201]).toContain(sqlOctet.status);

    const md = await upload(Buffer.from('# 标题\n\n中文内容', 'utf8'), 'note.md', 'text/markdown');
    expect([200, 201]).toContain(md.status);
    const mdDl = await request(server)
      .get(`/api/workspaces/${wsId}/uploads/${md.body.id}/download?inline=1`)
      .set(auth());
    expect(mdDl.status).toBe(200);
    expect(String(mdDl.headers['content-type'])).toContain('charset=utf-8');
    expect(mdDl.text).toContain('中文内容');

    // GBK 编码的「中文」(D6 D0 CE C4) → 服务端应转成 UTF-8 再返回
    const gbk = await upload(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), 'gbk.txt', 'text/plain');
    expect([200, 201]).toContain(gbk.status);
    const gbkDl = await request(server)
      .get(`/api/workspaces/${wsId}/uploads/${gbk.body.id}/download?inline=1`)
      .set(auth());
    expect(gbkDl.status).toBe(200);
    expect(gbkDl.text).toBe('中文');
  });
});
