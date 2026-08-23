'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, workspaceApi, type Team } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Users, Plus, Trash2, Loader2, UserPlus, UserMinus } from 'lucide-react';
import { showToast } from '@/components/simple-toast';

export function TeamConfigPanel({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('teamConfig');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [memberPick, setMemberPick] = useState<Record<string, string>>({});

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams', workspaceId],
    queryFn: () => teamsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: members } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['teams', workspaceId] });

  const createTeam = useMutation({
    mutationFn: () => teamsApi.create(workspaceId!, { name, description: desc || undefined }).then((r) => r.data),
    onSuccess: () => { invalidate(); setName(''); setDesc(''); showToast(t('created')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeTeam = useMutation({
    mutationFn: (id: string) => teamsApi.remove(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('removed')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const addMember = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) => teamsApi.addMember(workspaceId!, teamId, userId),
    onSuccess: () => { invalidate(); showToast(t('memberAdded')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeMember = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) => teamsApi.removeMember(workspaceId!, teamId, userId),
    onSuccess: () => { invalidate(); showToast(t('memberRemoved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 新建团队 */}
          <div className="flex gap-2 rounded-md border p-3">
            <Input value={name} placeholder={t('namePh')} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 text-sm" />
            <Input value={desc} placeholder={t('descPh')} onChange={(e) => setDesc(e.target.value)} className="h-8 w-48 text-sm" />
            <Button size="sm" className="h-8" disabled={!name.trim() || createTeam.isPending} onClick={() => createTeam.mutate()}>
              {createTeam.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              {t('create')}
            </Button>
          </div>

          {(!teams || teams.length === 0) ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            teams.map((tm: Team) => {
              const open = expanded[tm.id];
              const pick = memberPick[tm.id] ?? '';
              const inTeamIds = new Set((tm.members ?? []).map((m) => m.userId));
              const candidates = (members ?? []).filter((m) => !inTeamIds.has(m.userId));
              return (
                <div key={tm.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setExpanded((p) => ({ ...p, [tm.id]: !open }))} className="flex items-center gap-2 text-left">
                      <span className="text-sm font-medium">{tm.name}</span>
                      <Badge variant="outline" className="text-[10px]">{tm.memberCount ?? tm.members?.length ?? 0} {t('members')}</Badge>
                      {tm.description && <span className="text-xs text-muted-foreground">{tm.description}</span>}
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTeam.mutate(tm.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(tm.members ?? []).map((m) => (
                          <span key={m.userId} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                            {m.name || m.email}
                            <button onClick={() => removeMember.mutate({ teamId: tm.id, userId: m.userId })} className="text-muted-foreground hover:text-destructive">
                              <UserMinus className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {(tm.members ?? []).length === 0 && <span className="text-xs text-muted-foreground">{t('noMembers')}</span>}
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={pick}
                          onChange={(e) => setMemberPick((p) => ({ ...p, [tm.id]: e.target.value }))}
                          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">{t('pickMember')}</option>
                          {candidates.map((m) => (
                            <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={!pick}
                          onClick={() => { addMember.mutate({ teamId: tm.id, userId: pick }); setMemberPick((p) => ({ ...p, [tm.id]: '' })); }}
                        >
                          <UserPlus className="mr-1 h-3.5 w-3.5" />
                          {t('addMember')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
