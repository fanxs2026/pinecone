/**
 * 注册模式公共 helper（auth 与 registration-admin 共用，防两处逻辑漂移）。
 * fail-closed：生产未显式设置 REGISTRATION_MODE 时默认 whitelist（绝不静默开放）。
 * 非法值（public/带空格等）trim + 白名单校验后，生产回落 whitelist、开发回落 open。
 */
export function getEffectiveRegistrationMode(): string {
  const raw = process.env.REGISTRATION_MODE;
  const env = raw ? raw.trim().toLowerCase() : '';
  if (env === 'open' || env === 'whitelist' || env === 'invite') return env;
  if (env) {
    console.warn(
      `[RegistrationMode] Invalid REGISTRATION_MODE "${raw}", falling back to ${
        process.env.NODE_ENV === 'production' ? 'whitelist' : 'open'
      }`,
    );
  }
  return process.env.NODE_ENV === 'production' ? 'whitelist' : 'open';
}
