import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceUserId =
      request.params.userId || request.body?.userId;

    if (!resourceUserId) {
      // No userId to check — ownership verification cannot be performed
      throw new ForbiddenException('Ownership verification requires a userId');
    }

    if (request.workspaceMember?.role === 'ADMIN') {
      return true;
    }

    if (user.id !== resourceUserId) {
      throw new ForbiddenException('You can only modify your own resources');
    }

    return true;
  }
}
