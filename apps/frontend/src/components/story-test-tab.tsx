'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseApi, type TestCase } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { Check, FlaskConical, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const runStatusStyle: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700 border-green-200',
  FAIL: 'bg-red-100 text-red-700 border-red-200',
  BLOCKED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  UNTESTED: 'bg-gray-100 text-gray-500 border-gray-200',
};

interface Props {
  workspaceId: string;
  storyId: string;
}

/**
 * Story 详情"测试"页签（Phase 1）：
 * 该任务关联的用例列表 + 新建用例（预填 storyId）——"需求→开发→测试"闭环的输入侧。
 */
export default function StoryTestTab({ workspaceId, storyId }: Props) {
  const t = useTranslations('test');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('FEATURE');
  const [expectedResult, setExpectedResult] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['test-cases', workspaceId, 'story', storyId],
    queryFn: () => testCaseApi.list(workspaceId!, { storyId }).then((r) => r.data),
    enabled: !!workspaceId && !!storyId,
  });
  const cases = data?.items ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['test-cases', workspaceId, 'story', storyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      testCaseApi.create(workspaceId!, { title, type, expectedResult: expectedResult || undefined, storyId }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setTitle('');
      setType('FEATURE');
      setExpectedResult('');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const latestRun = (tc: TestCase) => tc.testRuns?.[0]?.status ?? 'UNTESTED';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          {t('storyCases', { count: cases.length })}
        </h3>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />{t('newCase')}
          </Button>
        )}
      </div>

      {/* 新建用例表单 */}
      {creating && (
        <Card className="mb-3">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('newCaseTitle')}</span>
              <button onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={t('caseTitlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1"
              />
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="FEATURE">{t('typeFEATURE')}</option>
                <option value="PERFORMANCE">{t('typePERFORMANCE')}</option>
                <option value="SECURITY">{t('typeSECURITY')}</option>
                <option value="API">{t('typeAPI')}</option>
              </select>
            </div>
            <Input
              placeholder={t('expectedResultPlaceholder')}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>{c('cancel')}</Button>
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                {c('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cases.length === 0 && !creating ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('empty')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map((tc) => (
            <Card key={tc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {tc.code && <Badge variant="outline" className="shrink-0 font-mono text-xs">{tc.code}</Badge>}
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">{tc.type}</Badge>
                  <Link href={`/test-cases/${tc.id}`} className="truncate text-sm font-medium text-primary hover:underline">
                    {tc.title}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className={cn('text-xs', runStatusStyle[latestRun(tc)])}>
                    {latestRun(tc)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
