'use client';

import { useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseApi, testAutomationApi, type TestCase, type TestRun, type JunitImportReport } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Bug, CheckCircle2, CircleSlash, FlaskConical, Loader2, TerminalSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const runStatusStyle: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200',
  FAIL: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200',
  BLOCKED: 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200',
  UNTESTED: 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
};

interface Props {
  workspaceId: string;
  releaseId: string;
  /** release 是否已关闭（CLOSED 后禁用标记执行） */
  disabled?: boolean;
}

/**
 * Release 详情"测试进度"区块（Phase 1 MVP）：
 * 通过率进度条（PASS/(PASS+FAIL)）+ 用例清单 + 标记 PASS/FAIL/BLOCKED + 失败一键建缺陷。
 * 用例集合 = 直接挂 releaseId 的用例（releaseId=R）。
 */
export default function ReleaseTestProgress({ workspaceId, releaseId, disabled }: Props) {
  const t = useTranslations('test');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const [pendingRun, setPendingRun] = useState<string | null>(null);
  const [pendingDefect, setPendingDefect] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<JunitImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Phase 4: 导入 CI JUnit 结果 → 自动匹配/创建用例 + 建 TestRun（挂当前 release）
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const res = await testAutomationApi.importJunit(workspaceId, file, { releaseId, autoCreate: true });
      setImportResult(res.data);
      invalidate();
    } catch (err: any) {
      setImportResult({ parsed: 0, matched: 0, created: 0, runs: 0, summary: { PASS: 0, FAIL: 0, BLOCKED: 0 }, detail: [], errors: [{ name: file.name, message: err?.response?.data?.message ?? err?.message ?? '导入失败' }] });
    } finally {
      setImporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['test-cases', workspaceId, releaseId],
    queryFn: () => testCaseApi.list(workspaceId!, { releaseId }).then((r) => r.data),
    enabled: !!workspaceId && !!releaseId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['test-cases', workspaceId, releaseId] });
  };

  const markRunMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TestRun['status'] }) =>
      testCaseApi.markRun(workspaceId!, id, { status, releaseId }),
    onSuccess: () => { invalidate(); setPendingRun(null); },
    onError: () => setPendingRun(null),
  });

  const defectMutation = useMutation({
    mutationFn: ({ id, runId }: { id: string; runId: string }) =>
      testCaseApi.createDefect(workspaceId!, id, runId),
    onSuccess: () => { invalidate(); setPendingDefect(null); },
    onError: () => setPendingDefect(null),
  });

  const { items: cases = [] } = data ?? {};

  // 每个用例在当前 release 的执行结果（取最新一条 run；无 run 视为 UNTESTED）
  const runByCase = useMemo(() => {
    const map = new Map<string, TestRun>();
    for (const tc of cases) {
      const runs = (tc.testRuns ?? []).filter((r) => !r.releaseId || r.releaseId === releaseId);
      if (runs.length > 0) {
        // 后端 findOne 才带 testRuns；列表接口只带 _count，这里兜底（列表场景 run 数据在详情里取）
        map.set(tc.id, runs[0]);
      }
    }
    return map;
  }, [cases, releaseId]);

  // 列表接口已带 testRuns（按 release 过滤），通过率 = PASS/(PASS+FAIL)（BLOCKED/UNTESTED 单列）
  const executed = cases.filter((tc) => runByCase.has(tc.id)).length;
  const passCount = cases.filter((tc) => runByCase.get(tc.id)?.status === 'PASS').length;
  const failCount = cases.filter((tc) => runByCase.get(tc.id)?.status === 'FAIL').length;
  const total = cases.length;
  const passRate = passCount + failCount > 0 ? Math.round((passCount / (passCount + failCount)) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          {t('title')}
          <span className="text-sm font-normal text-muted-foreground">
            {total > 0 ? `${executed}/${total} ${t('executed')}` : ''}
          </span>
        </h2>
        {/* Phase 4: 测试自动化集成 — 导入 CI（JUnit XML）结果 */}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <TerminalSquare className="mr-1 h-3.5 w-3.5" />}
            {t('importCi')}
          </Button>
        </div>
      </div>

      {/* JUnit 导入结果弹窗 */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setImportResult(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 py-5">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <TerminalSquare className="h-4 w-4 text-primary" />{t('ciReportTitle')}
              </h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">{t('ciParsed', { count: importResult.parsed })}</Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700">{t('ciMatched', { count: importResult.matched })}</Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">{t('ciCreated', { count: importResult.created })}</Badge>
                <Badge variant="outline">{t('ciRuns', { count: importResult.runs })}</Badge>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />PASS {importResult.summary.PASS}</span>
                <span className="flex items-center gap-1 text-red-600"><CircleSlash className="h-4 w-4" />FAIL {importResult.summary.FAIL}</span>
                <span className="flex items-center gap-1 text-yellow-600"><CircleSlash className="h-4 w-4" />BLOCKED {importResult.summary.BLOCKED}</span>
              </div>
              {importResult.detail.length > 0 && (
                <div className="max-h-48 overflow-auto rounded-md border text-xs">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr>
                        <th className="border-b px-3 py-1.5">{t('ciCase')}</th>
                        <th className="border-b px-3 py-1.5">{t('ciStatus')}</th>
                        <th className="border-b px-3 py-1.5">{t('ciAction')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.detail.map((d, i) => (
                        <tr key={i}>
                          <td className="border-b px-3 py-1.5">{d.name}</td>
                          <td className="border-b px-3 py-1.5"><Badge variant="outline" className={runStatusStyle[d.status]}>{d.status}</Badge></td>
                          <td className="border-b px-3 py-1.5 text-muted-foreground">{d.action === 'created' ? `${t('ciCreated')} ${d.testCaseCode ?? ''}` : d.testCaseCode ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setImportResult(null)}>{c('close')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 通过率进度条 */}
      <Card className="mb-3">
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('passRate')}</span>
            <span className="font-medium">{total > 0 ? `${passRate}%` : '-'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500')}
              style={{ width: `${total > 0 ? passRate : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('passRateHint')}</p>
        </CardContent>
      </Card>

      {total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map((tc) => {
            const run = runByCase.get(tc.id);
            return (
              <Card key={tc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {tc.code && <Badge variant="outline" className="shrink-0 font-mono text-xs">{tc.code}</Badge>}
                    <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">{tc.type}</Badge>
                    <span className="truncate text-sm font-medium">{tc.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {disabled ? (
                      <Badge variant="outline" className={cn('text-xs', runStatusStyle[run?.status ?? 'UNTESTED'])}>
                        {run?.status ?? 'UNTESTED'}
                      </Badge>
                    ) : (
                      <>
                        {(['PASS', 'FAIL', 'BLOCKED'] as const).map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            className={cn('h-7 px-2 text-xs', runStatusStyle[s])}
                            disabled={markRunMutation.isPending && pendingRun === `${tc.id}:${s}`}
                            onClick={() => {
                              setPendingRun(`${tc.id}:${s}`);
                              markRunMutation.mutate({ id: tc.id, status: s });
                            }}
                          >
                            {s}
                          </Button>
                        ))}
                        {run?.status === 'FAIL' && !run.supportId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={defectMutation.isPending && pendingDefect === tc.id}
                            onClick={() => {
                              setPendingDefect(tc.id);
                              defectMutation.mutate({ id: tc.id, runId: run.id });
                            }}
                          >
                            {defectMutation.isPending && pendingDefect === tc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Bug className="h-3 w-3" />
                            )}
                            <span className="ml-1">{t('createDefect')}</span>
                          </Button>
                        )}
                        {run?.supportId && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs text-red-600 border-red-200">
                            <Bug className="h-3 w-3" />{t('hasDefect')}
                          </Badge>
                        )}
                        {run?.status === 'PASS' && (
                          run.supportId ? (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs text-green-600 border-green-200">
                              <CheckCircle2 className="h-3 w-3" />{t('passCanClose')}
                            </Badge>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )
                        )}
                        {run?.status === 'BLOCKED' && (
                          <CircleSlash className="h-4 w-4 text-yellow-600" />
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
