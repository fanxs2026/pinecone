import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { isPlatformAdmin } from '../config/platform-admin';

/**
 * 平台级管理员守卫（Phase 2-①）。
 * 仅用于平台管理面（License 管理 / 活跃实例 / 审计 / 全局用户），
 * 与工作区 WorkspaceRoleGuard 正交。
 *
 * 2026-11-26 修复：原实现只认 `user.isSystemAdmin === true`，漏掉了
 * REGISTRATION_ADMIN_EMAILS 这条路径 —— 而 .env 里配置名单是最常见的做法
 * （部署包默认走这条），结果运维配了名单却被 403。
 * 统一走 common/config/platform-admin 的 isPlatformAdmin（数据库标记 OR 邮箱名单），
 * 与 registration-admin / smtp-settings / license 的判定口径一致。
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (!isPlatformAdmin(user)) {
      throw new ForbiddenException('System admin access required');
    }
    return true;
  }
}
