/**
 * 版本（Edition）配置——社区版 / 企业版功能开关的唯一事实来源。
 *
 * 方案依据：deliverables/edition-isolation-plan-1.0.0.md
 * - PINE_EDITION=community | enterprise（默认 community，fail-closed）
 * - 企业版功能清单集中维护在 ENTERPRISE_FEATURES（后端拦截 + bootstrap 下发共用）
 * - 社区版部署：企业功能接口全部 403；数据表保留但不可读不可写
 */
export type PineEdition = 'community' | 'enterprise';

/** 企业版功能 key 全集（新增企业功能 = 在这里加一个 key，并在控制器打标） */
export const ENTERPRISE_FEATURES = [
  'sso',         // SSO / OIDC / SAML
  'scim',        // SCIM 2.0 用户预配
  'audit',       // 操作审计
  'github',      // GitHub 代码集成
  'webhook',     // Webhook 出站推送
  'webhook-inbound', // Webhook 入站回调（2026-08-19 老板拍板：入站归企业版，与出站同口径）
  'ci',          // CI 集成（结果回写/覆盖率报表/门禁，2026-08-19 老板拍板：归企业版）
  'automation',  // 自动化规则引擎
  'api-token',   // API Token
  'teams',       // 团队管理
  'trash',       // 回收站（加密备份/回收站）
  'ai',          // AI 增强（摘要/拆解）
  'okr',         // OKR 目标对齐
] as const;

export type EnterpriseFeatureKey = (typeof ENTERPRISE_FEATURES)[number];

/** 当前部署版本：PINE_EDITION 环境变量；非法值/未配置 → community（fail-closed，绝不静默开放企业功能） */
export function getPineEdition(): PineEdition {
  const raw = process.env.PINE_EDITION?.trim().toLowerCase();
  if (raw === 'enterprise') return 'enterprise';
  if (raw && raw !== 'community') {
    console.warn(`[Edition] Invalid PINE_EDITION "${process.env.PINE_EDITION}", falling back to community`);
  }
  return 'community';
}

/** 判断企业功能是否对本部署启用（community 一律 false） */
export function isEnterpriseFeatureEnabled(feature: EnterpriseFeatureKey): boolean {
  return getPineEdition() === 'enterprise';
}

/** bootstrap 载荷：版本 + 启用的企业功能列表（前端菜单/入口过滤用） */
export function getEditionBootstrap(): { edition: PineEdition; enterpriseFeatures: EnterpriseFeatureKey[] } {
  const edition = getPineEdition();
  return {
    edition,
    enterpriseFeatures: edition === 'enterprise' ? [...ENTERPRISE_FEATURES] : [],
  };
}
