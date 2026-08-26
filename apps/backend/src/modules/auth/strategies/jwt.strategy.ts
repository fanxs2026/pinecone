import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { getSecret } from '../../../common/config/env-secrets';

// M-01：access token 可从 httpOnly cookie（pinecone-access）读取，
// 前端无需在 JS 内存持有 token（XSS 无法窃取）
const ACCESS_COOKIE = 'pinecone-access';

function extractAccessTokenFromCookie(req: any): string | null {
  const header: string | undefined = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    // F-02：畸形 URL 编码（%ZZ 等）→ 视为无此 cookie（401），避免 URIError → 500
    if (key === ACCESS_COOKIE) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractAccessTokenFromCookie,
      ]),
      ignoreExpiration: false,
      // 算法钉死：防 alg 混淆/none 算法攻击（OWASP JWT 最佳实践）
      algorithms: ['HS256'],
      secretOrKey: getSecret('JWT_ACCESS_SECRET', 32),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    // 账号被禁用：即使 access token 未过期也立即拒绝（管理员禁用即时生效）
    if (user.active === false) {
      throw new UnauthorizedException('Account is disabled');
    }
    return { id: user.id, email: user.email, name: user.name, isSystemAdmin: user.isSystemAdmin === true };
  }
}
