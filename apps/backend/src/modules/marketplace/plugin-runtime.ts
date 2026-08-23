import { createContext, runInContext } from 'vm';

/**
 * G11 插件 SDK 运行时（2026-08-19）。
 *
 * ⚠️ 安全说明（上线前全检 B2 修复）：
 * vm.createContext 不是安全边界——只要向沙箱注入任何宿主函数/对象
 * （setTimeout/fetch/Buffer/URL/console 等），插件即可经 `.constructor` 爬回宿主
 * Function 逃逸（`setTimeout.constructor('return process')().env`）。
 *
 * 修复后沙箱**零宿主引用**：
 *  - 不注入 console/fetch/setTimeout/Buffer/URL/process/require/globalThis
 *  - console 在 boot 代码内用 vm 原生函数实现（日志经 __hookResult 回传宿主）
 *  - 插件无任何 I/O 原语 → 无逃逸路径、无出网能力
 *  - 副作用（如 HTTP 通知）由宿主在执行钩子后根据返回值代理执行（见 MarketplaceService）
 *
 * 因此当前仅支持**第一方白名单插件**；开放第三方插件前必须改为 worker_thread /
 * isolated-vm 等真正隔离执行（见全检报告 B2 结构性修复项）。
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: 'WEBHOOK' | 'REPORT' | 'IMPORT' | 'KB' | 'OTHER';
  /** 声明支持的钩子（当前 onEvent） */
  hooks: string[];
  /** 插件代码（CommonJS，module.exports 暴露钩子函数） */
  code: string;
}

export function validateManifest(input: unknown): input is PluginManifest {
  if (!input || typeof input !== 'object') return false;
  const m = input as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.version === 'string' &&
    typeof m.description === 'string' &&
    Array.isArray(m.hooks) &&
    typeof m.code === 'string'
  );
}

const HOOK_TIMEOUT_MS = 2_000;

/** 钩子返回值规范：插件可返回 { url, ... } 请求宿主代发 HTTP（SSRF 校验在宿主侧） */
export interface PluginHookResult {
  /** 宿主代发出站请求的目标（仅 http/https；SSRF 校验由宿主执行） */
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * 在 vm 沙箱内执行插件代码并调用指定钩子。
 *
 * 沙箱零宿主引用（B2 修复）：唯一可写槽位 __hookResult 初始为 undefined；
 * console 由 boot 代码在 vm 域内实现，日志以数组回传，由宿主统一输出。
 *
 * @param code 插件代码（module.exports 暴露钩子）
 * @param hookName 钩子名（如 onEvent）
 * @param ctx 传给钩子的上下文（eventName / payload / config）
 */
export async function executePluginHook(
  code: string,
  hookName: string,
  ctx: Record<string, unknown>,
): Promise<PluginHookResult | undefined> {
  const sandbox: Record<string, unknown> = {
    // 注意：这里绝不能出现宿主函数/对象（B2 修复核心）
    __hookResult: undefined as unknown,
  };
  const vmContext = createContext(sandbox);
  const boot = `
    (function () {
      var __logs = [];
      // vm 域内原生 console（无宿主引用，逃逸无门）
      var console = {
        log: function () { __logs.push(Array.prototype.slice.call(arguments).map(String).join(' ')); },
        warn: function () { __logs.push('WARN ' + Array.prototype.slice.call(arguments).map(String).join(' ')); },
        error: function () { __logs.push('ERROR ' + Array.prototype.slice.call(arguments).map(String).join(' ')); }
      };
      var module = { exports: {} };
      var exports = module.exports;
      try {
        ${code}
      } catch (e) {
        __hookResult = { __bootError: String(e && e.message || e), __logs: __logs };
        return;
      }
      __hookResult = { __hooks: module.exports, __logs: __logs };
    })();
  `;
  runInContext(boot, vmContext, { timeout: HOOK_TIMEOUT_MS });
  const result = sandbox.__hookResult as
    | { __bootError?: string; __hooks?: Record<string, unknown>; __logs?: string[] }
    | undefined;
  if (!result) return undefined;
  for (const line of result.__logs ?? []) {
    console.log('[plugin]', line);
  }
  if (typeof result.__bootError === 'string') {
    throw new Error(result.__bootError);
  }
  const hooks = result.__hooks;
  if (!hooks || typeof hooks[hookName] !== 'function') {
    return undefined; // 插件未实现该钩子 → 静默跳过
  }
  const hookResult = (await Promise.race([
    (hooks as Record<string, (c: Record<string, unknown>) => unknown>)[hookName](ctx),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`plugin hook timeout (${HOOK_TIMEOUT_MS}ms)`)), HOOK_TIMEOUT_MS)),
  ])) as PluginHookResult | null | undefined;
  if (!hookResult || typeof hookResult !== 'object') return undefined;
  return hookResult;
}
