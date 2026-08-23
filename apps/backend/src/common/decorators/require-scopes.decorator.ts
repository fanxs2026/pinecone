import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiTokenGuard } from '../guards/api-token.guard';

export const REQUIRED_SCOPES_KEY = 'required_scopes';

/**
 * P2 API scope 强制（2026-08-19）：标注端点所需 API Token scopes。
 * 用法：@RequireScopes('ideas:write') —— token.scopes 必须包含全部所需 scope，否则 403。
 * 端点同时挂 ApiTokenGuard（本装饰器自动带）。
 */
export function RequireScopes(...scopes: string[]) {
  return applyDecorators(
    SetMetadata(REQUIRED_SCOPES_KEY, scopes),
    UseGuards(ApiTokenGuard),
    ApiBearerAuth(),
  );
}
