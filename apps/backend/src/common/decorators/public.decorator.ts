import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记端点为公开（无需 JWT 认证）。
 *
 * 配合全局 JwtAuthGuard（APP_GUARD）使用——默认所有端点都要求有效
 * JWT，只有显式标注 @Public() 的端点（登录/注册/refresh/health 等）
 * 才放行。新模块的公开回调（如 SSO 回调、Webhook 接收）必须显式标注，
 * 否则会默认拒绝（401）。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
