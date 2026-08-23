import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * 平台级管理员守卫（Phase 2-①）。
 * 要求 JWT 用户为系统管理员（User.isSystemAdmin === true）——仅用于平台管理面
 * （审计查询/备份管理/全局用户管理），与工作区 WorkspaceRoleGuard 正交。
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.isSystemAdmin !== true) {
      throw new ForbiddenException('System admin access required');
    }
    return true;
  }
}
