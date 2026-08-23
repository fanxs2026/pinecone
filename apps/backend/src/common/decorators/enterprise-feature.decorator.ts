import { SetMetadata } from '@nestjs/common';
import { EnterpriseFeatureKey } from '../config/edition';

export const ENTERPRISE_FEATURE_KEY = 'enterpriseFeature';

/**
 * 标记 Controller 为「企业版功能」（安全防线第一层：元数据标记）。
 *
 * 配合全局 EnterpriseFeatureGuard 使用：社区版部署（PINE_EDITION=community）
 * 下，所有标记了该装饰器的端点返回 403；企业版部署放行。
 *
 * 用法仿照现有 @Roles()：
 *   @EnterpriseFeature('sso')
 *   @Controller('workspaces/:wsId/sso-providers')
 *   export class SsoController { ... }
 *
 * 注意：前端隐藏 ≠ 安全，后端必须 403 拦截（直接 curl 可绕过菜单）。
 */
export const EnterpriseFeature = (feature: EnterpriseFeatureKey) =>
  SetMetadata(ENTERPRISE_FEATURE_KEY, feature);
