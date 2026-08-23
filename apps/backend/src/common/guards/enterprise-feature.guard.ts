import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENTERPRISE_FEATURE_KEY } from '../decorators/enterprise-feature.decorator';
import { EnterpriseFeatureKey, isEnterpriseFeatureEnabled } from '../config/edition';

/**
 * 企业版功能守卫（安全防线：后端接口级拦截）。
 *
 * 注册为 APP_GUARD：读取 handler/class 上的 @EnterpriseFeature('key') 元数据，
 * 若标记了企业功能但当前部署未启用（社区版）→ 403 Forbidden。
 * 未标记的端点（社区功能）一律放行。
 *
 * 与其他 APP_GUARD 的叠加顺序无关紧要：此守卫只做「企业功能开关」判断，
 * 不影响 JWT 认证与角色校验（它们照常执行）。
 */
@Injectable()
export class EnterpriseFeatureGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<EnterpriseFeatureKey | undefined>(
      ENTERPRISE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true; // 非企业功能，放行

    if (!isEnterpriseFeatureEnabled(feature)) {
      throw new ForbiddenException(
        `This feature (${feature}) is available in Pinecone Enterprise only`,
      );
    }
    return true;
  }
}
