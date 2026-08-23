import { AsyncLocalStorage } from 'async_hooks';

/**
 * 请求级上下文（2026-08-19，设置·系统管理可读性）：
 * 用 AsyncLocalStorage 在 HTTP 边界捕获客户端 IP，供 ActivitiesService.log 等
 * service 层（无 req 引用）读取——避免给 20+ 个调用点逐个传参。
 *
 * 用法：
 *  - main.ts：app.use((req, _res, next) => runWithRequestContext({ ip: req.ip }, () => next()))
 *  - service：const ip = getClientIp(); // 请求链路内调用即取到
 *
 * 注意：仅覆盖 Express 请求链路（WebSocket 握手不走此中间件，但 activity 均经 HTTP 记录）。
 */
export interface RequestContext {
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(ctx: RequestContext, next: () => void): void {
  storage.run(ctx, next);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getClientIp(): string | undefined {
  return storage.getStore()?.ip;
}
