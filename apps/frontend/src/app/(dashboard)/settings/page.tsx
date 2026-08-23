'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceApi, type WorkspaceMember } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuthStore } from '@/stores/auth-store';
import { useEditionStore } from '@/stores/edition-store';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { UserPlus, Mail, Shield, Trash2, Users, Crown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccessControlPanel } from '@/components/access-control-panel';
import { SsoConfigPanel } from '@/components/sso-config-panel';
import { ScimConfigPanel } from '@/components/scim-config-panel';
import Link from 'next/link';
import { KeyRound, RadioTower } from 'lucide-react';
import { WebhookConfigPanel } from '@/components/webhook-config-panel';
import { MarketplacePanel } from '@/components/marketplace-panel';
import { AdminAuditPanel } from '@/components/admin-audit-panel';
import { WorkflowConfigPanel } from '@/components/workflow-config-panel';
import { AutomationConfigPanel } from '@/components/automation-config-panel';
import { TeamConfigPanel } from '@/components/team-config-panel';
import { GithubConfigPanel } from '@/components/github-config-panel';
import { UnderlineTabs } from '@/components/underline-tabs';
import { FeedbackConfigPanel } from '@/components/feedback-config-panel';
import { SmtpConfigPanel } from '@/components/smtp-config-panel';

const ROLE_ORDER = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
type Role = (typeof ROLE_ORDER)[number];

const roleStyles: Record<Role, string> = {
  ADMIN: 'bg-amber-100 text-amber-700',
  MEMBER: 'bg-blue-100 text-blue-700',
  VIEWER: 'bg-gray-100 text-gray-600',
};

