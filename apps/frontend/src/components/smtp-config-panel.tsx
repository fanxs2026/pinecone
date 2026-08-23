'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smtpSettingsApi, type SmtpConfigView } from '@/lib/api-client';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Mail, Save, Send, Loader2, ShieldAlert } from 'lucide-react';

/**
 * 设置页「邮件服务 SMTP」页签（2026-08-21）
 * 平台级配置：仅 REGISTRATION_ADMIN_EMAILS 名单可读写（后端 403 兜底）。
 * 保存后立即生效（DB 配置覆盖 .env）；授权码加密落库、不回显。
 */
export function SmtpConfigPanel() {
  const t = useTranslations('smtpConfig');
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{ host: string; port: string; user: string; pass: string; from: string }>({
    host: '',
    port: '465',
    user: '',
    pass: '',
    from: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['admin-smtp-config'],
    queryFn: async () => {
      try {
        const { data } = await smtpSettingsApi.get();
        if (!loaded) {
          setForm({
            host: data.host || '',
            port: String(data.port || 465),
            user: data.user || '',
            pass: '',
            from: data.from || '',
          });
          setLoaded(true);
        }
        return data;
      } catch (e: any) {
        if (e?.response?.status === 403) setForbidden(true);
        throw e;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      smtpSettingsApi.save({
        host: form.host.trim(),
        port: Number(form.port) || 465,
        user: form.user.trim(),
        pass: form.pass.trim() || undefined,
        from: form.from.trim() || undefined,
      }),
    onSuccess: (res) => {
      showToast(t('saved'));
      setForm((f) => ({ ...f, pass: '' })); // 清空密码框
      queryClient.invalidateQueries({ queryKey: ['admin-smtp-config'] });
      setForbidden(false);
      void res;
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg[0] : (msg || t('saveFailed')));
    },
  });

  const testMutation = useMutation({
    mutationFn: () => smtpSettingsApi.sendTest(),
    onSuccess: (res) => {
      showToast(res.data.ok ? t('testOk') : `${t('testFailed')}：${res.data.message}`);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg[0] : (msg || t('testFailed')));
    },
  });

  if (forbidden) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
          <ShieldAlert className="h-5 w-5" />
          <span>{t('adminOnly')}</span>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  const cfg = queryClient.getQueryData<SmtpConfigView>(['admin-smtp-config']);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={cfg?.configured ? 'default' : 'outline'}>
            {cfg?.configured ? t('configured') : t('notConfigured')}
          </Badge>
          <span className="text-muted-foreground">
            {cfg?.source === 'db'
              ? t('sourceDb')
              : cfg?.source === 'env'
                ? t('sourceEnv')
                : t('sourceNone')}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-host">{t('host')}</Label>
            <Input
              id="smtp-host"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="smtp.163.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port">{t('port')}</Label>
            <Input
              id="smtp-port"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              placeholder="465"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-user">{t('user')}</Label>
            <Input
              id="smtp-user"
              type="email"
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              placeholder="noreply@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-pass">{t('pass')}</Label>
            <Input
              id="smtp-pass"
              type="password"
              value={form.pass}
              onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))}
              placeholder={cfg?.hasPass ? t('passPlaceholderKeep') : t('passPlaceholder')}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="smtp-from">{t('from')}</Label>
            <Input
              id="smtp-from"
              value={form.from}
              onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
              placeholder="Pinecone &lt;noreply@example.com&gt;"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.host || !form.user}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </Button>
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('sendTest')}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </CardContent>
    </Card>
  );
}
