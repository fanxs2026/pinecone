'use client';

import { useQuery } from '@tanstack/react-query';
import { okrApi, type OkrEntityLink } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';

/**
 * P1 实体详情页「关联目标」溯源区块：
 * 展示当前实体（Feature/Story/Release）所属的 Objective/KR，回答"为什么做这个"。
 * 挂载：features/[id]、stories/[id]、releases/[id] 详情页。
 */
export function OkrTracePanel({
  entityType,
  entityId,
}: {
  entityType: 'FEATURE' | 'STORY' | 'RELEASE';
  entityId: string;
}) {
  const t = useTranslations('okr');
  const { workspaceId } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ['okr-trace', workspaceId, entityType, entityId],
    queryFn: () => okrApi.findByEntity(workspaceId!, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });

  const links = data ?? [];

  if (isLoading) {
    return (
      <div className="rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Target className="h-3.5 w-3.5" />
          {t('traceTitle')}
        </div>
        <Skeleton className="mt-2 h-8 w-full" />
      </div>
    );
  }

  if (!links.length) return null;

  return (
    <div className="rounded-md border border-violet-200/60 bg-violet-50/50 p-3 dark:border-violet-500/20 dark:bg-violet-500/5">
      <div className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
        <Target className="h-3.5 w-3.5" />
        {t('traceTitle')}
      </div>
      <div className="mt-2 space-y-2">
        {links.map((link) => (
          <a
            key={link.keyResultItemId}
            href="/okr"
            className="block rounded-md border border-violet-200/50 bg-background p-2 transition-colors hover:border-violet-300"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium">{link.objectiveTitle}</span>
              {link.objectivePeriod && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{link.objectivePeriod}</span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {link.keyResultTitle}
              {link.keyResultTarget ? ` · ${link.keyResultTarget}` : ''}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