function initials(name?: string, email?: string): string {
  const src = (name || email || '?').trim();
  return src.slice(0, 2).toUpperCase();
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const currentUser = useAuthStore((s) => s.user);
  // 企业版功能页签过滤：社区版隐藏 SSO/Webhook/自动化/团队/GitHub 配置入口
  const edition = useEditionStore((s) => s.edition);
  const loadBootstrap = useEditionStore((s) => s.loadBootstrap);
  const editionLoaded = useEditionStore((s) => s.loaded);
  useEffect(() => {
    if (!editionLoaded) void loadBootstrap();
  }, [editionLoaded, loadBootstrap]);
  const isEnterprise = edition === 'enterprise';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [openMembers, setOpenMembers] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
  };

  const inviteMutation = useMutation({
    mutationFn: () => workspaceApi.invite(workspaceId!, email, role),
    onSuccess: () => {
      showToast(t('inviteSuccess'));
      setEmail('');
      setRole('MEMBER');
      invalidate();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg[0] : (msg || t('inviteFailed')));
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: Role }) =>
      workspaceApi.updateRole(workspaceId!, userId, newRole),
    onSuccess: () => {
      showToast(t('roleUpdated'));
      invalidate();
    },
    onError: () => showToast(t('roleUpdateFailed')),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(workspaceId!, userId),
    onSuccess: () => {
      showToast(t('memberRemoved'));
      invalidate();
    },
    onError: () => showToast(t('memberRemoveFailed')),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate();
  };

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {tCommon('loading')}
      </div>
    );
  }

  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role as Role) - ROLE_ORDER.indexOf(b.role as Role),
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* 下划线页签：成员管理 / 注册访问控制 / 企业登录 / Webhook / 系统管理
          企业功能页签（sso/webhook/automation/team/github）仅企业版显示 */}
      <UnderlineTabs
        tabs={[
          { key: 'members', label: t('tabMembers') },
          { key: 'access', label: t('tabAccess') },
          { key: 'feedback', label: t('tabFeedback') },
          ...(isEnterprise ? [{ key: 'sso', label: t('tabSso') }] : []),
          ...(isEnterprise ? [{ key: 'webhook', label: t('tabWebhook') }] : []),
          { key: 'workflow', label: t('tabWorkflow') },
          { key: 'marketplace', label: t('tabMarketplace') },
          ...(isEnterprise ? [{ key: 'automation', label: t('tabAutomation') }] : []),
          ...(isEnterprise ? [{ key: 'team', label: t('tabTeam') }] : []),
          ...(isEnterprise ? [{ key: 'github', label: t('tabGithub') }] : []),
          { key: 'smtp', label: t('tabSmtp') },
          ...(currentUser?.isSystemAdmin ? [{ key: 'admin', label: t('tabAdmin') }] : []),
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {/* 页签1：成员管理（邀请 + 成员列表） */}
      {activeTab === 'members' && (
      <>
      {/* 邀请表单 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {t('inviteTitle')}
          </CardTitle>
          <CardDescription>{t('inviteDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="pl-9"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              disabled={inviteMutation.isPending || !email.trim()}
            >
              {inviteMutation.isPending ? tCommon('loading') : t('invite')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 成员列表 */}
      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setOpenMembers(!openMembers)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-base font-semibold">{t('memberListTitle')}</span>
            <Badge variant="secondary">{members.length}</Badge>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openMembers ? '' : '-rotate-90'}`} />
          </button>
        </CardHeader>
        {openMembers && (
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tCommon('noData')}</p>
          ) : (
            sorted.map((m) => {
              const isSelf = m.userId === currentUser?.id;
              const isLastAdmin =
                m.role === 'ADMIN' &&
                members.filter((x) => x.role === 'ADMIN').length === 1;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(m.user.name, m.user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {m.user.name || m.user.email}
                      </span>
                      {isSelf && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('you')}
                        </Badge>
                      )}
                      {m.role === 'ADMIN' && (
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{m.user.email}</div>
                  </div>
                  <select
                    value={m.role as Role}
                    disabled={isSelf || isLastAdmin || roleMutation.isPending}
                    onChange={(e) =>
                      roleMutation.mutate({ userId: m.userId, newRole: e.target.value as Role })
                    }
                    className={cn(
                      'h-8 rounded-md border border-input bg-background px-2 text-xs font-medium',
                      roleStyles[m.role as Role],
                    )}
                  >
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf || isLastAdmin || removeMutation.isPending}
                    onClick={() => {
                      if (confirm(t('removeConfirm'))) removeMutation.mutate(m.userId);
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
        )}
      </Card>
      </>
      )}

      {/* 页签2：注册访问控制（白名单 + 邀请码） */}
      {activeTab === 'access' && (
        <>
          <AccessControlPanel />
          {currentUser?.isSystemAdmin && (
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium">{t('licenseAdmin')}</p>
                  <p className="text-xs text-muted-foreground">{t('licenseAdminDesc')}</p>
                </div>
                <Link
                  href="/admin/licenses"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {t('licenseAdminOpen')}
                </Link>
              </CardContent>
            </Card>
          )}
          {currentUser?.isSystemAdmin && (
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium">{t('instancesAdmin')}</p>
                  <p className="text-xs text-muted-foreground">{t('instancesAdminDesc')}</p>
                </div>
                <Link
                  href="/admin/instances"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <RadioTower className="h-3.5 w-3.5" />
                  {t('licenseAdminOpen')}
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 页签3：反馈门户 + 评分模型（P0） */}
      {activeTab === 'feedback' && (
        <FeedbackConfigPanel workspaceId={workspaceId} />
      )}

      {/* 页签4：企业登录（OIDC / SAML + SCIM 预配） */}
      {activeTab === 'sso' && (
        <>
          <SsoConfigPanel />
          <ScimConfigPanel />
        </>
      )}

      {/* 页签4：Webhook 端点管理 */}
      {activeTab === 'webhook' && (
        <WebhookConfigPanel />
      )}

      {/* 页签5：可配置工作流（状态方案 + 转换规则，仅工作区管理员） */}
      {activeTab === 'workflow' && (
        <WorkflowConfigPanel workspaceId={workspaceId} />
      )}

      {/* I11 插件市场（2026-08-18 P2） */}
      {activeTab === 'marketplace' && (
        <MarketplacePanel workspaceId={workspaceId} />
      )}

      {/* 页签6：自动化规则（当…则…，仅工作区管理员） */}
      {activeTab === 'automation' && (
        <AutomationConfigPanel workspaceId={workspaceId} />
      )}

      {/* 页签7：团队（项目/团队级权限隔离，仅工作区管理员） */}
      {activeTab === 'team' && (
        <TeamConfigPanel workspaceId={workspaceId} />
      )}

      {/* 页签8：GitHub 代码集成（仓库配置，仅工作区管理员） */}
      {activeTab === 'github' && (
        <GithubConfigPanel workspaceId={workspaceId} />
      )}

      {/* 页签9：邮件服务 SMTP（平台级，REGISTRATION_ADMIN_EMAILS 可配） */}
      {activeTab === 'smtp' && (
        <SmtpConfigPanel />
      )}

      {/* 页签10：系统管理（操作审计，仅平台系统管理员可见） */}
      {activeTab === 'admin' && (
        <AdminAuditPanel isSystemAdmin={currentUser?.isSystemAdmin} />
      )}
    </div>
  );
}
