import { Controller, Post, Get, Body, UseGuards, Req, Res, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_COOKIE = 'pinecone-refresh';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days, matches refresh token lifetime

// M-01：access token 也走 httpOnly cookie（前端不再存 localStorage，XSS 无法窃取）
const ACCESS_COOKIE = 'pinecone-access';
const ACCESS_MAX_AGE = 60 * 60 * 1000; // 1 hour, matches JWT expiresIn

// Cookie 策略说明（修复"详情页没有工作区"——跨 scheme cookie 不发送）：
// - 前端 http://localhost:6173 → 后端 https://localhost:3000 是跨 scheme（cross-site），
//   SameSite=Lax 的 cookie 在跨站 fetch 时不发送 → API 全 401 → 弹回登录页。
// - dev（后端 http + 前端 http，同站 localhost）：SameSite=Lax + Secure=false，
//   无证书/混合内容问题（2026-08-09 修复：HTTPS_ENABLED=false 后前后端同站）。
// - 生产：同 scheme 部署保持 Lax；P1-④ 修复——Secure 自动随请求 TLS 状态：
//   直连 HTTPS（req.secure）或反代 x-forwarded-proto: https 时自动 Secure，
//   显式 COOKIE_SECURE=true 仍可强制（F-003/P2-2 兼容）。
function cookieSecure(res: Response): boolean {
  const env = process.env.COOKIE_SECURE;
  if (env !== undefined && env !== '') return env === 'true' || env === '1';
  const req: any = res.req;
  return req?.secure === true || req?.headers?.['x-forwarded-proto'] === 'https';
}

function setAccessCookie(res: Response, token: string) {
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(res),
    maxAge: ACCESS_MAX_AGE,
    path: '/',
  });
}

function clearAccessCookie(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(res),
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

/**
 * 同源校验（防登录 CSRF / 跨站 logout）。
 *
 * 关键认知（Verify2 P0 修复，2026-08-07）：开发拓扑 http://localhost:6173 → https://localhost:3000
 * 按 RFC 6265bis（site = scheme + domain）是 **cross-site**——真实浏览器对此类请求发送
 * `Sec-Fetch-Site: cross-site`。若以 SFS 为最高优先级会误杀真实浏览器合法请求（logout 403）。
 *
 * 正确策略：**Origin 优先**（浏览器跨站 POST 必带 Origin，且浏览器自动生成、不可伪造）：
 * - Origin 存在 → 比较 hostname（忽略 scheme 与端口）：同 hostname 放行（跨 scheme/跨端口同源合法），
 *   不同 hostname 拒绝（攻击者站点）。
 * - Origin 缺失（curl / 同站导航 / 老浏览器）→ 放行（宽松；攻击者跨站时浏览器必带 Origin）。
 * - Sec-Fetch-Site 仅作补充参考，不因 cross-site 单独拒绝（避免误杀跨 scheme 合法请求）。
 */
function isSameSiteRequest(req: any): boolean {
  const origin: string | undefined = req?.headers?.origin;
  if (origin) {
    try {
      const o = new URL(origin);
      // Express req.hostname 已剥离端口；URL.hostname 也不含端口——忽略端口（跨端口同 hostname 合法）
      if (o.hostname !== String(req?.hostname || '')) return false;
    } catch {
      return false; // 畸形 Origin 一律拒绝
    }
  }
  return true;
}

// Minimal cookie parser (avoids adding a cookie-parser dependency).
// Refresh token is only ever sent via the httpOnly cookie; the body field is
// kept for API clients (e.g. Swagger) that cannot manage cookies.
function readRefreshToken(req: any, dtoToken?: string): string {
  const header: string | undefined = req?.headers?.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      // F-02：畸形 URL 编码（%ZZ 等）→ 视为无此 cookie，避免 URIError → 500
      if (key === REFRESH_COOKIE) {
        try {
          return decodeURIComponent(part.slice(idx + 1).trim());
        } catch {
          return '';
        }
      }
    }
  }
  return dtoToken || '';
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // P3-5 修复：公开注册模式（供注册页提示是否需要邀请码/白名单；不敏感）
  @Public()
  @Get('registration-mode')
  @ApiOperation({ summary: 'Get current registration mode (open|whitelist|invite)' })
  getRegistrationMode() {
    return { mode: this.authService.getRegistrationMode() };
  }

  // Credential endpoints: 10 attempts/min per IP (brute-force mitigation, OWASP A07)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    setRefreshCookie(res, result.refreshToken);
    setAccessCookie(res, result.accessToken);
    const { refreshToken, ...safe } = result;
    return safe;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    setRefreshCookie(res, result.refreshToken);
    setAccessCookie(res, result.accessToken);
    const { refreshToken, ...safe } = result;
    return safe;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Req() req: any,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 🟠 登录 CSRF 防护：body 兜底（非 cookie）可被跨站 HTML 表单利用写入攻击者会话 cookie。
    // 凡 token 来自 body 而非 cookie，必须同源（Origin/Sec-Fetch-Site 校验）。
    if (dto?.refreshToken && !isSameSiteRequest(req)) {
      throw new ForbiddenException('Cross-site refresh is not allowed');
    }
    const token = readRefreshToken(req, dto?.refreshToken);
    const result = await this.authService.refresh(token);
    setRefreshCookie(res, result.refreshToken);
    setAccessCookie(res, result.accessToken);
    const { refreshToken, ...safe } = result;
    return safe;
  }

  // 忘记密码：5 次/min/IP（防邮箱枚举轰炸，OWASP A07）
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset token' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // 重置密码：10 次/min/IP
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with a one-time token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  // F-01 修复：logout 不依赖 access token（过期 access 也能注销）——
  // 凭 refresh cookie 撤销服务端 hash + 无条件清双 cookie。
  // 必须 @Public()：全局守卫下若要求有效 JWT，"过期 access 也能注销"的容错会失效。
  @Public()
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token (works even with expired access token)' })
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    // CSRF 纵深防护：跨站请求不得触发注销（仅同站/无来源标识请求放行）
    if (!isSameSiteRequest(req)) {
      throw new ForbiddenException('Cross-site logout is not allowed');
    }
    // 优先用 refresh cookie 定位会话；access token 有效时也可用 userId
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      await this.authService.logoutByRefreshToken(refreshToken);
    } else if (req.user?.id) {
      await this.authService.logout(req.user.id);
    }
    clearRefreshCookie(res);
    clearAccessCookie(res);
    return { message: 'Logged out successfully' };
  }
}
