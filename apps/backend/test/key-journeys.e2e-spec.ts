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
  });
});
