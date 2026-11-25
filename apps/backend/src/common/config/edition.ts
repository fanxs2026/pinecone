/**
 * 版本（Edition）配置——社区版 / 企业版功能开关的唯一事实来源。
 *
 * 方案依据：deliverables/edition-isolation-plan-1.0.0.md
 * - PINE_EDITION=community | enterprise（默认 community，fail-closed）
 * - 企业版功能清单集中维护在 ENTERPRISE_FEATURES（后端拦截 + bootstrap 下发共用）
 * - 社区版部署：企业功能接口全部 403；数据表保留但不可读不可写
 *
 * 2026-11-25 强化（license 门禁）：
 *   把「声明版本」与「生效版本」分开——
 *     getPineEdition()          读 env，只代表部署意图
 *     getEffectiveEdition()     声明为 enterprise **且** license 有效才算企业版
 *   无 / 过期 / 签名错 / 格式错 → 一律降级 community（决策：不拒绝启动）。
 *   license 只认内置公钥验签，不读数据库（DB 客户可写，不能当凭证）。
 */
import { getLicenseStatus, isLicensed } from '../license/license-state';
import { isEnterprisePayloadPresent } from '../license/ee-payload';

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

/** 部署声明的版本（只看 env，不代表被授权） */
export function getPineEdition(): PineEdition {
  const raw = process.env.PINE_EDITION?.trim().toLowerCase();
  if (raw === 'enterprise') return 'enterprise';
  if (raw && raw !== 'community') {
    console.warn(`[Edition] Invalid PINE_EDITION "${process.env.PINE_EDITION}", falling back to community`);
  }
  return 'community';
}

/**
 * 实际生效的版本，三个条件同时满足才是 enterprise：
 *   1. PINE_EDITION=enterprise（部署意图）
 *   2. license 有效（被授权）
 *   3. 当前产物里确实有 EE 代码（CE 构建不含企业实现）
 * 其余一切情况 → community（降级，不拒绝启动）。
 */
export function getEffectiveEdition(): PineEdition {
  if (getPineEdition() !== 'enterprise') return 'community';
  if (!isLicensed()) return 'community';
  if (!isEnterprisePayloadPresent()) return 'community';
  return 'enterprise';
}

/** 判断企业功能是否对本部署启用（未授权一律 false） */
export function isEnterpriseFeatureEnabled(feature: EnterpriseFeatureKey): boolean {
  return getEffectiveEdition() === 'enterprise';
}

/** bootstrap 载荷：版本 + 启用的企业功能列表 + license 摘要（前端菜单/横幅用） */
export function getEditionBootstrap(): {
  edition: PineEdition;
  declaredEdition: PineEdition;
  enterpriseFeatures: EnterpriseFeatureKey[];
  eePayloadPresent: boolean;
  license: { state: string; reason: string; expiresAt?: number; customer?: string };
} {
  const edition = getEffectiveEdition();
  const license = getLicenseStatus();
  return {
    edition,
    declaredEdition: getPineEdition(),
    enterpriseFeatures: edition === 'enterprise' ? [...ENTERPRISE_FEATURES] : [],
    eePayloadPresent: isEnterprisePayloadPresent(),
    license: {
      state: license.state,
      reason: license.reason,
      expiresAt: license.payload?.expiresAt,
      customer: license.payload?.customer,
    },
  };
}
