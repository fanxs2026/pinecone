'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { githubApi, type VcsProvider } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Loader2, Github, Copy, Check, GitBranch, Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';

const PROVIDERS: { value: VcsProvider; label: string; placeholder: string; hint: string }[] = [
  { value: 'GITHUB', label: 'GitHub', placeholder: 'owner/repo', hint: 'X-Hub-Signature-256 (HMAC)' },
  { value: 'GITLAB', label: 'GitLab', placeholder: 'group/project', hint: 'X-Gitlab-Token' },
  { value: 'GITEE', label: 'Gitee', placeholder: 'owner/repo', hint: 'X-Gitee-Token' },
];

interface GithubConfigPanelProps {
  workspaceId: string;
}

export function GithubConfigPanel({ workspaceId }: GithubConfigPanelProps) {
  const queryClient = useQueryClient();
  const [repoName, setRepoName] = useState('');
  const [provider, setProvider] = useState<VcsProvider>('GITHUB');
  const [revealed, setRevealed] = useState<{ secret: string; url: string; provider: VcsProvider } | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useTranslations('githubConfig');

  const { data: configs, isLoading } = useQuery({
    queryKey: ['github-configs', workspaceId],
    queryFn: () => githubApi.configs(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (args: { name: string; provider: VcsProvider }) => githubApi.addConfig(workspaceId!, args.name, args.provider).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['github-configs', workspaceId] });
      setRepoName('');
      setRevealed({ secret: data.webhookSecret, url: data.webhookUrl, provider: data.provider });
      showToast(t('created'));
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      showToast(typeof msg === 'string' ? msg : t('error'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => githubApi.removeConfig(workspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-configs', workspaceId] });
      showToast(t('removed'));
    },
  });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{t('title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('desc')}</p>
      </div>

      {/* 添加仓库 */}
      <div className="flex gap-2">
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value as VcsProvider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <Input
          placeholder={PROVIDERS.find((p) => p.value === provider)?.placeholder}
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && repoName.trim()) createMutation.mutate({ name: repoName.trim(), provider });
          }}
        />
        <Button
          disabled={!repoName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate({ name: repoName.trim(), provider })}
        >
          {createMutation.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          {t('add')}
        </Button>
      </div>

      {/* 新配置提示（secret 仅显示一次） */}
      {revealed && (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <p className="text-xs font-medium text-blue-800">{t('secretWarning')} <span className="text-blue-600">({PROVIDERS.find((p) => p.value === revealed.provider)?.hint})</span></p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('webhookUrl')}</span>
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">{revealed.url}</code>
              <Button size="sm" variant="outline" onClick={() => copy(revealed.url)}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('secret')}</span>
              <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs">{revealed.secret}</code>
              <Button size="sm" variant="outline" onClick={() => copy(revealed.secret)}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 仓库列表 */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (configs ?? []).length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          {(configs ?? []).map((cfg) => (
            <div key={cfg.id} className="group flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
              {cfg.provider === 'GITHUB' ? (
                <Github className="h-4 w-4 text-muted-foreground" />
              ) : cfg.provider === 'GITLAB' ? (
                <GitBranch className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Code2 className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant="outline" className="text-[10px]">{cfg.provider}</Badge>
              <span className="flex-1 text-sm">{cfg.repoFullName}</span>
              <Badge variant="outline" className="text-xs">{cfg._count?.links ?? 0} links</Badge>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={() => removeMutation.mutate(cfg.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
