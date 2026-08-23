import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createServer as createHttpsServer } from 'https';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';

// y-websocket 的 bin/utils 为 CJS 且无类型声明；exports 白名单含 "./bin/utils"，运行时 require 可解析
// setPersistence 是 y-websocket 2.x 官方持久化接入点（setupWSConnection 不接受 docProvider 选项）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils') as {
  setupWSConnection: (
    conn: WebSocket,
    req: unknown,
    opts?: { docName?: string; gc?: boolean },
  ) => void;
  setPersistence: (p: {
    provider: unknown;
    bindState: (docName: string, ydoc: any) => Promise<void>;
    writeState: (docName: string, ydoc: any) => Promise<void>;
  }) => void;
};

// I3 协同态持久化（2026-08-18 P0，竞品差距 G2）：y-leveldb 落盘 provider。
// CJS 无类型声明，按 y-websocket/bin/utils 同款 require + 断言引入；prebuilt 原生模块运行时直载。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LeveldbPersistence } = require('y-leveldb') as {
  LeveldbPersistence: new (dir: string) => {
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    getYDoc(docName: string): Promise<any>;
    storeState(docName: string, ydoc: any): Promise<void>; // I 修复：压实增量日志
    destroy(): Promise<void>;
  };
};

/** 从 Cookie 头提取指定 cookie（httpOnly 主通道） */
function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// G1 知识库 P2-C：Yjs 实时协同服务（2026-08-16）
// 独立 ws server（:3002/kb-collab），与 REST 并存：
//  - 连接 URL: ws(s)://host:3002/kb-collab?docName=<pageId>&token=<jwt>
//  - JWT 鉴权（复用 ACCESS_TOKEN 密钥）
//  - I3 协同态持久化（2026-08-18 P0）：y-leveldb 落盘（默认 <项目根>/data/kb-collab，
//    KB_COLLAB_PERSIST_DIR 可覆盖）；连接时自动恢复历史 doc，update 实时落盘，重启/多实例不再丢协同态；
//    REST updatePage 仍负责版本快照 + tsvector 同步（两条链并存，职责分离）
@Injectable()
export class KbCollabService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KbCollabService.name);
  private wss: WebSocketServer | null = null;
  /** y-leveldb 落盘目录（KB_COLLAB_PERSIST_DIR 可覆盖；默认 <projectRoot>/data/kb-collab） */
  private persistDir = '';
  /** 按目录缓存的 LeveldbPersistence 单例（避免每连接重复打开 leveldb） */
  private persistCache = new Map<string, InstanceType<typeof LeveldbPersistence>>();
  /** I 修复：已打开的文档集合（压实用） */
  private persistedDocs = new Set<string>();
  /** I 修复：周期压实定时器（默认 6h，KB_COLLAB_COMPACT_INTERVAL_MS 可调） */
  private compactTimer: NodeJS.Timeout | null = null;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  /** I13 WS 房间授权：pageId → 归属工作区 → 成员校验（防跨工作区越权） */
  private async authorizeCollab(userId: string | undefined, pageId: string): Promise<boolean> {
    if (!userId) return false;
    const page = await this.prisma.kbPage.findUnique({
      where: { id: pageId },
      select: { workspaceId: true },
    });
    if (!page) return false;
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: page.workspaceId, userId },
      select: { id: true },
    });
    return !!member;
  }

  private getPersistence() {
    let p = this.persistCache.get(this.persistDir);
    if (!p) {
      p = new LeveldbPersistence(this.persistDir);
      this.persistCache.set(this.persistDir, p);
      this.logger.log(`KB collab persistence dir: ${this.persistDir}`);
    }
    return p;
  }

  onModuleInit() {
    const port = Number(process.env.KB_COLLAB_PORT || 3002);
    // TLS：与 main.ts 同源证书（https 页面连明文 ws 会被浏览器混合内容拦截）。
    // 注意：ws 库的 WebSocketServer 不会自动升级 https，必须显式传 https server
    const projectRoot = resolve(__dirname, '../../../../../');
    // I3 协同态持久化：默认落盘 <projectRoot>/data/kb-collab
    this.persistDir = process.env.KB_COLLAB_PERSIST_DIR || resolve(projectRoot, 'data', 'kb-collab');
    // I3：注册 y-websocket 全局持久化（2.x 官方接入点，须在首个连接建立前完成）
    //  - bindState：连接时从 leveldb 恢复历史 doc，并监听 update 增量落盘
    //  - writeState：关闭时无需额外写回（增量已实时落盘）
    setPersistence({
      provider: this.getPersistence(),
      bindState: async (docName: string, ydoc: any) => {
        // I 修复（2026-08-19 上线前全检）：无论恢复是否成功都必须挂载 update 监听
        // （此前 getYDoc 失败时 catch 丢弃监听 → 该会话后续编辑永不落盘 = 潜在丢更新）
        const ldb = this.getPersistence();
        this.persistedDocs.add(docName);
        try {
          const persisted = await ldb.getYDoc(docName);
          Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
        } catch (e: any) {
          this.logger.warn(`kb-collab bindState load failed for ${docName}: ${e?.message} (listener still attached)`);
        }
        ydoc.on('update', (update: Uint8Array) => {
          ldb.storeUpdate(docName, update).catch((e: any) =>
            this.logger.warn(`kb-collab persist failed for ${docName}: ${e?.message}`),
          );
        });
      },
      writeState: async () => {},
    });
    // I 修复：周期压实增量日志（storeUpdate 只追加，长时间运行日志无界增长、加载变慢）
    const compactMs = Number(process.env.KB_COLLAB_COMPACT_INTERVAL_MS || 6 * 3600_000);
    if (Number.isFinite(compactMs) && compactMs > 0) {
      this.compactTimer = setInterval(() => {
        void this.compactPersistedDocs().catch((e: any) => this.logger.warn(`kb-collab compact failed: ${e?.message}`));
      }, compactMs);
      this.compactTimer.unref?.();
    }
    const certPath = process.env.HTTPS_CERT_PATH;
    const keyPath = process.env.HTTPS_KEY_PATH;
    const hasTls = certPath && keyPath;
    const server = hasTls
      ? createHttpsServer({
          key: readFileSync(resolve(projectRoot, keyPath!)),
          cert: readFileSync(resolve(projectRoot, certPath!)),
        })
      : undefined;
    this.wss = new WebSocketServer(hasTls && server ? { server, path: '/kb-collab' } : { port, path: '/kb-collab' });
    // 显式 https server 时需手动 listen（WebSocketServer({ server }) 不监听端口）
    if (hasTls && server) server.listen(port);
    this.wss.on('connection', (conn, req) => {
      // 鉴权：query token（显式）或 httpOnly cookie pinecone-access（同站 ws 握手自动携带，M-01 后主通道）
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || extractCookie(req.headers.cookie, 'pinecone-access');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        conn.close(4000, 'missing docName');
        return;
      }
      let payload: { sub?: string; userId?: string } | null = null;
      try {
        payload = this.jwtService.verify<{ sub?: string; userId?: string }>(token || '');
      } catch {
        conn.close(4001, 'unauthorized');
        return;
      }
      // I13 WS 房间授权（2026-08-18 P2）：docName=pageId → 校验 KB page 归属工作区 + 成员身份，
      // 修复跨工作区越权（A 工作区用户已知 pageId 即可 join 其它工作区页面协同）
      const userId = payload?.sub || payload?.userId;
      void this.authorizeCollab(userId, docName)
        .then((ok) => {
          if (!ok) {
            conn.close(4003, 'forbidden');
            return;
          }
          // docName 即 pageId（房间隔离），y-websocket 自动按 URL docName 分组
          // I3 协同态持久化：由全局 setPersistence（bindState）恢复 + 增量落盘
          setupWSConnection(conn, req, { gc: true });
        })
        .catch((e) => {
          this.logger.warn(`kb-collab authorize failed for ${docName}: ${e?.message}`);
          conn.close(4002, 'error');
        });
    });
    this.wss.on('listening', () => {
      this.logger.log(`KB collab ws listening on :${port}/kb-collab`);
    });
    this.wss.on('error', (e) => {
      // 端口被占不致命（REST 仍可用）；记录并继续
      this.logger.warn(`KB collab ws error: ${e.message}`);
    });
  }

  /** I 修复：对已打开文档做压实（重读 → storeState 合并，压缩 y-leveldb 增量日志） */
  private async compactPersistedDocs(): Promise<void> {
    const ldb = this.getPersistence();
    let n = 0;
    for (const docName of this.persistedDocs) {
      try {
        const ydoc = await ldb.getYDoc(docName);
        await ldb.storeState(docName, ydoc);
        n++;
      } catch (e: any) {
        this.logger.warn(`kb-collab compact failed for ${docName}: ${e?.message}`);
      }
    }
    if (n > 0) this.logger.log(`kb-collab compacted ${n} doc(s)`);
  }

  async onModuleDestroy() {
    if (this.compactTimer) clearInterval(this.compactTimer);
    this.wss?.close();
    // 关闭 leveldb 实例（释放 fd；I 修复：此前无 OnModuleDestroy，fd/连接泄漏）
    for (const p of this.persistCache.values()) {
      try {
        await p.destroy();
      } catch (e: any) {
        this.logger.warn(`kb-collab persistence destroy failed: ${e?.message}`);
      }
    }
    this.persistCache.clear();
  }
}
