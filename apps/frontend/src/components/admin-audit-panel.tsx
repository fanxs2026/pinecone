'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi, workspaceApi, type AuditLogEntry, type Workspace } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Download, Search, Loader2 } from 'lucide-react';
import { showToast } from '@/components/simple-toast';

const actionStyle: Record<string, string> = {
  LOGIN: 'bg-green-100 text-green-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  CREATE: 'bg-blue-100 text-blue-700',
  UPDATE: 'bg-indigo-100 text-indigo-700',
  DELETE: 'bg-red-100 text-red-600',
  IMPORT: 'bg-purple-100 text-purple-700',
  EXPORT: 'bg-purple-100 text-purple-700',
  CONFIG_CHANGE: 'bg-amber-100 text-amber-700',
  STATUS_CHANGED: 'bg-cyan-100 text-cyan-700',
};

/** 设置页「系统管理」页签：操作审计查询与导出（仅平台系统管理员） */
export function AdminAuditPanel({ isSystemAdmin }: { isSystemAdmin?: boolean }) {
  const t = useTranslations('auditPanel');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  // 2026-08-19：平台审计默认看全部工作区；可按工作区过滤（'' = 全部）
  const [workspaceId, setWorkspaceId] = useState('');
  const [page, setPage] = useState(1);

  // 工作区下拉数据（仅系统管理员面板用；选择器是跨工作区的）
  const { data: workspaces } = useQuery({
    queryKey: ['audit-workspaces'],
    queryFn: () => workspaceApi.list().then((r) => r.data),
    enabled: isSystemAdmin === true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', workspaceId, search, action, page],
    queryFn: () =>
      auditApi.query({
        workspaceId: workspaceId || undefined,
        search: search || undefined,
        action: action || undefined,
        page: String(page),
        pageSize: '20',
      }).then((r) => r.data),
    enabled: isSystemAdmin === true,
  });

  const exportMutation = useMutation({
    mutationFn: () => auditApi.exportCsv({ workspaceId: workspaceId || undefined }),
    onSuccess: (res) => {
      const url = URL.createObjectURL(new Blob([res.data as Blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => showToast(t('exportFailed')),
  });

  if (isSystemAdmin !== true) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{t('adminOnly')}</CardContent>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />{t('title')}
        </CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('searchPh')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={workspaceId}
            onChange={(e) => { setWorkspaceId(e.target.value); setPage(1); }}
          >
            <option value="">{t('allWorkspaces')}</option>
            {(workspaces ?? []).map((w: Workspace) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
          >
            <option value="">{t('allActions')}</option>
            {['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT', 'CONFIG_CHANGE'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
            {exportMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}{t('export')}
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="border-b px-3 py-2">{t('colTime')}</th>
                  <th className="border-b px-3 py-2">{t('colUser')}</th>
                  <th className="border-b px-3 py-2">{t('colAction')}</th>
                  <th className="border-b px-3 py-2">{t('colEntity')}</th>
                  <th className="border-b px-3 py-2">{t('colWorkspace')}</th>
                  <th className="border-b px-3 py-2">{t('colIp')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((log: AuditLogEntry) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="border-b px-3 py-1.5 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                    {/* 2026-08-19：优先显示姓名（原仅显示 userEmail/UUID 截断） */}
                    <td className="border-b px-3 py-1.5">{log.userName || log.userEmail || log.userId?.slice(0, 8) || '-'}</td>
                    <td className="border-b px-3 py-1.5">
                      <Badge variant="outline" className={actionStyle[log.action] ?? 'bg-gray-100 text-gray-600'}>{log.action}</Badge>
                    </td>
                    {/* 2026-08-19：实体显示业务编号（{SLUG}-{P}-{SEQ}），标题作 tooltip/兜底 */}
                    <td className="border-b px-3 py-1.5">
                      {log.entityType || '-'}
                      {log.entityCode
                        ? <span className="ml-1 font-mono text-foreground" title={log.entityTitle ?? ''}>{log.entityCode}</span>
                        : log.entityId ? ` ${log.entityId.slice(0, 8)}` : ''}
                    </td>
                    <td className="border-b px-3 py-1.5">{log.workspaceName || '-'}</td>
                    <td className="border-b px-3 py-1.5 font-mono text-muted-foreground">{log.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="outline" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</Button>
            <span className="text-muted-foreground">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('next')}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
