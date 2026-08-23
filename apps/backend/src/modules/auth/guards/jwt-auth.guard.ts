import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/**
 * 全局默认拒绝认证守卫（Phase 0-1 安全加固）。
 *
 * 注册为 APP_GUARD 后，所有未标注 @Public() 的端点默认要求有效 JWT——
 * 新模块（SSO 回调/审计导出/备份/回收站/Webhook）不会因漏写守卫而裸奔。
 *
 * 兼容说明：现有 controller 上的类级 @UseGuards(JwtAuthGuard) 保留（与全局
 * 守卫叠加执行，幂等无副作用），控制器守卫中的 WorkspaceRoleGuard 仍能
 * 读取到全局守卫填充的 req.user。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
