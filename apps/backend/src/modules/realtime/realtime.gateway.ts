import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getSecret } from '../../common/config/env-secrets';
import { getRedisClient } from '../../common/redis/redis-client';

/** 与 auth.controller 的 ACCESS_COOKIE 保持一致（M-01：access token 存 httpOnly cookie） */
const ACCESS_COOKIE = 'pinecone-access';

// F-6 修复（2026-08-19 上线前全检）：FRONTEND_URL 支持逗号分隔多源，解析为数组给 socket.io
// （此前直接把逗号串当单一 origin，多前端源时 WS CORS 错配）
const WS_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:6173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

@Injectable()
@WebSocketGateway({
  cors: {
    origin: WS_ORIGINS,
    credentials: true,
  },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<string, Set<string>>();

  /** Phase 0-2：单用户最大并发连接数（防连接洪水 DoS + 用户侧内存放大） */
  private static readonly MAX_CONNS_PER_USER = 10;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    // P2-②：token 来源放宽为「auth.token 显式传递 OR httpOnly cookie(pinecone-access)」——
    // M-01 后 access token 在 httpOnly cookie，前端 JS 读不到；页面刷新后内存 token 清空，
    // 若只认 handshake.auth.token 则 WebSocket 断连、实时功能失效。cookie 由浏览器自动携带。
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, { secret: getSecret('JWT_ACCESS_SECRET', 32) }) as { sub: string; email: string };
      const userId = payload.sub;
      void this.setupConnection(client, userId);
    } catch {
      client.disconnect();
    }
  }

  /** 从握手提取 JWT：优先 auth.token（显式传递），其次解析 httpOnly cookie（M-01 架构） */
  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const cookie = client.handshake.headers?.cookie as string | undefined;
    if (cookie) {
      for (const part of cookie.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === ACCESS_COOKIE) {
          try {
            return decodeURIComponent(part.slice(idx + 1).trim());
          } catch {
            return undefined; // 畸形 URL 编码 → 视为无此 cookie（与 auth.controller 同策略）
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Phase 0-2 加固：
   * 1. active 复查——被禁用用户的连接直接断开（禁用即时生效，不留活连接收事件）
   * 2. 单用户连接数上限——防连接洪水（每用户 MAX_CONNS_PER_USER，超出拒绝新连接）
   * 3. 正常断开清理由 handleDisconnect 兜底，连接数上限同时限制异常泄漏规模
   */
  private async setupConnection(client: Socket, userId: string) {
    try {
      // ① active 复查
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { active: true },
      });
      if (!user || !user.active) {
        client.disconnect();
        return;
      }

      // ② 连接数上限（F-5 修复 2026-08-19：Redis 共享计数，多实例一致；Redis 不可用回退进程内 Map）
      const redis = getRedisClient();
      if (redis) {
        const key = `ws:conns:${userId}`;
        try {
          const n = await redis.incr(key);
          if (n === 1) await redis.expire(key, 86_400); // 1 天 TTL 防泄漏
          if (n > RealtimeGateway.MAX_CONNS_PER_USER) {
            await redis.decr(key).catch(() => undefined);
            client.disconnect();
            return;
          }
        } catch {
          // Redis 异常 → 回退内存计数
          const existingMem = this.userSockets.get(userId);
          if (existingMem && existingMem.size >= RealtimeGateway.MAX_CONNS_PER_USER) {
            client.disconnect();
            return;
          }
        }
      } else {
        const existingMem = this.userSockets.get(userId);
        if (existingMem && existingMem.size >= RealtimeGateway.MAX_CONNS_PER_USER) {
          client.disconnect();
          return;
        }
      }

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Store userId on socket for later use
      (client as any).userId = userId;

      // Join workspace rooms from query — only if the user is a member
      const workspaceIds = client.handshake.query.workspaceIds as string | undefined;
      if (workspaceIds) {
        const ids = Array.isArray(workspaceIds) ? workspaceIds : workspaceIds.split(',');
        void this.joinWorkspaceRooms(client, userId, ids);
      }
    } catch {
      client.disconnect();
    }
  }

  private async joinWorkspaceRooms(client: Socket, userId: string, workspaceIds: string[]) {
    for (const wsId of workspaceIds) {
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: wsId, userId } },
        select: { id: true },
      });
      if (membership) {
        client.join(`workspace:${wsId}`);
      }
    }
  }

  private async isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    return !!membership;
  }

  handleDisconnect(client: Socket) {
    // F-5：Redis 共享计数递减（与连接时对称；Redis 不可用时无副作用）
    const uid = (client as any).userId as string | undefined;
    if (uid) {
      const redis = getRedisClient();
      if (redis) void redis.decr(`ws:conns:${uid}`).catch(() => undefined);
    }
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }

  @SubscribeMessage('join:workspace')
  async handleJoinWorkspace(client: Socket, workspaceId: string) {
    const userId = (client as any).userId as string | undefined;
    if (!userId || !workspaceId) return;
    // SECURITY: only allow joining rooms the user is a member of
    if (await this.isWorkspaceMember(userId, workspaceId)) {
      client.join(`workspace:${workspaceId}`);
    }
  }

  @SubscribeMessage('leave:workspace')
  handleLeaveWorkspace(client: Socket, workspaceId: string) {
    if (!workspaceId) return;
    client.leave(`workspace:${workspaceId}`);
  }

  // Emit events to workspace members
  emitToWorkspace(workspaceId: string, event: string, data: any) {
    this.server.to(`workspace:${workspaceId}`).emit(event, data);
  }

  // Emit to specific user across all their devices
  emitToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }
}
