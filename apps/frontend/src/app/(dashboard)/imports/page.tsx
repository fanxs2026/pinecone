'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importApi, type ImportJobDetail } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, FileDown, FileUp, Loader2, TriangleAlert, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date-utils';
import { showToast } from '@/components/simple-toast';

const ENTITY_TYPES = ['IDEA', 'SUPPORT', 'TEST_CASE'] as const;

/** 每个实体的可导入字段（与后端白名单一致；2026-08-14 移除 IDEA 的 category/status、SUPPORT 的 status——新数据默认 OPEN） */
const FIELD_OPTIONS: Record<string, { field: string; required?: boolean }[]> = {
  IDEA: [
    { field: 'title', required: true },
    { field: 'description' },
    { field: 'tags' },
    { field: 'assigneeEmail' },
  ],
  SUPPORT: [
    { field: 'title', required: true },
    { field: 'description' },
    { field: 'type' },
    { field: 'tags' },
    { field: 'assigneeEmail' },
    { field: 'releaseName' },
  ],
  TEST_CASE: [
    { field: 'title', required: true },
    { field: 'description' },
    { field: 'type' },
    { field: 'expectedResult' },
    { field: 'priority' },
    { field: 'tags' },
    { field: 'storyCode' },
    { field: 'releaseName' },
  ],
};

const statusStyle: Record<string, string> = {
  PREVIEW: 'bg-gray-100 text-gray-600 border-gray-200',
  RUNNING: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  PARTIAL: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
};

export default function ImportsPage() {
  const t = useTranslations('imports');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();

  const [step, setStep] = useState<'pick' | 'map' | 'done'>('pick');
  const [entityType, setEntityType] = useState<(typeof ENTITY_TYPES)[number]>('SUPPORT');
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJobDetail | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ successCount: number; failCount: number; errors: { row: number; message: string }[] } | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['imports', workspaceId],
    queryFn: () => importApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const uploadMutation = useMutation({
    mutationFn: () => importApi.upload(workspaceId!, entityType, file!).then((r) => r.data),
    onSuccess: (data) => {
      setJob(data as ImportJobDetail);
      // 默认映射：第一列 → title（最常用）
      const first = data.columnHeaders[0];
      setMapping({ 0: 'title' });
      setStep('map');
    },
  });

  const runMutation = useMutation({
    mutationFn: () =>
      importApi.run(workspaceId!, job!.id, Object.fromEntries(
        Object.entries(mapping).map(([k, v]) => [k, { field: v }]),
      )).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['imports', workspaceId] });
    },
  });

  const reset = () => {
    setStep('pick');
    setEntityType('SUPPORT');
    setFile(null);
    setJob(null);
    setMapping({});
    setResult(null);
  };

  /** 2026-08-14：下载当前实体的 Excel 模板（axios blob，自动带 httpOnly cookie 认证） */
  const downloadTemplate = async () => {
    try {
      const res = await importApi.template(workspaceId!, entityType);
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-${entityType.toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e?.response?.data?.message || c('error'));
    }
  };

  const fields = FIELD_OPTIONS[entityType];
  const hasTitle = Object.values(mapping).includes('title');

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
        <p>{c('noWorkspaceYet')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        {step !== 'pick' && (
          <Button variant="outline" size="sm" onClick={reset}>
            <ArrowLeft className="mr-1 h-4 w-4" />{t('newImport')}
          </Button>
        )}
      </div>

      {/* ===== 步骤 1：选择实体 + 上传 ===== */}
      {step === 'pick' && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div>
              <label className="mb-2 block text-sm font-medium">{t('entityType')}</label>
              <div className="flex gap-2">
                {ENTITY_TYPES.map((et) => (
                  <button
                    key={et}
                    onClick={() => setEntityType(et)}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                      entityType === et ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {t(`entity_${et}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t(`entityHint_${entityType}`)}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('csvFile')}</label>
              {/* 2026-08-14：下载模板按钮 + 自定义文件选择（替代原生 input，避免"选择文件/未选择文件"误导） */}
              <div className="mb-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <FileDown className="mr-1 h-4 w-4" />
                  {t('downloadTemplate')}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">{t('templateHint')}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
                  <FileUp className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{file ? file.name : t('noFile')}</span>
                  <input
                    type="file"
                    accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
                <Button
                  disabled={!file || uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                >
                  {uploadMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  {t('uploadParse')}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('csvHint')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 步骤 2：预览 + 字段映射 ===== */}
      {step === 'map' && job && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{job.fileName}</span>
                <Badge variant="outline">{t('rows', { count: job.rowCount })}</Badge>
              </div>

              {/* 列映射 */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t('fieldMapping')}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {job.columnHeaders.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <span className="w-32 shrink-0 truncate font-mono text-xs text-muted-foreground">{header}</span>
                      <span className="text-muted-foreground">→</span>
                      <select
                        className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                        value={mapping[idx] ?? ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [idx]: e.target.value }))}
                      >
                        <option value="">— {c('none')} —</option>
                        {fields.map((f) => (
                          <option key={f.field} value={f.field}>
                            {t(`field_${f.field}`)}{f.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {!hasTitle && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                    <TriangleAlert className="h-3.5 w-3.5" />{t('titleRequired')}
                  </p>
                )}
              </div>

              {/* 预览 */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t('preview')}</h3>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr>
                        {job.columnHeaders.map((h, i) => (
                          <th key={i} className="border-b px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {job.preview.slice(0, 8).map((row, ri) => (
                        <tr key={ri}>
                          {job.columnHeaders.map((h, ci) => (
                            <td key={ci} className="max-w-[180px] truncate border-b px-3 py-1.5">{row[h] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {job.rowCount > 8 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t('previewMore', { count: job.rowCount - 8 })}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button disabled={!hasTitle || runMutation.isPending} onClick={() => runMutation.mutate()}>
                  {runMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  {t('runImport')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== 步骤 3：结果报告 ===== */}
      {step === 'done' && result && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className={statusStyle[result.successCount === 0 && result.failCount > 0 ? 'FAILED' : result.failCount > 0 ? 'PARTIAL' : 'COMPLETED']}>
                {result.failCount === 0 ? 'COMPLETED' : result.successCount > 0 ? 'PARTIAL' : 'FAILED'}
              </Badge>
              <span className="flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />{t('success', { count: result.successCount })}
              </span>
              <span className="flex items-center gap-1 text-sm text-red-600">
                <XCircle className="h-4 w-4" />{t('failed', { count: result.failCount })}
              </span>
            </div>

            {result.errors.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t('errorDetail')}</h3>
                <div className="max-h-56 overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr>
                        <th className="border-b px-3 py-2">{t('rowNum')}</th>
                        <th className="border-b px-3 py-2">{t('errorMsg')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="border-b px-3 py-1.5 font-mono">{e.row}</td>
                          <td className="border-b px-3 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={reset}>{t('newImport')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 历史任务 ===== */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t('history')}</h2>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (jobs?.length ?? 0) === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">{c('noData')}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {jobs?.map((j) => (
              <Card key={j.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{t(`entity_${j.entityType}`)}</Badge>
                    <span className="text-sm font-medium">{j.fileName}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(j.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className={statusStyle[j.status]}>{j.status}</Badge>
                    <span className="text-green-700">{j.successCount}✓</span>
                    <span className="text-red-600">{j.failCount}✗</span>
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
