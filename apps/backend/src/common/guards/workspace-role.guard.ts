import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const workspaceId = request.params.wsId || request.params.id;
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID required');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspaceId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    const roleHierarchy = ['VIEWER', 'MEMBER', 'ADMIN'];
    const userRoleLevel = roleHierarchy.indexOf(membership.role);
    const minRequiredLevel = Math.min(
      ...requiredRoles.map((r) => roleHierarchy.indexOf(r)),
    );

    // P2-14 修复：未知角色 fail-closed（indexOf=-1 时 -1<min 恒真曾导致永远放行）
    if (userRoleLevel === -1 || minRequiredLevel === -1) {
      throw new ForbiddenException('Invalid workspace role');
    }

    if (userRoleLevel < minRequiredLevel) {
      throw new ForbiddenException('Insufficient workspace role');
    }

    request.workspaceMember = membership;
    return true;
  }
}
