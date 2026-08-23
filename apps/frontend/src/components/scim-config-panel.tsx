'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scimApi } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { UserCog, KeyRound, RefreshCw, Copy, Loader2 } from 'lucide-react';

/** 设置页「企业登录」页签下：SCIM 2.0 预配配置卡（仅工作区 ADMIN） */
export function ScimConfigPanel() {
  const t = useTranslations('scimConfig');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const [tokenOnce, setTokenOnce] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['scim-config', workspaceId],
    queryFn: () => scimApi.config(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scim-config', workspaceId] });

  const genToken = useMutation({
    mutationFn: () => scimApi.generateToken(workspaceId!).then((r) => r.data),
    onSuccess: (d) => { invalidate(); setTokenOnce(d.token); showToast(t('tokenGenerated')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => scimApi.updateConfig(workspaceId!, { enabled }).then((r) => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  // 组角色映射编辑（每行 组名=角色）
  const [mappingsText, setMappingsText] = useState('');
  const saveMappings = useMutation({
    mutationFn: (list: Array<{ groupName: string; role: string }>) =>
      scimApi.updateConfig(workspaceId!, { groupRoleMappings: list }).then((r) => r.data),
    onSuccess: () => { invalidate(); showToast(t('mappingsSaved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  // 配置加载后初始化映射文本（仅一次）
  const [mappingsInit, setMappingsInit] = useState(false);
  useEffect(() => {
    if (config && !mappingsInit) {
      setMappingsText((config.groupRoleMappings ?? []).map((m) => `${m.groupName}=${m.role}`).join('\n'));
      setMappingsInit(true);
    }
  }, [config, mappingsInit]);

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  const endpoint = config?.endpoint
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api${config.endpoint}`
    : '';

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); showToast(label); } catch { /* ignore */ }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-muted-foreground" />{t('scimTitle')}
          </CardTitle>
          <CardDescription>{t('scimDesc')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={config?.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
            {config?.enabled ? t('enabled') : t('disabled')}
          </Badge>
          {config?.enabled ? (
            <Button size="sm" variant="outline" className="h-7" onClick={() => toggle.mutate(false)}>{t('disable')}</Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7" onClick={() => toggle.mutate(true)}>{t('enable')}</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{t('scimEndpoint')}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{endpoint}</code>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(endpoint, t('copied'))} title={t('copy')}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{t('scimToken')}</div>
          <div className="flex items-center gap-2">
            {config?.hasToken ? (
              <Badge variant="outline" className="bg-green-50 text-green-700">{t('tokenSet')}</Badge>
            ) : (
              <Badge variant="outline">{t('tokenMissing')}</Badge>
            )}
            <Button size="sm" variant="outline" className="h-7" disabled={genToken.isPending} onClick={() => genToken.mutate()}>
              {genToken.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              {t('generateToken')}
            </Button>
          </div>
          {tokenOnce && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <b>{t('tokenOnce')}</b>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all">{tokenOnce}</code>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(tokenOnce, t('copied'))} title={t('copy')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 组角色映射（RBAC）：每行 组名=角色 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{t('mappingsTitle')}</div>
            <Button
              size="sm" variant="outline" className="h-6 px-2"
              disabled={saveMappings.isPending}
              onClick={() => {
                const list = mappingsText.split('\n').map((l) => l.trim()).filter(Boolean)
                  .map((l) => { const [g, r] = l.split('='); return { groupName: g.trim(), role: r.trim().toUpperCase() }; })
                  .filter((m) => m.groupName && ['ADMIN', 'MEMBER', 'VIEWER'].includes(m.role));
                saveMappings.mutate(list);
              }}
            >
              {saveMappings.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {t('saveMappings')}
            </Button>
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            value={mappingsText}
            onChange={(e) => setMappingsText(e.target.value)}
            placeholder={'运维组=ADMIN\n测试组=MEMBER\n访客组=VIEWER'}
          />
          <p className="text-xs text-muted-foreground">{t('mappingsHint')}</p>
        </div>

        <div className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">{t('scimHowto')}</div>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>{t('scimHow1')}</li>
            <li>{t('scimHow2')}</li>
            <li>{t('scimHow3')}</li>
            <li>{t('scimHow4')}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
