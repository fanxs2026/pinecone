'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackPortalApi, scoresApi, type ScoringConfig } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, RefreshCw, Gauge, Plus, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  workspaceId: string;
}

/** P0：反馈门户配置 + 优先级评分模型配置（设置页，仅工作区管理员） */
export function FeedbackConfigPanel({ workspaceId }: Props) {
  const t = useTranslations('feedbackConfig');
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: portal, isLoading: portalLoading } = useQuery({
    queryKey: ['feedback-portal-settings', workspaceId],
    queryFn: () => feedbackPortalApi.settings(workspaceId).then((r) => r.data),
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['scores-config', workspaceId],
    queryFn: () => scoresApi.config(workspaceId).then((r) => r.data),
  });

  const portalMutation = useMutation({
    mutationFn: (data: { enabled?: boolean; requireEmail?: boolean; target?: 'SUPPORT' | 'IDEA' }) =>
      feedbackPortalApi.updateSettings(workspaceId, data).then((r) => r.data),
    // 2026-08-15 修复：乐观更新立即反映 UI（受控组件不会自动变），Settled 兜底与后端对齐
    onMutate: (data) => {
      queryClient.setQueryData(['feedback-portal-settings', workspaceId], (old: any) =>
        old ? { ...old, ...data } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-portal-settings', workspaceId] });
    },
    onSuccess: () => showToast(t('saved')),
    onError: () => showToast(t('error')),
  });

  const tokenMutation = useMutation({
    mutationFn: () => feedbackPortalApi.regenerateToken(workspaceId).then((r) => r.data),
    onSuccess: () => {
      showToast(t('tokenRegenerated'));
      queryClient.invalidateQueries({ queryKey: ['feedback-portal-settings', workspaceId] });
    },
    onError: () => showToast(t('error')),
  });

  const configMutation = useMutation({
    mutationFn: (data: Partial<ScoringConfig>) => scoresApi.updateConfig(workspaceId, data).then((r) => r.data),
    onMutate: (data) => {
      queryClient.setQueryData(['scores-config', workspaceId], (old: any) =>
        old ? { ...old, ...data } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['scores-config', workspaceId] });
    },
    onSuccess: () => showToast(t('saved')),
    onError: () => showToast(t('error')),
  });

  const copyLink = () => {
    if (!portal?.portalUrl) return;
    const url = `${window.location.origin}${portal.portalUrl}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (portalLoading || configLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 反馈门户 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> {t('portalTitle')}
          </CardTitle>
          <CardDescription>{t('portalDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 启用开关 */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('enabled')}</p>
              <p className="text-xs text-muted-foreground">{t('enabledHint')}</p>
            </div>
            <input
              type="checkbox"
              checked={portal?.enabled ?? false}
              onChange={(e) => portalMutation.mutate({ enabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>

          {/* 落点 + 邮箱 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('target')}</p>
              <select
                value={portal?.target ?? 'SUPPORT'}
                onChange={(e) => portalMutation.mutate({ target: e.target.value as 'SUPPORT' | 'IDEA' })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="SUPPORT">{t('targetSupport')}</option>
                <option value="IDEA">{t('targetIdea')}</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('requireEmail')}</p>
              <select
                value={portal?.requireEmail ? '1' : '0'}
                onChange={(e) => portalMutation.mutate({ requireEmail: e.target.value === '1' })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="1">{t('requireEmailYes')}</option>
                <option value="0">{t('requireEmailNo')}</option>
              </select>
            </div>
          </div>

          {/* 门户链接 */}
          {portal?.portalUrl ? (
            <div className="flex items-center gap-2 rounded-lg border p-2.5">
              <code className="flex-1 truncate text-xs">{`${window.location.origin}${portal.portalUrl}`}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t('copied') : t('copy')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { if (confirm(t('tokenConfirm'))) tokenMutation.mutate(); }}>
                <RefreshCw className="h-3.5 w-3.5" /> {t('regenerate')}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t('noTokenHint')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 评分模型 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" /> {t('scoringTitle')}
          </CardTitle>
          <CardDescription>{t('scoringDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('model')}</span>
            <div className="flex gap-1">
              {(['RICE', 'ICE', 'CUSTOM'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => configMutation.mutate({ model: m })}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    config?.model === m ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-accent',
                  )}
                >
                  {m === 'RICE' ? t('rice') : m === 'ICE' ? t('ice') : t('custom')}
                </button>
              ))}
            </div>
          </div>

          {config?.model === 'CUSTOM' && (
            <CustomDimensions
              dimensions={config.dimensions}
              onSave={(dimensions) => configMutation.mutate({ dimensions })}
              t={t as any}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CustomDimensions({
  dimensions,
  onSave,
  t,
}: {
  dimensions: { key: string; label: string; weight: number; scale: number }[];
  onSave: (dims: { key: string; label: string; weight: number; scale: number }[]) => void;
  t: (k: string) => string;
}) {
  const [rows, setRows] = useState(dimensions.map((d) => ({ ...d })));

  useEffect(() => setRows(dimensions.map((d) => ({ ...d }))), [dimensions]);

  const setRow = (idx: number, patch: Partial<{ key: string; label: string; weight: number; scale: number }>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const valid = rows.length > 0 && rows.every((r) => r.key.trim() && r.label.trim());

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              placeholder={t('dimKey')}
              value={r.key}
              onChange={(e) => setRow(idx, { key: e.target.value })}
              className="h-8 w-28 text-xs"
            />
            <Input
              placeholder={t('dimLabel')}
              value={r.label}
              onChange={(e) => setRow(idx, { label: e.target.value })}
              className="h-8 flex-1 text-xs"
            />
            <Input
              type="number"
              placeholder={t('dimWeight')}
              value={r.weight}
              onChange={(e) => setRow(idx, { weight: Number(e.target.value) || 0 })}
              className="h-8 w-16 text-xs"
            />
            <Input
              type="number"
              placeholder={t('dimScale')}
              value={r.scale}
              onChange={(e) => setRow(idx, { scale: Number(e.target.value) || 0 })}
              className="h-8 w-16 text-xs"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRows((prev) => [...prev, { key: '', label: '', weight: 1, scale: 5 }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('addDimension')}
        </Button>
        <Button size="sm" disabled={!valid} onClick={() => onSave(rows)}>
          {t('saveConfig')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('customHint')}</p>
    </div>
  );
}
