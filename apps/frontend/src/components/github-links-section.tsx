'use client';

import { useQuery } from '@tanstack/react-query';
import { githubApi } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Github, GitPullRequest, GitCommit } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface GithubLinksSectionProps {
  workspaceId: string;
  entityType: string;
  entityId: string;
}

const stateColor: Record<string, string> = {
  OPEN: 'bg-green-50 text-green-700',
  MERGED: 'bg-purple-50 text-purple-700',
  CLOSED: 'bg-red-50 text-red-700',
  PUSHED: 'bg-blue-50 text-blue-700',
};

export function GithubLinksSection({ workspaceId, entityType, entityId }: GithubLinksSectionProps) {
  const t = useTranslations('githubLinks');
  const { data: links, isLoading } = useQuery({
    queryKey: ['github-links', workspaceId, entityType, entityId],
    queryFn: () => githubApi.links(workspaceId!, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  const items = links ?? [];
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium">
        <Github className="h-3.5 w-3.5" />
        {t('title')} <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </h4>
      <div className="space-y-1.5">
        {items.map((l) => (
          <a
            key={l.id}
            href={l.url || undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-accent/40"
          >
            {l.githubType === 'PR' ? (
              <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-purple-500" />
            ) : (
              <GitCommit className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {l.githubType === 'PR' ? `#${l.prNumber} ` : (l.commitSha || '').slice(0, 7) + ' '}
              <span className="text-muted-foreground">{l.title}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{l.config?.repoFullName}</span>
            {l.state && (
              <Badge variant="outline" className={`shrink-0 text-[10px] ${stateColor[l.state] || ''}`}>
                {l.state}
              </Badge>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
