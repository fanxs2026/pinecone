'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { shareApi } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeClasses } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import { Lock, ExternalLink, Package, Calendar, Flag, Milestone } from 'lucide-react';

/**
 * P2-⑭ 访客只读页：无账号凭分享 token 查看实体。
 * P2 品牌化路线图分享：RELEASE 分享显示发布周期 + 功能路线图；
 * brandTitle/brandColor 应用品牌（标题/主题色）；viewMode 支持精简视图。
 */
export default function ShareViewPage() {
  const params = useParams<{ token: string }>();
  const t = useTranslations('share');
  const c = useTranslations('common');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['share-view', params.token],
    queryFn: async () => {
      // 先拉一次拿 viewMode，NARRATIVE 模式需要 includeSiblings（聚合相邻 release）
      const first = await shareApi.view(params.token).then((r) => r.data);
      if (first.viewMode === 'NARRATIVE' && first.entityType === 'RELEASE') {
        const full = await shareApi.view(params.token, true).then((r) => r.data);
        return full;
      }
      return first;
    },
    enabled: !!params.token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 p-16 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t('invalidTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('invalidDesc')}</p>
      </div>
    );
  }

  const entity = data.entity;
  const status = entity?.status;
  const isRelease = data.entityType === 'RELEASE';
  const brandColor = data.brandColor || undefined;
  const brandTitle = data.brandTitle || (isRelease ? entity?.name : entity?.title) || t('noTitle');
  const viewMode = data.viewMode ?? 'FULL';
  const simple = viewMode === 'SIMPLE';

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {/* 品牌头 */}
      <div
        className="rounded-lg px-5 py-4"
        style={brandColor ? { background: `${brandColor}14`, borderLeft: `3px solid ${brandColor}` } : undefined}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={brandColor ? { color: brandColor } : undefined}>
              {brandTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data.workspaceName}
              {isRelease ? ` · ${t('roadmap')}` : ''}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {data.entityType}
          </Badge>
        </div>
      </div>

      {/* 发布周期路线图（RELEASE） */}
      {isRelease ? (
        viewMode === 'NARRATIVE' ? (
          /* P1-D：NARRATIVE 叙事视图（里程碑 + 阶段分组 + 多 release 聚合） */
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{entity?.name}</h2>
                  {entity?.version && <Badge variant="outline" className="font-mono text-[10px]">v{entity.version}</Badge>}
                  {data.releaseMeta?.milestone && (
                    <Badge variant="secondary" className="bg-violet-100 text-violet-700">
                      <Flag className="mr-1 h-3 w-3" /> {data.releaseMeta.milestone}
                    </Badge>
                  )}
                  {status && (
                    <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', status)}>
                      {t(`status_${status}`) || status}
                    </Badge>
                  )}
                </div>
                {(entity?.startDate || entity?.endDate) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {entity?.startDate ? formatDate(entity.startDate) : '—'} ~ {entity?.endDate ? formatDate(entity.endDate) : '—'}
                  </div>
                )}
                {data.releaseMeta?.narrative && (
                  <p className="whitespace-pre-wrap rounded-md bg-violet-50/60 p-3 text-sm leading-relaxed text-muted-foreground">
                    {data.releaseMeta.narrative}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 阶段分组（叙事核心） */}
            {(data.featureGroups ?? []).map((g: any) => (
              <Card key={g.key}>
                <CardContent className="space-y-2 py-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Milestone className="h-4 w-4 text-muted-foreground" />
                    {g.label}
                    <span className="text-xs font-normal text-muted-foreground">({g.items.length})</span>
                  </p>
                  <div className="space-y-1.5">
                    {(g.items ?? []).map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="flex-1 truncate text-sm">
                          {f.code && <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{f.code}</span>}
                          {f.title}
                        </span>
                        {f.priority && <Badge variant="outline" className="text-[10px]">{f.priority}</Badge>}
                        <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', f.status)}>
                          {t(`status_${f.status}`) || f.status}
                        </Badge>
                      </div>
                    ))}
                    {g.items.length === 0 && <p className="text-sm text-muted-foreground">{t('noFeatures')}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* 多 release 聚合时间线 */}
            {(data.releases ?? []).length > 1 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <p className="text-sm font-medium">{t('roadmapTimeline')}</p>
                  <div className="space-y-1.5">
                    {(data.releases ?? []).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="flex-1 truncate text-sm">
                          {r.version && <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">v{r.version}</span>}
                          {r.name}
                          {r.milestone && <span className="ml-2 text-xs text-violet-600">({r.milestone})</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">{r._count?.features ?? 0} features</span>
                        <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', r.status)}>
                          {t(`status_${r.status}`) || r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{entity?.name}</h2>
                  {entity?.version && <Badge variant="outline" className="font-mono text-[10px]">v{entity.version}</Badge>}
                  {status && (
                    <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', status)}>
                      {t(`status_${status}`) || status}
                    </Badge>
                  )}
                </div>
                {(entity?.startDate || entity?.endDate) && (
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {entity?.startDate ? formatDate(entity.startDate) : '—'} ~ {entity?.endDate ? formatDate(entity.endDate) : '—'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {entity?.description && !simple && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entity.description}</p>
            )}

            {/* 功能路线图清单 */}
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('featuresInRelease')}（{entity?.features?.length ?? 0}）</p>
              <div className="space-y-1.5">
                {(entity?.features ?? []).map((f: any) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <span className="flex-1 truncate text-sm">
                      {f.code && <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{f.code}</span>}
                      {f.title}
                    </span>
                    {!simple && f.priority && <Badge variant="outline" className="text-[10px]">{f.priority}</Badge>}
                    <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', f.status)}>
                      {t(`status_${f.status}`) || f.status}
                    </Badge>
                  </div>
                ))}
                {(!entity?.features || entity.features.length === 0) && (
                  <p className="text-sm text-muted-foreground">{t('noFeatures')}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )) : (
        /* 单实体视图（STORY/IDEA/FEATURE/SUPPORT） */
        <Card>
          <CardContent className="space-y-4 py-5">
            <div>
              <h1 className="text-xl font-bold">{entity?.title || t('noTitle')}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {entity?.code && <span className="font-mono text-xs text-muted-foreground">{entity.code}</span>}
                {status && (
                  <Badge variant="secondary" className={getStatusBadgeClasses(data.entityType as 'STORY' | 'IDEA' | 'FEATURE' | 'SUPPORT', status)}>
                    {t(`status_${status}`) || status}
                  </Badge>
                )}
                {entity?.priority && <Badge variant="outline" className="text-[10px]">{entity.priority}</Badge>}
              </div>
            </div>

            {!simple && entity?.description && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{c('description')}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{entity.description}</p>
              </div>
            )}

            {!simple && entity?.acceptanceCriteria && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('acceptance')}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{entity.acceptanceCriteria}</p>
              </div>
            )}

            {!simple && (
              <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{c('assignee')}</p>
                  <p>{entity?.assignee?.name || entity?.assignee?.email || t('unassigned')}</p>
                </div>
                {entity?.createdAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('created')}</p>
                    <p>{formatDateTime(entity.createdAt)}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        {t('footerNote')}
      </p>
    </div>
  );
}
