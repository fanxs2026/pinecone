'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketplaceApi, type MarketplacePlugin } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { useTranslations } from 'next-intl';
import { PackagePlus } from 'lucide-react';

/** I11 插件市场（2026-08-18 P2 骨架）：内置清单 + 安装/卸载 */
export function MarketplacePanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('settings');
  const queryClient = useQueryClient();

  const { data: plugins, isLoading } = useQuery({
    queryKey: ['marketplace', workspaceId],
    queryFn: () => marketplaceApi.list(workspaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketplace', workspaceId] });

  const installMutation = useMutation({
    mutationFn: (id: string) => marketplaceApi.install(workspaceId, id),
    onSuccess: () => { showToast(t('pluginInstalled')); invalidate(); },
    onError: () => showToast(t('error')),
  });
  const uninstallMutation = useMutation({
    mutationFn: (id: string) => marketplaceApi.uninstall(workspaceId, id),
    onSuccess: () => { showToast(t('pluginRemoved')); invalidate(); },
    onError: () => showToast(t('error')),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="h-4 w-4" />
          {t('pluginMarketTitle')}
        </CardTitle>
        <CardDescription>{t('pluginMarketDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !plugins ? (
          <Skeleton className="h-24 w-full" />
        ) : plugins.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('pluginEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {plugins.map((p: MarketplacePlugin) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs font-mono text-muted-foreground">v{p.version}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs text-muted-foreground">{p.kind}</span>
                    {p.installed && (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">{t('pluginInstalledLabel')}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                </div>
                {p.installed ? (
                  <Button variant="outline" size="sm" onClick={() => uninstallMutation.mutate(p.id)} disabled={uninstallMutation.isPending}>
                    {t('pluginUninstall')}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => installMutation.mutate(p.id)} disabled={installMutation.isPending}>
                    {t('pluginInstall')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
