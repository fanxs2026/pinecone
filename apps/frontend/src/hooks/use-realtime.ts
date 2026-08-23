'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';

// 2026-08-15 修复：后端 3000 是 HTTPS（HTTPS_ENABLED=true），默认 ws 地址必须用 https:// 前缀，
// 否则 Socket.IO 连 http 端口必然失败 → 客户端无限重连（浪费资源且控制台刷错）
const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'https://localhost:3000/ws';

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

    const socket = io(SOCKET_URL, {
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
