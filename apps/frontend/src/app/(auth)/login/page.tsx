'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { KeyRound, Loader2 } from 'lucide-react';

interface SsoProvider {
  id: string;
  name: string;
  providerType: string;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState('');
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const t = useTranslations('auth');
  const c = useTranslations('common');

  // 查询可用 SSO（登录页直接列出全部活跃 provider）
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/auth/sso/providers`)
      .then((r) => r.json())
      .then((data) => setSsoProviders(Array.isArray(data) ? data : []))
      .catch(() => setSsoProviders([]));
  }, []);

  const handleSso = async (providerId: string, providerType?: string) => {
    setSsoLoading(providerId);
    setError('');
    try {
      // SAML 与 OIDC 走不同的发起端点
      const endpoint =
        providerType === 'SAML'
          ? `/auth/saml/${providerId}/login`
          : `/auth/sso/${providerId}/authorize`;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}${endpoint}`,
        { headers: { Origin: window.location.origin } },
      );
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url; // 跳转企业 IdP
      } else {
        setError(data?.message || t('ssoFailed'));
      }
    } catch (err: any) {
      setError(err?.message || t('ssoFailed'));
    } finally {
      setSsoLoading('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login({ email, password });
      setAuth(res.user, res.accessToken);
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.message || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Pinecone</CardTitle>
          <CardDescription>{t('loginSubtitle')}</CardDescription>
          <LanguageSwitcher className="justify-center" />
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{c('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{c('password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('loginLoading') : c('login')}
            </Button>
            {ssoProviders.length > 0 && (
              <>
                <div className="flex w-full items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{t('ssoDivider')}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {ssoProviders.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!!ssoLoading}
                    onClick={() => handleSso(p.id, p.providerType)}
                  >
                    {ssoLoading === p.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" />
                    )}
                    {t('ssoLoginWith', { name: p.name })}
                  </Button>
                ))}
              </>
            )}
            <p className="text-center text-sm text-muted-foreground">
              {t('noAccount')}{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                {t('registerNow')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
