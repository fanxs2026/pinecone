'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { Feature } from '@/lib/api-client';
import { getStatusBadgeClasses, getStatusBg, getStatusBorder } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import { useWorkspace } from '@/hooks/use-workspace';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';
import { ENTITY_PRIORITY_COLORS, ENTITY_PRIORITY_LABELS } from '@/lib/entity-priority';

interface FeatureCardProps {
  feature: Feature;
  onDelete?: (id: string) => void;
}

export default function FeatureCard({ feature, onDelete }: FeatureCardProps) {
  const t = useTranslations('feature');
  const tStatus = useTranslations('status');
  const { workspaceId } = useWorkspace();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-50')}
    >
      <Card
        className={cn(
          'cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border',
          getStatusBg('FEATURE', feature.status),
          getStatusBorder('FEATURE', feature.status),
        )}
        onClick={() => window.open(`/features/${feature.id}`, '_blank', 'noopener')}
      >
        <CardContent className="p-3">
          {/* 第 1 行：编号/优先级/状态（禁止折行）+ 删除 */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
              {feature.code && (
                <span className="text-xs font-mono tracking-wider text-muted-foreground">{feature.code}</span>
              )}
              <Badge
                variant="secondary"
                className={cn('text-xs', ENTITY_PRIORITY_COLORS[feature.priority] || 'bg-gray-100 text-gray-500')}
                title={ENTITY_PRIORITY_LABELS[feature.priority] ?? feature.priority}
              >
                {feature.priority}
              </Badge>
              <Badge variant="secondary" className={cn('text-xs', getStatusBadgeClasses('FEATURE', feature.status))}>
                {tStatus('FEATURE_' + feature.status) || feature.status}
              </Badge>
            </div>
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(feature.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm font-medium leading-snug break-words">{feature.title}</p>
          {/* 第 2 行：投票 + 评分（2026-08-15 从首行挪下，避免折行） */}
          {workspaceId && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <VoteButton wsId={workspaceId} entityType="FEATURE" entityId={feature.id} count={feature.voteCount ?? 0} invalidateKeys={['features', workspaceId]} />
              <ScoreEditor wsId={workspaceId} entityType="FEATURE" entityId={feature.id} score={feature.score} invalidateKeys={['features', workspaceId]} />
            </div>
          )}
          {feature.tags && feature.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {feature.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border border-primary/20 text-xs">{tag}</Badge>
              ))}
            </div>
          )}
          {feature.assigneeName && (
            <p className="mt-1 text-xs text-muted-foreground">{feature.assigneeName}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
