'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { registrationAdminApi, type InviteCode, type WhitelistEntry, type AdminUser } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, KeyRound, MailPlus, Trash2, Copy, Power, Users, ChevronDown } from 'lucide-react';

/**
 * 防抖 hook：搜索框输入即时更新本地 state（不丢光标），
 * 停止输入 delay 毫秒后才更新返回值（触发查询）。
 * 修复：搜索框每次击键触发重新查询 → 列表 pending 重渲染 → 输入框失焦。
 */
function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** 可折叠区块头（标题 + 右侧计数 + 折叠箭头） */
function SectionHeader({
  icon, title, count, open, onToggle,
}: {
  icon: React.ReactNode; title: string; count?: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 text-left text-sm font-medium hover:text-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      {title}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{count}</span>
      )}
      <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
  );
}

/** 简易分页器 */
function Pagination({
  page, pageSize, total, onChange, t,
}: {
  page: number; pageSize: number; total: number; onChange: (p: number) => void;
  t: (key: string, values?: any) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1 && total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
      <span>{t('paginationInfo', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded border border-input px-2 py-1 hover:bg-accent disabled:opacity-40"
        >
          {t('prev')}
        </button>
        <span className="px-2">{page} / {totalPages}</span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded border border-input px-2 py-1 hover:bg-accent disabled:opacity-40"
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
}

/** 注册访问控制面板：白名单 + 邀请码 + 用户管理（仅 REGISTRATION_ADMIN_EMAILS 管理员可见/可操作） */
export function AccessControlPanel() {
  const t = useTranslations('accessControl');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // 折叠状态（默认展开）
  const [openWl, setOpenWl] = useState(true);
  const [openCodes, setOpenCodes] = useState(true);
  const [openUsers, setOpenUsers] = useState(true);

  // 白名单新增
  const [wlEmail, setWlEmail] = useState('');
  const [wlNote, setWlNote] = useState('');
  // 邀请码新增
  const [codeInput, setCodeInput] = useState('');
  const [codeNote, setCodeNote] = useState('');
  const [maxUses, setMaxUses] = useState(1);

  // 分页状态（每页 15 条）
  const PAGE_SIZE = 15;
  const [wlPage, setWlPage] = useState(1);
  const [wlSearch, setWlSearch] = useState('');
  const debouncedWlSearch = useDebouncedValue(wlSearch);
  const [codePage, setCodePage] = useState(1);
  const [codeSearch, setCodeSearch] = useState('');
  const debouncedCodeSearch = useDebouncedValue(codeSearch);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebouncedValue(userSearch);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reg-admin'] });
  };

  // 模式
  const { data: modeData, isError: modeError, isLoading: modeLoading } = useQuery({
    queryKey: ['reg-admin', 'mode'],
    queryFn: () => registrationAdminApi.mode().then((r) => r.data),
  });

  const { data: wlData } = useQuery({
    queryKey: ['reg-admin', 'whitelist', wlPage, debouncedWlSearch],
    queryFn: () => registrationAdminApi.listWhitelist({ page: wlPage, pageSize: PAGE_SIZE, search: debouncedWlSearch }).then((r) => r.data),
    enabled: !!modeData,
    placeholderData: keepPreviousData, // 查询期间保留旧列表，避免 DOM 塌陷导致输入框失焦
  });
  const whitelist = wlData?.items ?? [];

  const { data: codesData } = useQuery({
    queryKey: ['reg-admin', 'codes', codePage, debouncedCodeSearch],
    queryFn: () => registrationAdminApi.listInviteCodes({ page: codePage, pageSize: PAGE_SIZE, search: debouncedCodeSearch }).then((r) => r.data),
    enabled: !!modeData,
    placeholderData: keepPreviousData,
  });
  const codes = codesData?.items ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['reg-admin', 'users', userPage, debouncedUserSearch],
    queryFn: () => registrationAdminApi.listUsers({ page: userPage, pageSize: PAGE_SIZE, search: debouncedUserSearch }).then((r) => r.data),
    enabled: !!modeData,
    placeholderData: keepPreviousData,
  });
  const users = usersData?.items ?? [];

  const statusMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      registrationAdminApi.setUserActive(id, active),
    onSuccess: () => {
      showToast(t('userStatusUpdated'));
      invalidate();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('userStatusFailed')),
  });

  const addWl = useMutation({
    mutationFn: () => registrationAdminApi.addWhitelist(wlEmail.trim(), wlNote || undefined),
    onSuccess: () => { showToast(t('wlAdded')); setWlEmail(''); setWlNote(''); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('wlAddFailed')),
  });

  const removeWl = useMutation({
    mutationFn: (id: string) => registrationAdminApi.removeWhitelist(id),
    onSuccess: () => { showToast(t('wlRemoved')); invalidate(); },
    onError: () => showToast(t('wlRemoveFailed')),
  });

  const createCode = useMutation({
    mutationFn: () =>
      registrationAdminApi.createInviteCode({
        code: codeInput.trim() || undefined,
        note: codeNote || undefined,
        maxUses,
      }),
    onSuccess: (res) => {
      showToast(t('codeCreated'));
      setCodeInput(''); setCodeNote(''); setMaxUses(1);
      invalidate();
      // 复制生成的码
      if (res.data?.code) navigator.clipboard?.writeText(res.data.code).catch(() => {});
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('codeCreateFailed')),
  });

  const toggleCode = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      registrationAdminApi.updateInviteCode(id, { active: !active }),
    onSuccess: () => { showToast(t('codeUpdated')); invalidate(); },
    onError: () => showToast(t('codeUpdateFailed')),
  });

  const deleteCode = useMutation({
    mutationFn: (id: string) => registrationAdminApi.deleteInviteCode(id),
    onSuccess: () => { showToast(t('codeDeleted')); invalidate(); },
    onError: () => showToast(t('codeDeleteFailed')),
  });

  if (modeLoading) {
    return (
      <Card>
        <CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  // P3-6 修复：无权限（非管理员）不静默隐藏——给可见提示（原 return null）
  if (modeError || !modeData) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {t('noAdminHint')}
        </CardContent>
      </Card>
    );
  }

  const modeLabel: Record<string, string> = {
    open: t('modeOpen'),
    whitelist: t('modeWhitelist'),
    invite: t('modeInvite'),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" />
          {t('title')}
        </CardTitle>
        <CardDescription>
          {t('desc')}
          <Badge variant="outline" className="ml-2 font-mono text-xs">
            {modeData?.mode} · {modeLabel[modeData?.mode || 'open']}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 白名单 */}
        <div className="space-y-3">
          <SectionHeader
            icon={<MailPlus className="h-4 w-4" />}
            title={t('whitelistTitle')}
            count={whitelist.length}
            open={openWl}
            onToggle={() => setOpenWl(!openWl)}
          />
          {openWl && (
            <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="email"
              placeholder={t('wlEmailPlaceholder')}
              value={wlEmail}
              onChange={(e) => setWlEmail(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder={t('wlNotePlaceholder')}
              value={wlNote}
              onChange={(e) => setWlNote(e.target.value)}
              className="sm:w-40"
            />
            <Button size="sm" disabled={!wlEmail.trim() || addWl.isPending} onClick={() => addWl.mutate()}>
              {addWl.isPending ? c('loading') : t('wlAdd')}
            </Button>
          </div>
          <Input
            placeholder={t('searchPlaceholder')}
            value={wlSearch}
            onChange={(e) => { setWlSearch(e.target.value); setWlPage(1); }}
            className="max-w-xs"
          />
          <div className="rounded-md border divide-y">
            {whitelist.length > 0 ? whitelist.map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 truncate">{w.email}</span>
                {w.note && <span className="text-xs text-muted-foreground truncate">{w.note}</span>}
                <button
                  onClick={() => removeWl.mutate(w.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">{t('noMatch')}</div>
            )}
          </div>
          {wlData && (
            <Pagination page={wlPage} pageSize={PAGE_SIZE} total={wlData.total} onChange={setWlPage} t={t} />
          )}
            </>
          )}
        </div>

        {/* 邀请码 */}
        <div className="space-y-3">
          <SectionHeader
            icon={<KeyRound className="h-4 w-4" />}
            title={t('codesTitle')}
            count={codes.length}
            open={openCodes}
            onToggle={() => setOpenCodes(!openCodes)}
          />
          {openCodes && (
            <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder={t('codePlaceholder')}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
              className="sm:w-20"
              title={t('maxUses')}
            />
            <Button size="sm" disabled={createCode.isPending} onClick={() => createCode.mutate()}>
              {createCode.isPending ? c('loading') : t('codeCreate')}
            </Button>
          </div>
          <Input
            placeholder={t('searchCodePlaceholder')}
            value={codeSearch}
            onChange={(e) => { setCodeSearch(e.target.value); setCodePage(1); }}
            className="max-w-xs"
          />
          <div className="rounded-md border divide-y">
            {codes.length > 0 ? codes.map((cd) => {
              const expired = cd.expiresAt && new Date(cd.expiresAt) < new Date();
              const exhausted = cd.usedCount >= cd.maxUses;
              const invalid = !cd.active || !!expired || exhausted;
              return (
                <div key={cd.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <button
                    onClick={() => toggleCode.mutate({ id: cd.id, active: cd.active })}
                    className="text-muted-foreground hover:text-primary"
                    title={cd.active ? t('deactivate') : t('activate')}
                  >
                    <Power className={`h-3.5 w-3.5 ${cd.active ? '' : 'opacity-40'}`} />
                  </button>
                  <code className={`flex-1 font-mono text-xs ${invalid ? 'text-muted-foreground line-through' : ''}`}>
                    {cd.code}
                  </code>
                  <span className="text-xs text-muted-foreground">{cd.usedCount}/{cd.maxUses}</span>
                  {cd.note && <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[120px]">{cd.note}</span>}
                  {invalid && (
                    <Badge variant="secondary" className="text-[10px]">
                      {exhausted ? t('exhausted') : expired ? t('expired') : t('inactive')}
                    </Badge>
                  )}
                  <button
                    onClick={() => navigator.clipboard?.writeText(cd.code)}
                    className="text-muted-foreground hover:text-foreground"
                    title={t('copy')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteCode.mutate(cd.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">{t('noMatch')}</div>
            )}
          </div>
          {codesData && (
            <Pagination page={codePage} pageSize={PAGE_SIZE} total={codesData.total} onChange={setCodePage} t={t} />
          )}
            </>
          )}
        </div>

        {/* 用户管理：禁用/启用 */}
        <div className="space-y-3">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title={t('usersTitle')}
            count={users.length}
            open={openUsers}
            onToggle={() => setOpenUsers(!openUsers)}
          />
          {openUsers && !usersData ? (
            <Skeleton className="h-16 w-full" />
          ) : openUsers ? (
            <>
          <Input
            placeholder={t('searchUserPlaceholder')}
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
            className="max-w-xs"
          />
          <div className="rounded-md border divide-y">
            {users.length > 0 ? users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">
                    {u.name || u.email}
                    <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <Badge variant={u.active ? 'default' : 'secondary'} className="text-[10px]">
                    {u.active ? t('userActive') : t('userDisabled')}
                  </Badge>
                  <Button
                    size="sm"
                    variant={u.active ? 'outline' : 'default'}
                    disabled={isSelf || statusMut.isPending}
                    onClick={() => statusMut.mutate({ id: u.id, active: !u.active })}
                  >
                    <Power className="mr-1 h-3 w-3" />
                    {u.active ? t('userDisable') : t('userEnable')}
                  </Button>
                </div>
              );
            }) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">{t('noMatch')}</div>
            )}
          </div>
          {usersData && (
            <Pagination page={userPage} pageSize={PAGE_SIZE} total={usersData.total} onChange={setUserPage} t={t} />
          )}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
