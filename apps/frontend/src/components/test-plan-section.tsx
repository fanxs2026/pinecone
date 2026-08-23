'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testPlanApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { ClipboardList, Loader2, Play, Plus, FolderInput } from 'lucide-react';
import { cn } from '@/lib/utils';

const planStatusStyle: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
  ACTIVE: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  ARCHIVED: 'bg-gray-100 text-gray-500 border-gray-200',
};

interface Props {
  workspaceId: string;
  releaseId?: string;
}

/** 测试计划区块（Phase 4）：命名计划批次 + 进度汇总 + 批量拉入用例 */
export function TestPlanSection({ workspaceId, releaseId }: Props) {
  const t = useTranslations('testPlan');
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['test-plans', workspaceId, releaseId],
    queryFn: () => testPlanApi.list(workspaceId, releaseId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['test-plan', workspaceId, expanded],
    queryFn: () => testPlanApi.get(workspaceId!, expanded!).then((r) => r.data),
    enabled: !!expanded,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['test-plans', workspaceId, releaseId] });
  };

  const createMutation = useMutation({
    mutationFn: () => testPlanApi.create(workspaceId!, { name, releaseId }).then((r) => r.data),
    onSuccess: () => { invalidate(); setShowCreate(false); setName(''); },
  });

  const addCasesMutation = useMutation({
    mutationFn: (planId: string) => testPlanApi.addCases(workspaceId!, planId, { releaseId: releaseId! }).then((r) => r.data),
    onSuccess: (data, planId) => {
      queryClient.invalidateQueries({ queryKey: ['test-plan', workspaceId, planId] });
      invalidate();
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => testPlanApi.updateStatus(workspaceId!, id, status),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['test-plan', workspaceId, v.id] });
      invalidate();
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />{t('title')}
        </h3>
        <div className="flex items-center gap-2">
          {showCreate ? (
            <div className="flex items-center gap-1.5">
              <Input
                className="h-7 w-44 text-xs"
                placeholder={t('namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Button size="sm" className="h-7" disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setShowCreate(false); setName(''); }}>{t('cancel')}</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-3 w-3" />{t('newPlan')}
            </Button>
          )}
        </div>
      </div>

      {(plans?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">{t('empty')}</p>
      ) : (
        plans?.map((p) => (
          <Card key={p.id} className="cursor-pointer" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
            <CardContent className="flex items-center justify-between py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline" className={planStatusStyle[p.status]}>{p.status}</Badge>
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t('cases', { count: p._count.cases })}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {p.status === 'DRAFT' && (
                  <Button
                    size="sm" variant="outline" className="h-6 px-2"
                    onClick={(e) => { e.stopPropagation(); activateMutation.mutate({ id: p.id, status: 'ACTIVE' }); }}
                  >
                    <Play className="mr-1 h-3 w-3" />{t('activate')}
                  </Button>
                )}
                {p.status === 'ACTIVE' && releaseId && (
                  <Button
                    size="sm" variant="outline" className="h-6 px-2"
                    disabled={addCasesMutation.isPending}
                    onClick={(e) => { e.stopPropagation(); addCasesMutation.mutate(p.id); }}
                  >
                    <FolderInput className="mr-1 h-3 w-3" />{t('pullCases')}
                  </Button>
                )}
              </div>
            </CardContent>
            {expanded === p.id && expandedDetail?.id === p.id && (
              <CardContent className="border-t py-3">
                {detailLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{t('passRate')}</span>
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', expandedDetail.progress.passRate >= 80 ? 'bg-green-500' : expandedDetail.progress.passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${expandedDetail.progress.passRate}%` }} />
                      </div>
                      <span className="font-medium">{expandedDetail.progress.passRate}%</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-700">PASS {expandedDetail.progress.PASS}</span>
                      <span className="text-red-600">FAIL {expandedDetail.progress.FAIL}</span>
                      <span className="text-yellow-600">BLOCKED {expandedDetail.progress.BLOCKED}</span>
                      <span className="text-muted-foreground">UNTESTED {expandedDetail.progress.UNTESTED}</span>
                    </div>
                    <div className="max-h-40 space-y-1 overflow-auto">
                      {expandedDetail.cases.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-xs">
                          {c.testCase.code && <Badge variant="outline" className="font-mono">{c.testCase.code}</Badge>}
                          <span className="truncate">{c.testCase.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
