'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseApi, releaseApi, type TestCase } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Bug, Check, FlaskConical, Loader2, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date-utils';

const runStatusStyle: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200',
  FAIL: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200',
  BLOCKED: 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200',
  UNTESTED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const priorityColor: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-blue-100 text-blue-700',
  P3: 'bg-gray-100 text-gray-500',
};

interface StepRow {
  order?: number;
  action?: string;
  expected?: string;
}

export default function TestCaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('test');
  const c = useTranslations('common');
  const td = useTranslations('detail');

  const [editingSteps, setEditingSteps] = useState(false);
  const [stepRows, setStepRows] = useState<StepRow[]>([]);
  const [actualResult, setActualResult] = useState('');
  const [pendingDefect, setPendingDefect] = useState<string | null>(null);

  const { data: testCase, isLoading } = useQuery({
    queryKey: ['test-case', workspaceId, id],
    queryFn: () => testCaseApi.get(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['test-case', workspaceId, id] });
    queryClient.invalidateQueries({ queryKey: ['test-cases', workspaceId] });
  };

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => testCaseApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: invalidate,
  });

  const markRunMutation = useMutation({
    mutationFn: (status: 'PASS' | 'FAIL' | 'BLOCKED') =>
      testCaseApi.markRun(workspaceId!, id, {
        status,
        releaseId: testCase?.releaseId ?? undefined,
        actualResult: actualResult || undefined,
      }),
    onSuccess: () => { invalidate(); setActualResult(''); },
  });

  const defectMutation = useMutation({
    mutationFn: (runId: string) => testCaseApi.createDefect(workspaceId!, id, runId),
    onSuccess: () => { invalidate(); setPendingDefect(null); },
    onError: () => setPendingDefect(null),
  });

  const runs = useMemo(() => testCase?.testRuns ?? [], [testCase]);

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!testCase) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <FlaskConical className="h-12 w-12" />
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const steps: StepRow[] = Array.isArray(testCase.steps) ? (testCase.steps as StepRow[]) : [];

  const startEditSteps = () => {
    setStepRows(steps.length > 0 ? steps.map((s) => ({ ...s })) : [{ order: 1, action: '', expected: '' }]);
    setEditingSteps(true);
  };

  const saveSteps = () => {
    const cleaned = stepRows
      .map((s, i) => ({ order: i + 1, action: s.action?.trim(), expected: s.expected?.trim() }))
      .filter((s) => s.action || s.expected);
    updateMutation.mutate({ steps: cleaned }, { onSuccess: () => setEditingSteps(false) });
  };

  const editField = (field: 'title' | 'description' | 'expectedResult', val: string) => {
    updateMutation.mutate({ [field]: val || undefined });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />{c('back')}
        </Button>
        <div className="flex items-center gap-2">
          {testCase.code && <Badge variant="outline" className="font-mono text-xs">{testCase.code}</Badge>}
          <h1 className="text-2xl font-bold tracking-tight">{testCase.title}</h1>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{t(`type${testCase.type}`) || testCase.type}</Badge>
          <Badge variant="secondary" className={priorityColor[testCase.priority] || ''}>{testCase.priority}</Badge>
          {testCase.story && (
            <span>
              {t('linkedStory')}:{' '}
              <Link href={`/stories/${testCase.story.id}`} className="text-primary hover:underline">
                {testCase.story.title}
              </Link>
            </span>
          )}
          {testCase.release && (
            <span>
              {t('inRelease')}:{' '}
              <Link href={`/releases/${testCase.release.id}`} className="text-primary hover:underline">
                {testCase.release.name}
              </Link>
            </span>
          )}
        </div>
      </div>

      {/* 用例内容 */}
      <Card>
        <CardContent className="space-y-4 py-4">
          {/* 前置条件 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('precondition')}</span>
              {testCase.description !== undefined && (
                <button className="text-xs text-primary hover:underline" onClick={() => editField('description', '')}>
                  {c('clear')}
                </button>
              )}
            </div>
            {testCase.description ? (
              <p className="whitespace-pre-wrap text-sm">{testCase.description}</p>
            ) : (
              <Input
                placeholder={t('preconditionPlaceholder')}
                defaultValue=""
                onBlur={(e) => e.target.value.trim() && editField('description', e.target.value.trim())}
              />
            )}
          </div>

          {/* 步骤 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('steps')}</span>
              {!editingSteps && steps.length > 0 && (
                <button className="text-xs text-primary hover:underline" onClick={startEditSteps}>{c('edit')}</button>
              )}
            </div>
            {editingSteps ? (
              <div className="space-y-2">
                {stepRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground">{idx + 1}.</span>
                    <Input
                      placeholder={t('stepActionPlaceholder')}
                      value={row.action ?? ''}
                      onChange={(e) => setStepRows((prev) => prev.map((r, i) => (i === idx ? { ...r, action: e.target.value } : r)))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground">{t('stepExpect')}</span>
                    <Input
                      placeholder={t('stepExpectedPlaceholder')}
                      value={row.expected ?? ''}
                      onChange={(e) => setStepRows((prev) => prev.map((r, i) => (i === idx ? { ...r, expected: e.target.value } : r)))}
                      className="flex-1"
                    />
                    <button
                      onClick={() => setStepRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" onClick={() => setStepRows((prev) => [...prev, { order: prev.length + 1, action: '', expected: '' }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" />{t('addStep')}
                  </Button>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingSteps(false)}>{c('cancel')}</Button>
                    <Button size="sm" onClick={saveSteps} disabled={updateMutation.isPending}><Check className="h-3.5 w-3.5 mr-1" />{c('save')}</Button>
                  </div>
                </div>
              </div>
            ) : steps.length > 0 ? (
              <ol className="space-y-1.5 text-sm">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1">
                      <span className="font-medium">{s.action}</span>
                      {s.expected && <span className="text-muted-foreground"> — {t('stepExpect')}: {s.expected}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <button className="text-sm text-primary hover:underline" onClick={startEditSteps}>{t('addStepsHint')}</button>
            )}
          </div>

          {/* 预期结果 */}
          <div>
            <span className="mb-1 block text-sm font-medium text-muted-foreground">{t('expectedResult')}</span>
            {testCase.expectedResult ? (
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm">{testCase.expectedResult}</p>
                <button className="shrink-0 text-xs text-primary hover:underline" onClick={() => editField('expectedResult', '')}>
                  {c('clear')}
                </button>
              </div>
            ) : (
              <Input
                placeholder={t('expectedResultPlaceholder')}
                defaultValue=""
                onBlur={(e) => e.target.value.trim() && editField('expectedResult', e.target.value.trim())}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* 执行区 */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('execute')}</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('actualResultPlaceholder')}
                value={actualResult}
                onChange={(e) => setActualResult(e.target.value)}
                className="w-64"
              />
              {(['PASS', 'FAIL', 'BLOCKED'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  className={cn('h-8 px-3 text-xs', runStatusStyle[s])}
                  disabled={markRunMutation.isPending}
                  onClick={() => markRunMutation.mutate(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('markHint', { release: testCase.release?.name ?? t('noRelease') })}
          </p>
        </CardContent>
      </Card>

      {/* 执行历史 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t('runHistory', { count: runs.length })}</h2>
        {runs.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">{t('noRuns')}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <Card key={run.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-xs', runStatusStyle[run.status])}>{run.status}</Badge>
                    <span className="text-sm text-muted-foreground">{run.executedBy?.name || run.executedBy?.email}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(run.executedAt || run.createdAt)}</span>
                    {run.actualResult && <span className="text-xs text-muted-foreground">"{run.actualResult}"</span>}
                    {run.release && <span className="text-xs text-muted-foreground">{run.release.name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {run.support ? (
                      <Link href={`/supports/${run.support.id}`}>
                        <Badge variant="outline" className="flex items-center gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <Bug className="h-3 w-3" />{run.support.code || t('hasDefect')}
                        </Badge>
                      </Link>
                    ) : run.status === 'FAIL' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        disabled={defectMutation.isPending && pendingDefect === run.id}
                        onClick={() => { setPendingDefect(run.id); defectMutation.mutate(run.id); }}
                      >
                        {defectMutation.isPending && pendingDefect === run.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Bug className="h-3 w-3" />
                        )}
                        <span className="ml-1">{t('createDefect')}</span>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
