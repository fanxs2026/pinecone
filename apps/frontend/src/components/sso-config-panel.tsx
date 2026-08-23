'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ssoProviderApi, workspaceApi, type SsoProvider } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuthStore } from '@/stores/auth-store';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Building2, KeyRound, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { UnderlineTabs } from '@/components/underline-tabs';

const emptyForm = {
  type: 'OIDC' as 'OIDC' | 'SAML',
  name: '',
  issuer: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
  domainWhitelist: '',
  idpMetadataXml: '',
  spEntityId: '',
};

/** 设置页「企业登录（SSO/OIDC · SAML）」配置区块：仅工作区 ADMIN 可见/可操作 */
export function SsoConfigPanel() {
  const t = useTranslations('ssoConfig');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const currentUser = useAuthStore((s) => s.user);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SsoProvider | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const isAdmin = members.some((m) => m.userId === currentUser?.id && m.role === 'ADMIN');

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['sso-providers', workspaceId],
    queryFn: () => ssoProviderApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId && isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sso-providers', workspaceId] });

  const buildPayload = () => {
    const base = {
      name: form.name.trim(),
      type: form.type,
      domainWhitelist: form.domainWhitelist.split(',').map((s) => s.trim()).filter(Boolean),
      active: editing ? undefined : true,
    };
    if (form.type === 'SAML') {
      return {
        ...base,
        idpMetadataXml: form.idpMetadataXml,
        spEntityId: form.spEntityId.trim() || undefined,
        clientId: form.spEntityId.trim() || undefined,
      };
    }
    return {
      ...base,
      issuer: form.issuer.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret || undefined,
      scopes: form.scopes.trim() || undefined,
    };
  };

  const createMutation = useMutation({
    mutationFn: () => ssoProviderApi.create(workspaceId!, buildPayload() as any).then((r) => r.data),
    onSuccess: (data) => {
      invalidate();
      setShowForm(false);
      setForm(emptyForm);
      setRevealedSecret(data.clientSecret ?? null);
      showToast(t('created'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => ssoProviderApi.update(workspaceId!, id, buildPayload() as any).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      showToast(t('updated'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => ssoProviderApi.remove(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('removed')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const startEdit = (p: SsoProvider) => {
    setEditing(p);
    const isSaml = p.providerType === 'SAML';
    setForm({
      type: isSaml ? 'SAML' : 'OIDC',
      name: p.name,
      issuer: p.issuer ?? '',
      clientId: p.clientId ?? '',
      clientSecret: '',
      scopes: p.scopes ?? 'openid profile email',
      domainWhitelist: (p.domainWhitelist ?? []).join(', '),
      idpMetadataXml: isSaml ? p.idpMetadataXml ?? '' : '',
      spEntityId: p.spEntityId ?? '',
    });
    setShowForm(true);
  };

  const switchType = (type: 'OIDC' | 'SAML') => {
    setForm({ ...emptyForm, type, name: form.name, domainWhitelist: form.domainWhitelist });
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{t('adminOnly')}</CardContent>
      </Card>
    );
  }

  const acsUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/saml/sp/acs`;
  const canSubmit =
    !!form.name.trim() &&
    (form.type === 'SAML'
      ? !!form.idpMetadataXml.trim()
      : !!form.issuer.trim() && !!form.clientId.trim() && (!editing || !!form.clientSecret || !!form.clientId));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />{t('title')}
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>
            <Plus className="mr-1 h-4 w-4" />{t('newProvider')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-3 rounded-md border p-3">
            {/* 类型切换（下划线页签：下划线在谁下面谁是当前） */}
            <UnderlineTabs
              size="sm"
              tabs={[
                { key: 'OIDC', label: 'OIDC' },
                { key: 'SAML', label: 'SAML' },
              ]}
              activeKey={form.type}
              onChange={(k) => switchType(k as 'OIDC' | 'SAML')}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('fName')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('fNamePh')} />
              </div>

              {form.type === 'SAML' ? (
                <>
                  <div className="space-y-1">
                    <Label>{t('fSpEntityId')}</Label>
                    <Input value={form.spEntityId} onChange={(e) => setForm({ ...form, spEntityId: e.target.value })} placeholder="urn:pinecone:saml:sp" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('fIdpMetadata')}</Label>
                    <textarea
                      className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-xs font-mono"
                      value={form.idpMetadataXml}
                      onChange={(e) => setForm({ ...form, idpMetadataXml: e.target.value })}
                      placeholder={'<?xml version="1.0"?><md:EntityDescriptor .../>'}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('fAcsUrl')}</Label>
                    <code className="block rounded bg-muted px-2 py-1 text-xs break-all">{acsUrl}</code>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{t('fIssuer')}</Label>
                    <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="https://login.microsoftonline.com/{tenant}/v2.0" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('fClientId')}</Label>
                    <Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{editing ? t('fSecretEdit') : t('fSecret')}</Label>
                    <Input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={editing ? t('fSecretPh') : ''} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('fScopes')}</Label>
                    <Input value={form.scopes} onChange={(e) => setForm({ ...form, scopes: e.target.value })} />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label>{t('fDomains')}</Label>
                <Input value={form.domainWhitelist} onChange={(e) => setForm({ ...form, domainWhitelist: e.target.value })} placeholder="company.com, example.com" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
                onClick={() => (editing ? updateMutation.mutate(editing.id) : createMutation.mutate())}>
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 h-3.5 w-3.5" />}
                {editing ? t('save') : t('create')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditing(null); setForm(emptyForm); }}>{t('cancel')}</Button>
            </div>
            {revealedSecret && !editing && form.type === 'OIDC' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <b>{t('secretOnce')}</b> <code className="break-all">{revealedSecret}</code>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : providers.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700">{p.providerType || 'OIDC'}</Badge>
                  <Badge variant="outline" className={p.active === false ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}>{p.active === false ? t('inactive') : t('active')}</Badge>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {p.issuer} · {t('domains')}: {(p.domainWhitelist ?? []).join(', ') || '-'}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(p)} title={t('edit')}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => { if (confirm(t('confirmDelete'))) removeMutation.mutate(p.id); }} title={t('delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
