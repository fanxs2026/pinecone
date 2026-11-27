'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { formatDateTime } from '@/lib/date-utils';
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Search, ShieldAlert, ShieldOff, X } from 'lucide-react';

interface LicenseRow {
  id: string;
  customerName: string;
  customerEmail: string;
  licenseKey: string;
  edition: string;
  seats: number;
  issuedAt: string;
  expiresAt: string;
  status: string;
  notes: string | null;
  lastSeenAt: string | null;
  lastVersion: string | null;
}

interface LicenseResp {
  items: LicenseRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;
const EDITIONS = ['COMMUNITY', 'PRO', 'ENTERPRISE'];
const STATUSES = ['', 'ACTIVE', 'EXPIRED', 'REVOKED'];

/**
 * 客户管理后台（平台管理端，企业版）
 *
 * 数据源：GET/POST /api/admin/licenses、PATCH /:id/renew、DELETE /:id（仅系统管理员）。
 * 社区版包里后端没有 license 模块 → 404，这里降级为「企业版功能」提示。
 */
export default function AdminLicensesPage() {
  const t = useTranslations('license');
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [issueOpen, setIssueOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<LicenseRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<LicenseRow | null>(null);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    edition: 'ENTERPRISE',
    seats: 5,
    days: 365,
    notes: '',
  });
  const [renewDays, setRenewDays] = useState(365);

  const queryKey = ['admin-licenses', search, status, page];

  const { data, isLoading, isFetching, error, refetch } = useQuery<LicenseResp>({
    queryKey,
    queryFn: () =>
      apiClient
        .get('/admin/licenses', { params: { search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE } })
        .then((r) => r.data),
    retry: false,
  });

