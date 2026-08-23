'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, X, Trash2, Loader2 } from 'lucide-react';
import { scoresApi, type ScoringConfig } from '@/lib/api-client';
import { showToast } from '@/components/simple-toast';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EntityScoreLike {
  model: string;
  weightedScore: number;
  dimensions: Record<string, number>;
  /** RICE 下 reach 是否为自动（由票数驱动，读取时实时重算） */
  reachAuto?: boolean;
}

interface ScoreEditorProps {
  wsId: string;
  entityType: 'IDEA' | 'SUPPORT' | 'FEATURE';
  entityId: string;
  score?: EntityScoreLike | null;
  /** 保存/清除后刷新（失效实体列表/详情查询） */
  invalidateKeys?: unknown[];
}

const MODEL_KEYS: Record<string, string> = { RICE: 'rice', ICE: 'ice', CUSTOM: 'custom' };
const DIM_LABEL_KEYS: Record<string, string> = {
  reach: 'dimReach',
  impact: 'dimImpact',
  confidence: 'dimConfidence',
  effort: 'dimEffort',
  ease: 'dimEase',
};

/** 本地实时预览计算（与后端 scoring.ts 公式一致） */
function compute(model: string, dims: Record<string, number>, config?: ScoringConfig | null): number {
  if (model === 'RICE') {
    const reach = dims.reach ?? 0;
    const impact = dims.impact ?? 0;
    const confidence = dims.confidence ?? 0;
    const effort = dims.effort && dims.effort > 0 ? dims.effort : 1;
    return Math.round(((reach * impact * confidence) / effort) * 100) / 100;
  }
  if (model === 'ICE') {
    return Math.round(((dims.impact ?? 0) * (dims.confidence ?? 0) * (dims.ease ?? 0)) * 100) / 100;
  }
  // CUSTOM：加权归一化 0-100
  const dimDefs = config?.dimensions?.length ? config.dimensions : [];
  let sum = 0;
  let wTotal = 0;
  for (const d of dimDefs) {
    const v = dims[d.key];
    if (v === undefined || v === null || Number.isNaN(Number(v))) continue;
    const normalized = d.scale > 0 ? Math.min(Math.max(Number(v), 0), d.scale) / d.scale : Math.min(Math.max(Number(v), 0), 100) / 100;
    sum += normalized * (d.weight || 1);
    wTotal += d.weight || 1;
  }
  return wTotal > 0 ? Math.round((sum / wTotal) * 10000) / 100 : 0;
}

/** P0：评分徽章 + 弹层编辑器（RICE/ICE/CUSTOM，Reach 未填自动取票数由后端处理） */
export default function ScoreEditor({ wsId, entityType, entityId, score, invalidateKeys }: ScoreEditorProps) {
  const t = useTranslations('scores');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>(score?.model ?? 'RICE');
  const [dims, setDims] = useState<Record<string, number>>(score?.dimensions ?? {});
  const [saving, setSaving] = useState(false);

  // 打开时拉取工作区评分配置
  const { data: config } = useQuery({
    queryKey: ['scores-config', wsId],
    queryFn: () => scoresApi.config(wsId).then((r) => r.data),
    enabled: open,
  });

  // I7 评分历史（趋势曲线，仅已评分实体拉取）
  const { data: history } = useQuery({
    queryKey: ['scores-history', wsId, entityType, entityId],
    queryFn: () => scoresApi.history(wsId, entityType, entityId).then((r) => r.data),
    enabled: open && !!score,
  });

  useEffect(() => {
    if (open) {
      setModel(score?.model ?? config?.model ?? 'RICE');
      setDims(score?.dimensions ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const preview = compute(model, dims, config);

  const saveMutation = useMutation({
    mutationFn: () =>
      scoresApi.save(wsId, { entityType, entityId, model, dimensions: dims }).then((r) => r.data),
    onSuccess: () => {
      showToast(t('saved'));
      setOpen(false);
      if (invalidateKeys) queryClient.invalidateQueries({ queryKey: invalidateKeys });
    },
    onError: () => showToast(t('error')),
  });

  const removeMutation = useMutation({
    mutationFn: () => scoresApi.remove(wsId, entityType, entityId),
    onSuccess: () => {
      showToast(t('removed'));
      setOpen(false);
      if (invalidateKeys) queryClient.invalidateQueries({ queryKey: invalidateKeys });
    },
    onError: () => showToast(t('error')),
  });

  const dimsOfModel = (m: string): string[] => {
    if (m === 'RICE') return ['reach', 'impact', 'confidence', 'effort'];
    if (m === 'ICE') return ['impact', 'confidence', 'ease'];
    return (config?.dimensions ?? []).map((d) => d.key);
  };

  const setDim = (key: string, val: string) => {
    const num = val === '' ? (key === 'effort' ? 1 : 0) : Number(val);
    setDims((prev) => ({ ...prev, [key]: Number.isNaN(num) ? 0 : num }));
  };

  const breakdown = score && Object.keys(score.dimensions ?? {}).length
    ? Object.entries(score.dimensions)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    : '';

  return (
    <>
      <button
        type="button"
        title={score ? `${t('scoreTitle')}：${score.model} · ${breakdown}` : t('score')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium transition-all',
          score
            ? 'border-amber-400/50 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:shadow-sm dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20'
            : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:shadow-sm dark:border-primary/40 dark:text-primary',
        )}
      >
        <Gauge className="h-3 w-3" />
        <span>{score ? score.weightedScore : t('score')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('scoreTitle')}</h3>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 模型选择 */}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('model')}</span>
              <div className="flex gap-1">
                {(['RICE', 'ICE', 'CUSTOM'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      model === m ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {t(MODEL_KEYS[m])}
                  </button>
                ))}
              </div>
            </div>

            {/* 维度输入 */}
            <div className="space-y-2.5">
              {dimsOfModel(model).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="w-36 shrink-0 text-sm text-muted-foreground">
                    {t(DIM_LABEL_KEYS[key] ?? key) || key}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={dims[key] ?? ''}
                    onChange={(e) => setDim(key, e.target.value)}
                    className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                  />
                </div>
              ))}
              {model === 'RICE' && (
                <p className="text-xs text-muted-foreground">{t('reachAuto')}</p>
              )}
            </div>

            {/* 实时预览 */}
            <div className="mt-4 flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">{t('weighted')}</span>
              <span className="text-lg font-bold">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : preview}</span>
            </div>

            {/* I7 评分趋势曲线（2026-08-18 P1） */}
            {history && history.length >= 2 && (
              <div className="mt-3 rounded-lg border p-2.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('history')}</p>
                <TrendLine points={history.map((h) => h.weightedScore)} />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{new Date(history[0].createdAt).toLocaleDateString('zh-CN')}</span>
                  <span>{new Date(history[history.length - 1].createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            )}

            {/* 操作 */}
            <div className="mt-4 flex items-center justify-between">
              {score ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> {t('remove')}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>{t('cancel')}</Button>
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? t('saving') : t('save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** I7 轻量 SVG 趋势折线（无图表库依赖） */
function TrendLine({ points }: { points: number[] }) {
  const W = 100;
  const H = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((v, i) => {
    const x = points.length === 1 ? 0 : (i / (points.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
