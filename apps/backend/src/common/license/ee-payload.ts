/**
 * EE 代码是否存在于当前构建产物中（运行时探测）。
 *
 * 背景：PINE_EDITION=enterprise + 有效 license，只代表「被授权」；CE 构建里
 * 根本没有 @ee 模块（编译产物不含企业实现）。若不探测就 import，
 * Nest 会在启动阶段抛 module not found 直接崩溃 —— 2026-11-25 实测到该问题。
 *
 * 因此「生效版本」= 声明 enterprise + license 有效 + EE 代码存在。
 * 三者缺一，一律降级社区版，服务照常可用。
 */
export const EE_MODULE_PROBE = '@ee/license/license.module';

let cached: boolean | null = null;

export function isEnterprisePayloadPresent(): boolean {
  if (cached !== null) return cached;
  try {
    // 同步解析：不真正加载模块，只确认可解析
    require.resolve(EE_MODULE_PROBE);
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** 仅测试用 */
export function __resetEnterprisePayloadCache(): void {
  cached = null;
}
