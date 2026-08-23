'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testPlanApi, testCaseApi, type TestPlanWalkthroughItem } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { ChevronLeft, ChevronRight, Check, X, Ban, Bug, Loader2, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';

const STATUS_STYLES: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-yellow-100 text-yellow-700',
  UNTESTED: 'bg-gray-100 text-gray-500',
};

export default function TestPlanWalkthroughPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const planId = params?.id as string;
  const t = useTranslations('testPlans');
  const c = useTranslations('common');
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['test-plan-walkthrough', workspaceId, planId],
    queryFn: () => testPlanApi.walkthrough(workspaceId!, planId).then((r) => r.data),
    enabled: !!workspaceId && !!planId,
  });

  const markMutation = useMutation({
    mutationFn: ({ item, status }: { item: TestPlanWalkthroughItem; status: string }) =>
      testCaseApi.markRun(workspaceId!, item.testCaseId, {
        status: status as any,
        releaseId: data?.plan.release?.id ?? undefined,
        actualResult: note || undefined,
      }).then((r) => r.data),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['test-plan-walkthrough', workspaceId, planId] });
      setNote('');
      if (index < (data?.items.length ?? 1) - 1) setIndex((i) => i + 1);
      showToast(`${vars.item.title} → ${vars.status}`);
    },
    onError: (e: any) => showToast(typeof e?.response?.data?.message === 'string' ? e.response.data.message : t('error')),
  });

  const defectMutation = useMutation({
    mutationFn: ({ item }: { item: TestPlanWalkthroughItem }) =>
      testCaseApi.createDefect(workspaceId!, item.testCaseId, item.runId!).then((r) => r.data),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['test-plan-walkthrough', workspaceId, planId] });
      showToast(`${t('defectCreated')}: ${_res.code}`);
    },
    onError: (e: any) => showToast(typeof e?.response?.data?.message === 'string' ? e.response.data.message : t('error')),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const items = data.items;
  const current = items[index];
  const doneCount = items.filter((i) => i.status !== 'UNTESTED').length;
  const passCount = items.filter((i) => i.status === 'PASS').length;
  const progress = data.total > 0 ? Math.round((doneCount / data.total) * 100) : 0;
  const steps = (current.steps ?? []) as { order?: number; action?: string; expected?: string }[];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/test-plans" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" /> {data.plan.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data.plan.release ? `${data.plan.release.name} (${data.plan.release.version})` : t('noRelease')}
              {' · '}{index + 1} / {data.total}
            </p>
          </div>
        </div>
        <Badge className="text-xs">{doneCount}/{data.total} · PASS {passCount}</Badge>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* 用例卡片 */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {current.code && <span className="text-xs font-mono tracking-wider text-muted-foreground">{current.code}</span>}
            <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[current.status] || ''}`}>
              {current.status}
            </Badge>
            <Badge variant="outline" className="text-xs">{current.type}</Badge>
            {current.priority && <Badge variant="outline" className="text-xs">{current.priority}</Badge>}
          </div>
          <h2 className="text-base font-medium">{current.title}</h2>

          {current.description && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{t('precondition')}</p>
              <p className="mt-1 whitespace-pre-wrap">{current.description}</p>
            </div>
          )}

          {steps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('steps')}</p>
              {steps.map((s, i) => (
                <div key={i} className="rounded-md border border-border/60 p-2.5 text-sm">
                  <p><span className="font-mono text-xs text-muted-foreground mr-2">{s.order ?? i + 1}.</span>{s.action}</p>
                  {s.expected && <p className="mt-1 text-xs text-muted-foreground">{t('expected')}: {s.expected}</p>}
                </div>
              ))}
            </div>
          )}

          {current.expectedResult && !steps.length && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{t('expected')}</p>
              <p className="mt-1 whitespace-pre-wrap">{current.expectedResult}</p>
            </div>
          )}

          {/* 备注 */}
          <div>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder={t('notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* 操作 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={markMutation.isPending}
              onClick={() => markMutation.mutate({ item: current, status: 'PASS' })}
            >
              <Check className="mr-1 h-4 w-4" /> PASS
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={markMutation.isPending}
              onClick={() => markMutation.mutate({ item: current, status: 'FAIL' })}
            >
              <X className="mr-1 h-4 w-4" /> FAIL
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
              disabled={markMutation.isPending}
              onClick={() => markMutation.mutate({ item: current, status: 'BLOCKED' })}
            >
              <Ban className="mr-1 h-4 w-4" /> BLOCKED
            </Button>
            {current.status === 'FAIL' && current.runId && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={defectMutation.isPending}
                onClick={() => defectMutation.mutate({ item: current })}
              >
                {defectMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bug className="mr-1 h-4 w-4" />}
                {t('createDefect')}
              </Button>
            )}
          </div>

          {current.actualResult && (
            <p className="text-xs text-muted-foreground">{t('lastNote')}: {current.actualResult}</p>
          )}
        </CardContent>
      </Card>

      {/* 导航 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {t('prev')}
        </Button>
        <span className="text-xs text-muted-foreground">{index + 1} / {data.total}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={index >= data.total - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          {t('next')} <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
