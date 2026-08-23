'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { themesApi, searchApi, aiApi } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { showToast } from '@/components/simple-toast';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tags, Plus, Trash2, ArrowUp, Lightbulb, Loader2, Search, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#64748b'];

const ENTITY_LABEL: Record<string, string> = { IDEA: 'IDEA', SUPPORT: 'SUPPORT', FEATURE: 'FEATURE' };

export default function ThemesPage() {
  const t = useTranslations('themes');
  const c = useTranslations('common');
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  // AI 聚类建议（P1）
  const [showCluster, setShowCluster] = useState(false);
  const [clusterData, setClusterData] = useState<{ source: string; suggestions: { title: string; summary: string; items: { entityType: string; entityId: string }[] }[] } | null>(null);

  // 关联实体选择器
  const [linkThemeId, setLinkThemeId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<'IDEA' | 'SUPPORT' | 'FEATURE'>('SUPPORT');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<{ entityType: string; id: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: themesData, isLoading } = useQuery({
    queryKey: ['themes', workspaceId],
    queryFn: () => themesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const themes = themesData ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['themes', workspaceId] });

  const createMutation = useMutation({
    mutationFn: () => themesApi.create(workspaceId!, { title, description, color }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setTitle('');
      setDescription('');
      showToast(t('created'));
    },
    onError: () => showToast(t('error')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => themesApi.remove(workspaceId!, id),
    onSuccess: () => {
      invalidate();
      showToast(t('deleted'));
    },
    onError: () => showToast(t('error')),
  });

  const linkMutation = useMutation({
    mutationFn: ({ themeId, entityType, entityId }: { themeId: string; entityType: string; entityId: string }) =>
      themesApi.link(workspaceId!, themeId, entityType, entityId),
    onSuccess: () => {
      invalidate();
      setLinkQuery('');
      setLinkResults([]);
      showToast(t('linked'));
    },
    onError: () => showToast(t('error')),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ themeId, entityType, entityId }: { themeId: string; entityType: string; entityId: string }) =>
      themesApi.unlink(workspaceId!, themeId, entityType, entityId),
    onSuccess: () => {
      invalidate();
      showToast(t('unlinked'));
    },
    onError: () => showToast(t('error')),
  });

  const promoteMutation = useMutation({
    mutationFn: ({ themeId, targetType }: { themeId: string; targetType: 'FEATURE' | 'IDEA' }) =>
      themesApi.promote(workspaceId!, themeId, targetType),
    onSuccess: () => {
      invalidate();
      showToast(t('promoted'));
    },
    onError: () => showToast(t('error')),
  });

  // P1：AI 聚类建议 → 一键建主题 + 自动关联
  const clusterMutation = useMutation({
    mutationFn: () => aiApi.clusterThemes(workspaceId!).then((r) => r.data),
    onSuccess: (data) => {
      setClusterData(data as any);
      setShowCluster(true);
    },
    onError: () => showToast(t('error')),
  });

  const applyClusterMutation = useMutation({
    mutationFn: async (suggestion: { title: string; summary: string; items: { entityType: string; entityId: string }[] }) => {
      const created = await themesApi.create(workspaceId!, {
        title: suggestion.title,
        description: suggestion.summary || undefined,
        color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      }).then((r) => r.data);
      for (const item of suggestion.items) {
        await themesApi.link(workspaceId!, created.id, item.entityType as 'IDEA' | 'SUPPORT' | 'FEATURE', item.entityId);
      }
      return created;
    },
    onSuccess: () => {
      invalidate();
      showToast(t('created'));
      setClusterData((prev) => (prev ? { ...prev, suggestions: [] } : prev));
      setShowCluster(false);
    },
    onError: () => showToast(t('error')),
  });

  const doSearch = async (q: string) => {
    setLinkQuery(q);
    if (!q.trim()) {
      setLinkResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchApi.global(workspaceId!, q);
      setLinkResults(
        res.data.results
          .filter((r) => r.entityType === linkType)
          .slice(0, 8)
          .map((r) => ({ entityType: r.entityType, id: r.id, title: r.title })),
      );
    } catch {
      setLinkResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (wsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Tags className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{t('noWorkspaceTitle')}</h2>
        <Button onClick={() => (window.location.href = '/')}>{c('goHomeCreate')}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => clusterMutation.mutate()} disabled={clusterMutation.isPending}>
            {clusterMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4 text-violet-500" />}
            {t('aiCluster')}
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newTheme')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Input placeholder={t('titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              placeholder={t('descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((cl) => (
                <button
                  key={cl}
                  type="button"
                  onClick={() => setColor(cl)}
                  className={cn('h-6 w-6 rounded-full border-2 transition-transform', color === cl ? 'scale-110 border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: cl }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
                {createMutation.isPending ? t('creating') : t('create')}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : themes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Tags className="h-12 w-12" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <Card key={theme.id} className="overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: theme.color || '#64748b' }} />
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold break-words">{theme.title}</h3>
                    {theme.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{theme.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (window.confirm(t('confirmDelete'))) removeMutation.mutate(theme.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">{theme.voteCount} {t('voteVolume')}</Badge>
                  <Badge variant="secondary" className="text-xs">{theme.linkedCount} {t('linked')}</Badge>
                </div>

                {theme.entities.length > 0 && (
                  <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                    {theme.entities.map((en) => (
                      <li key={`${en.entityType}:${en.entityId}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className="mr-1 font-mono text-[10px] text-muted-foreground">{ENTITY_LABEL[en.entityType] ?? en.entityType}</span>
                          {en.title}
                        </span>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => unlinkMutation.mutate({ themeId: theme.id, entityType: en.entityType, entityId: en.entityId })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => promoteMutation.mutate({ themeId: theme.id, targetType: 'FEATURE' })} disabled={promoteMutation.isPending}>
                    <ArrowUp className="mr-1 h-3 w-3" /> {t('promoteToFeature')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => promoteMutation.mutate({ themeId: theme.id, targetType: 'IDEA' })} disabled={promoteMutation.isPending}>
                    <Lightbulb className="mr-1 h-3 w-3" /> {t('promoteToIdea')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setLinkThemeId(linkThemeId === theme.id ? null : theme.id); setLinkQuery(''); setLinkResults([]); }}>
                    {linkThemeId === theme.id ? c('cancel') : t('linkEntity')}
                  </Button>
                </div>

                {linkThemeId === theme.id && (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="flex gap-1">
                      {(['SUPPORT', 'IDEA', 'FEATURE'] as const).map((tp) => (
                        <button
                          key={tp}
                          type="button"
                          onClick={() => { setLinkType(tp); setLinkQuery(''); setLinkResults([]); }}
                          className={cn(
                            'rounded border px-2 py-0.5 text-[11px]',
                            linkType === tp ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground',
                          )}
                        >
                          {ENTITY_LABEL[tp]}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t('linkSearchPlaceholder')}
                        value={linkQuery}
                        onChange={(e) => doSearch(e.target.value)}
                        className="h-8 pl-8 text-sm"
                      />
                    </div>
                    {searching && <p className="text-xs text-muted-foreground">{t('searching')}</p>}
                    {!searching && linkQuery && linkResults.length === 0 && <p className="text-xs text-muted-foreground">{t('noResults')}</p>}
                    {linkResults.length > 0 && (
                      <ul className="max-h-36 space-y-1 overflow-y-auto">
                        {linkResults.map((r) => (
                          <li key={r.id}>
                            <button
                              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                              onClick={() => linkMutation.mutate({ themeId: theme.id, entityType: r.entityType, entityId: r.id })}
                            >
                              <span className="truncate">{r.title}</span>
                              <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCluster(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="h-4 w-4 text-violet-500" />
                {t('aiClusterTitle')}
              </h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCluster(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {clusterMutation.isPending ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('aiClustering')}
              </div>
            ) : !clusterData || clusterData.suggestions.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t('aiClusterEmpty')}</div>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('aiClusterHint')}（{clusterData.source === 'llm' ? 'AI' : clusterData.source === 'heuristic' ? '本地分组' : ''}）
                </p>
                <div className="mt-3 space-y-2">
                  {clusterData.suggestions.map((s, idx) => (
                    <div key={idx} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.title}</p>
                          {s.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{s.items.length} 条</Badge>
                          <Button size="sm" variant="outline" disabled={applyClusterMutation.isPending} onClick={() => applyClusterMutation.mutate(s)}>
                            {t('aiApply')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}