'use client';

import { useQuery } from '@tanstack/react-query';
import { historyApi, releaseApi } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { History, FileEdit, Trash2, Plus, ArrowRight, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface HistoryTimelineProps {
  workspaceId: string;
  entityType: 'IDEA' | 'FEATURE' | 'STORY' | 'SUPPORT';
  entityId: string;
}

const actionIcons: Record<string, React.ReactNode> = {
  CREATED: <Plus className="h-3.5 w-3.5 text-green-600" />,
  UPDATED: <FileEdit className="h-3.5 w-3.5 text-blue-600" />,
  STATUS_CHANGED: <ArrowRight className="h-3.5 w-3.5 text-orange-600" />,
  DELETED: <Trash2 className="h-3.5 w-3.5 text-red-600" />,
  TIME_LOGGED: <Clock className="h-3.5 w-3.5 text-violet-600" />,
};

function describeChange(
  entry: any,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  releaseName: (id: string) => string,
): string {
  if (entry.action === 'CREATED') return t('createdEntry');
  if (entry.action === 'DELETED') return t('deletedEntry');
  if (entry.action === 'TIME_LOGGED') {
    const meta = entry.metadata;
    const h = meta?.hours ?? '';
    const desc = meta?.description ?? '';
    return desc ? `${t('timeLogged', { hours: h })} — ${desc}` : t('timeLogged', { hours: h });
  }
  if (entry.action === 'STATUS_CHANGED') {
    const meta = entry.metadata;
    if (meta?.from && meta?.to) return t('statusChangedFromTo', { from: meta.from, to: meta.to });
    return t('statusChangedSimple');
  }
  if (entry.action === 'UPDATED') {
    const changes = entry.metadata?.changes;
    if (changes) {
      const fields = Object.keys(changes);
      if (fields.length > 0) {
        const desc = fields
          .map((f) => {
            const c = changes[f];
            // Translate releaseId UUIDs into user-defined release names.
            const fmt = (v: unknown) =>
              f.toLowerCase().includes('release') && typeof v === 'string' && v ? releaseName(v) : (v ?? '');
            return `${f}: "${fmt(c.old)}" → "${fmt(c.new)}"`;
          })
          .join('; ');
        return desc;
      }
    }
    const metaAction = entry.metadata?.action;
    if (metaAction === 'COMMENT_CREATED') return t('commentAdded');
    if (metaAction === 'COMMENT_DELETED') return t('commentDeleted');
    if (metaAction === 'PROMOTED_TO_FEATURE') return t('promotedToFeature');
    if (metaAction === 'CLONED_TO_STORY') return t('clonedToStory');
    if (metaAction === 'PROMOTED_FROM_IDEA') return t('promotedFromIdea');
    if (metaAction === 'CLONED_FROM_FEATURE') return t('clonedFromFeature');
    return t('entryUpdated');
  }
  return '';
}

export default function HistoryTimeline({ workspaceId, entityType, entityId }: HistoryTimelineProps) {
  const t = useTranslations('history');
  const actionLabels: Record<string, string> = {
    CREATED: t('created'),
    UPDATED: t('updated'),
    STATUS_CHANGED: t('statusChanged'),
    DELETED: t('deleted'),
    TIME_LOGGED: t('timeLoggedLabel'),
  };
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['history', workspaceId, entityType, entityId],
    queryFn: () => historyApi.list(workspaceId, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });
  const history = historyData?.items ?? [];

  // Releases map for translating releaseId UUIDs in history into names.
  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];
  const releaseName = (id: string) => {
    const r = releases.find((rel) => rel.id === id);
    if (!r) return id;
    return r.version && r.version !== r.name ? `${r.name} (${r.version})` : r.name;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <History className="h-8 w-8" />
        <p className="text-sm">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-3.5 top-2 h-[calc(100%-1.5rem)] w-px bg-border" />

      <div className="space-y-4">
        {history.map((entry) => (
          <div key={entry.id} className="relative flex gap-4 pl-10">
            {/* Dot */}
            <div className="absolute left-2.5 top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background">
              {actionIcons[entry.action] || <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>

            {/* Content */}
            <div className="flex-1 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {entry.user?.name || entry.user?.email || t('system')}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {actionLabels[entry.action] || entry.action}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground">{describeChange(entry, t, releaseName)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
