'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { relationApi } from '@/lib/api-client';
import { getRelationLabelKey } from '@/lib/relation-utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, ArrowUp, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface RelationsPanelProps {
  workspaceId: string;
  entityType: 'IDEA' | 'FEATURE' | 'STORY' | 'SUPPORT';
  entityId: string;
  entityTitle?: string;
}

export default function RelationsPanel({ workspaceId, entityType, entityId, entityTitle }: RelationsPanelProps) {
  const queryClient = useQueryClient();
  const [showPromote, setShowPromote] = useState(false);
  const [promotePriority, setPromotePriority] = useState('P2');
  const t = useTranslations('relation');
  const c = useTranslations('common');
  const entityTypeLabels: Record<string, string> = {
    IDEA: t('idea'),
    FEATURE: t('feature'),
    STORY: t('story'),
    SUPPORT: t('support'),
  };

  const { data: relations, isLoading } = useQuery({
    queryKey: ['relations', workspaceId, entityType, entityId],
    queryFn: () => relationApi.list(workspaceId, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });

  const promoteMutation = useMutation({
    mutationFn: () => relationApi.promote(workspaceId, entityId, { priority: promotePriority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relations', workspaceId, entityType, entityId] });
      setShowPromote(false);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => relationApi.clone(workspaceId, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relations', workspaceId, entityType, entityId] });
    },
  });

  const hrefFor = (relEntityType: string, relEntityId: string) => {
    const path = relEntityType === 'IDEA' ? 'ideas' : relEntityType === 'FEATURE' ? 'features' : 'stories';
    return `/${path}/${relEntityId}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t('title')}</h3>
      </div>

      {/* Promote / Clone actions */}
      {entityType === 'IDEA' && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{t('promoteIdeaToFeature')}</span>
            </div>
            {!showPromote ? (
              <Button size="sm" onClick={() => setShowPromote(true)}>
                {t('promote')}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  value={promotePriority}
                  onChange={(e) => setPromotePriority(e.target.value)}
                >
                  <option value="P0">{t('priorityP0')}</option>
                  <option value="P1">{t('priorityP1')}</option>
                  <option value="P2">{t('priorityP2')}</option>
                  <option value="P3">{t('priorityP3')}</option>
                </select>
                <Button
                  size="sm"
                  onClick={() => promoteMutation.mutate()}
                  disabled={promoteMutation.isPending}
                >
                  {promoteMutation.isPending ? t('promoting') : t('confirmPromote')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPromote(false)}>
                  {c('cancel')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {entityType === 'FEATURE' && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{t('cloneToStory')}</span>
            </div>
            <Button
              size="sm"
              onClick={() => cloneMutation.mutate()}
              disabled={cloneMutation.isPending}
            >
              {cloneMutation.isPending ? t('cloning') : t('clone')}
            </Button>
          </div>
        </div>
      )}

      {/* Relations list */}
      <div className="space-y-2">
        {!relations || relations.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Link2 className="h-6 w-6" />
              <p className="text-sm">{t('empty')}</p>
            </div>
          </Card>
        ) : (
          relations.map((rel) => (
            <Card key={rel.id} className="group">
              <a
                href={hrefFor(rel.relatedEntityType, rel.relatedEntityId)}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {entityTypeLabels[rel.relatedEntityType] || rel.relatedEntityType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(getRelationLabelKey(rel.relationType, rel.direction))}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {rel.relatedCode && (
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{rel.relatedCode}</span>
                    )}
                    {rel.relatedTitle || t('untitled')}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </a>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
