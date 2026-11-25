/**
 * 运行时地址解析（便携版/私有化部署核心）。
 *
 * 背景：NEXT_PUBLIC_* 是**构建期文本替换**，一旦打进 JS 就固定了，
 * 换端口/换域名必须重新构建。便携版要"一份构建通吃 localhost、127.0.0.1、
 * 局域网 IP、域名"，所以把地址判定挪到运行期。
 *
 * 解析优先级（高 → 低）：
 *   1. process.env.NEXT_PUBLIC_*   —— 构建期显式注入（Docker/托管部署用，可能是
 *      无反代的域名，不能靠推导）
 *   2. window.__PINECONE_RUNTIME__ —— 启动时由 bin/run-frontend.js 依据 .env 生成
 *      /runtime-config.js 注入（便携版改端口只改 .env，不用重打包）
 *   3. 从 window.location 推导     —— 同主机 + .env 里的后端端口
 *
 * 所有推导出的地址都用当前页面的 protocol/hostname，因此同一份产物在任何
 * 主机名下都自洽。
 */
export interface PineconeRuntime {
  /** 后端 API 端口，默认 3000 */
  backendPort?: number;
  /** 前端页面端口，默认 6173（仅用于日志展示） */
  frontendPort?: number;
  /** 完整覆盖，优先级高于端口推导（用于反代到不同路径的场景） */
  apiUrl?: string;
  wsUrl?: string;
  kbCollabUrl?: string;
  /** KB 协同 WS 端口（后端独立监听，默认 3002） */
  kbCollabPort?: number;
  /** 后端走 HTTPS 而页面是 HTTP 时置 true（便携版默认关闭） */
  secureApi?: boolean;
}

declare global {
  interface Window {
    __PINECONE_RUNTIME__?: PineconeRuntime;
  }
}

function runtime(): PineconeRuntime {
  if (typeof window === 'undefined') return {};
  return window.__PINECONE_RUNTIME__ || {};
}

function browserOrigin(): { hostname: string; secure: boolean } | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return {
    hostname: window.location.hostname,
    secure: window.location.protocol === 'https:',
  };
}

/** REST 基址，形如 http://192.168.1.50:3000/api */
export function apiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit;

  const rt = runtime();
  if (rt.apiUrl) return rt.apiUrl;

  const origin = browserOrigin();
  if (!origin) return '/api'; // SSR 期间只在服务端渲染，不需要绝对地址

  const port = rt.backendPort ?? 3000;
  const secure = rt.secureApi ?? origin.secure;
  return `${secure ? 'https' : 'http'}://${origin.hostname}:${port}/api`;
}

/** Socket.IO 基址，形如 ws://192.168.1.50:3000/ws */
export function realtimeUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;

  const rt = runtime();
  if (rt.wsUrl) return rt.wsUrl;

  const origin = browserOrigin();
  if (!origin) return '/ws';

  const port = rt.backendPort ?? 3000;
  const secure = rt.secureApi ?? origin.secure;
  return `${secure ? 'wss' : 'ws'}://${origin.hostname}:${port}/ws`;
}

/** KB 协同 WS 地址；返回 null 表示由调用方保留自己的同源兜底逻辑 */
export function kbCollabUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_KB_COLLAB_URL;
  if (explicit) return explicit;

  const rt = runtime();
  if (rt.kbCollabUrl) return rt.kbCollabUrl;

  return null;
}

/** KB 协同默认端口（后端 kb-collab 独立监听 3002） */
export function kbCollabPort(): number {
  return runtime().kbCollabPort ?? 3002;
}
