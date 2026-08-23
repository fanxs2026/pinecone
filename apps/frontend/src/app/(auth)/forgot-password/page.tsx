'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ emailSent: boolean; resetToken?: string } | null>(null);
  const t = useTranslations('auth');
  const c = useTranslations('common');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPassword({ email });
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.message || t('resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Pinecone</CardTitle>
          <CardDescription>{result ? (result.emailSent ? t('emailSentTitle') : t('resetSentTitle')) : t('forgotSubtitle')}</CardDescription>
          <LanguageSwitcher className="justify-center" />
        </CardHeader>

        {result ? (
          <CardContent className="space-y-4">
            {result.emailSent ? (
              <>
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                  {t('emailSentTitle')}
                </div>
                <p className="text-sm text-muted-foreground">{t('emailSentHint')}</p>
              </>
            ) : result.resetToken ? (
              <>
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                  {t('resetSentTitle')}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('resetLinkHint')} · {t('resetLinkExpire')}
                </p>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(result.resetToken)}`}
                  className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t('resetGo')}
                </Link>
              </>
            ) : (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                {t('emailMaybeSent')}
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                {t('backToLogin')}
              </Link>
            </p>
          </CardContent>
        ) : (
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
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? t('sendLoading') : t('sendReset')}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="font-medium text-primary hover:underline">
                  {t('backToLogin')}
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