  const issue = useMutation({
    mutationFn: () => apiClient.post('/admin/licenses', form).then((r) => r.data),
    onSuccess: (res: any) => {
      showToast(t('issued', { key: (res?.licenseKey || '').slice(0, 18) + '…' }));
      setIssueOpen(false);
      setForm({ customerName: '', customerEmail: '', edition: 'ENTERPRISE', seats: 5, days: 365, notes: '' });
      qc.invalidateQueries({ queryKey: ['admin-licenses'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const renew = useMutation({
    mutationFn: (row: LicenseRow) =>
      apiClient.patch('/admin/licenses/' + row.id + '/renew', { days: renewDays }).then((r) => r.data),
    onSuccess: () => {
      showToast(t('renewed'));
      setRenewTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-licenses'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const revoke = useMutation({
    mutationFn: (row: LicenseRow) => apiClient.delete('/admin/licenses/' + row.id).then((r) => r.data),
    onSuccess: () => {
      showToast(t('revoked'));
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-licenses'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const httpStatus = (error as any)?.response?.status;

  if (httpStatus === 403) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">{t('forbidden')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('forbiddenDesc')}</p>
      </div>
    );
  }

  // 社区版：后端没有 license 模块（404/501），不报错，直接说明是企业版能力
  if (httpStatus === 404 || httpStatus === 501) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldOff className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">{t('enterpriseOnlyTitle')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('enterpriseOnlyDesc')}</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const statusStyle: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    EXPIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    REVOKED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  };
  const statusLabel: Record<string, string> = {
    ACTIVE: t('active'),
    EXPIRED: t('expired'),
    REVOKED: t('revokedStatus'),
  };

  const daysLeft = (expiresAt: string) => Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      showToast(t('issued', { key: key.slice(0, 18) + '…' }));
    } catch {
      showToast(t('error'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={'mr-1 h-4 w-4' + (isFetching ? ' animate-spin' : '')} />
            {t('refresh')}
          </Button>
          <Button size="sm" onClick={() => setIssueOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('issue')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t('searchPh')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput.trim());
                    setPage(1);
                  }
                }}
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s === '' ? t('allStatus') : statusLabel[s]}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {(error as any)?.message || t('error')}
            </p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t('colCustomer')}</th>
                    <th className="py-2 pr-4 font-medium">{t('colKey')}</th>
                    <th className="py-2 pr-4 font-medium">{t('colEdition')}</th>
                    <th className="py-2 pr-4 font-medium">{t('seatsLabel')}</th>
                    <th className="py-2 pr-4 font-medium">{t('expiresLabel')}</th>
                    <th className="py-2 pr-4 font-medium">{t('colStatus')}</th>
                    <th className="py-2 pr-4 font-medium">{t('lastSeen')}</th>
                    <th className="py-2 font-medium">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const left = daysLeft(row.expiresAt);
                    return (
                      <tr key={row.id} className="border-b align-top last:border-0 hover:bg-muted/40">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium">{row.customerName}</p>
                          <p className="text-xs text-muted-foreground">{row.customerEmail}</p>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs" title={row.licenseKey}>
                              {row.licenseKey.slice(0, 10)}…
                            </span>
                            <button
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => copyKey(row.licenseKey)}
                              title="copy"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant="outline">{row.edition}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{row.seats}</td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <p>{formatDateTime(row.expiresAt)}</p>
                          {row.status === 'ACTIVE' && left >= 0 && left <= 30 && (
                            <p className="text-xs text-amber-600">{t('expiringSoon', { days: left })}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={'rounded px-2 py-0.5 text-xs ' + (statusStyle[row.status] || '')}>
                            {statusLabel[row.status] || row.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                          {row.lastSeenAt ? formatDateTime(row.lastSeenAt) : t('never')}
                        </td>
                        <td className="py-2.5">
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setRenewDays(365);
                                setRenewTarget(row);
                              }}
                            >
                              {t('renew')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              disabled={row.status === 'REVOKED'}
                              onClick={() => setRevokeTarget(row)}
                            >
                              {t('revoke')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > data.pageSize && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('page', { page: data.page, total: totalPages })}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ←
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 签发 */}
      {issueOpen && (
        <Modal title={t('issue')} onClose={() => setIssueOpen(false)}>
          <div className="space-y-3">
            <Field label={t('customerName')}>
              <Input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder="ACME Ltd"
              />
            </Field>
            <Field label={t('customerEmail')}>
              <Input
                type="email"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                placeholder="ops@acme.com"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('colEdition')}>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={form.edition}
                  onChange={(e) => setForm({ ...form, edition: e.target.value })}
                >
                  {EDITIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('seats')}>
                <Input
                  type="number"
                  min={1}
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: Number(e.target.value) || 1 })}
                />
              </Field>
              <Field label={t('days')}>
                <Input
                  type="number"
                  min={1}
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: Number(e.target.value) || 1 })}
                />
              </Field>
            </div>
            <Field label={t('notes')}>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="—"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setIssueOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                disabled={issue.isPending || !form.customerName.trim() || !form.customerEmail.trim()}
                onClick={() => issue.mutate()}
              >
                {issue.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t('issue')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 续期 */}
      {renewTarget && (
        <Modal title={t('renew')} onClose={() => setRenewTarget(null)}>
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{renewTarget.customerName}</span>{' '}
              <span className="text-muted-foreground">{renewTarget.customerEmail}</span>
            </p>
            <Field label={t('renewDays')}>
              <Input
                type="number"
                min={1}
                value={renewDays}
                onChange={(e) => setRenewDays(Number(e.target.value) || 1)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRenewTarget(null)}>
                {t('cancel')}
              </Button>
              <Button size="sm" disabled={renew.isPending} onClick={() => renew.mutate(renewTarget)}>
                {renew.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t('renew')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 吊销 */}
      {revokeTarget && (
        <Modal title={t('revoke')} onClose={() => setRevokeTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('revokeConfirm')}</p>
            <p className="text-sm">
              <span className="font-medium">{revokeTarget.customerName}</span>{' '}
              <span className="text-muted-foreground">{revokeTarget.customerEmail}</span>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(revokeTarget)}
              >
                {revoke.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t('revoke')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
