'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';
import { realtimeUrl } from '@/lib/runtime-config';

// 运行期解析（见 lib/runtime-config.ts）：不能放在模块顶层求值，
// 否则 client component 在 SSR 阶段就被求值成 '/ws' 并缓存下来。

interface RealtimeHandlers {
  onActivity?: (data: any) => void;
  onStoryUpdated?: (data: any) => void;
  onIdeaUpdated?: (data: any) => void;
  onNotification?: (data: any) => void;
}

export function useRealtime(workspaceId: string | null, handlers?: RealtimeHandlers) {
  const socketRef = useRef<Socket | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // P2-②：不再要求内存态 accessToken——M-01 后 token 在 httpOnly cookie（pinecone-access），
    // 刷新页面后内存 token 为空，但 cookie 由浏览器在 WebSocket 握手时自动携带；
    // 内存有 token 时仍显式传递（兼容 & 更快），没有则完全依赖 cookie。
    if (!isAuthenticated) return;

    const socket = io(realtimeUrl(), {
      ...(accessToken ? { auth: { token: accessToken } } : {}),
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      if (workspaceId) {
        socket.emit('join:workspace', workspaceId);
      }
    });

    socket.on('activity', (data) => handlers?.onActivity?.(data));
    socket.on('story:updated', (data) => handlers?.onStoryUpdated?.(data));
    socket.on('idea:updated', (data) => handlers?.onIdeaUpdated?.(data));
    socket.on('notification:new', (data) => handlers?.onNotification?.(data));

    socketRef.current = socket;

    return () => {
      if (workspaceId) {
        socket.emit('leave:workspace', workspaceId);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, accessToken, workspaceId]);

  return socketRef;
}
