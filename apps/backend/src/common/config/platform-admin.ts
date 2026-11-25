/**
 * 平台管理员判定——唯一事实来源。
 *
 * 两条路径任一成立即视为平台管理员：
 *   1. users.isSystemAdmin = true（数据库，持久；首个注册用户自动授予时写入）
 *   2. 邮箱出现在 REGISTRATION_ADMIN_EMAILS（env，运维手工配置）
 *
 * 背景（2026-11-25）：此前 registration-admin / smtp-settings / license 三处各自
 * 复制了一份 split(',') 的邮箱判定，而 jwt.strategy 明明已经把
 * isSystemAdmin 放进了 req.user，却没有任何一处使用它 —— 列形同虚设。
 * 这里统一，避免三处再漂移。
 *
 * 注意：决定权在调用方，本文件不做抛错，也不碰数据库（req.user 已由
 * JwtStrategy 每次请求从库中读取，字段总是最新的）。
 */

const ENV_KEY = 'REGISTRATION_ADMIN_EMAILS';
const FIRST_USER_FLAG = 'FIRST_USER_BECOMES_ADMIN';

/** 解析后的邮箱名单（小写、trim、去空项；不支持多行，见 .env 注释） */
export function adminEmailList(): string[] {
  return (process.env[ENV_KEY] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** 邮箱是否在管理员名单里 */
export function isAdminEmail(email?: string | null): boolean {
  const list = adminEmailList();
  if (list.length === 0) return false;
  return list.includes((email || '').trim().toLowerCase());
}

/** 平台管理员判定（数据库标记 or 邮箱名单） */
export function isPlatformAdmin(
  user?: { email?: string | null; isSystemAdmin?: boolean } | null,
): boolean {
  if (!user) return false;
  if (user.isSystemAdmin === true) return true;
  return isAdminEmail(user.email);
}

/**
 * 是否允许「首个注册用户自动成为平台管理员」。
 * 默认关闭（fail-closed）；便携包在 .env 里显式置 true。
 *
 * 授予动作放在 auth.service.register 里（那里有 prisma），本文件只提供开关，
 * 保持零依赖、可单测。
 */
export function firstUserBecomesAdminEnabled(): boolean {
  return (process.env[FIRST_USER_FLAG] || '').trim().toLowerCase() === 'true';
}
