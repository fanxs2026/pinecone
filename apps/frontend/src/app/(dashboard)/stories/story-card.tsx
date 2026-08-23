'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { Story } from '@/lib/api-client';
import { getStatusBg, getStatusBorder, getStatusBadgeClasses } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import { STORY_PRIORITY_COLORS, STORY_PRIORITY_LABELS } from '@/lib/story-priority';

interface StoryCardProps {
  story: Story;
  onDelete?: (id: string) => void;
  /** 迭代名称（可选，卡片上显示归属） */
  sprintName?: string;
}

export default function StoryCard({ story, onDelete, sprintName }: StoryCardProps) {
  const tStatus = useTranslations('status');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: story.id });

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
          getStatusBg('STORY', story.status),
          getStatusBorder('STORY', story.status),
        )}
        onClick={() => window.open(`/stories/${story.id}`, '_blank', 'noopener')}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {story.code && (
                <span className="text-xs font-mono tracking-wider text-muted-foreground">{story.code}</span>
              )}
              <Badge
                variant="secondary"
                className={cn('text-xs', STORY_PRIORITY_COLORS[story.priority] || 'bg-gray-100 text-gray-500')}
                title={STORY_PRIORITY_LABELS[story.priority] ?? story.priority}
              >
                {story.priority}
              </Badge>
              <Badge variant="secondary" className={cn('text-xs', getStatusBadgeClasses('STORY', story.status))}>
                {tStatus(`STORY_${story.status}`) || story.status}
              </Badge>
              {(story.kind === 'DEFECT' || story.kind === 'CHORE') && (
                <Badge
                  variant="secondary"
                  className={cn('text-xs',
                    story.kind === 'DEFECT' && 'bg-red-100 text-red-700',
                    story.kind === 'CHORE' && 'bg-gray-100 text-gray-600',
                  )}
                >
                  {story.kind === 'DEFECT' ? tStatus('defectKind') : tStatus('choreKind')}
                </Badge>
              )}
              {sprintName && (
                <Badge variant="outline" className="text-xs text-violet-700 bg-violet-50">
                  {sprintName}
                </Badge>
              )}
            </div>
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(story.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm font-medium leading-snug break-words">{story.title}</p>
          {(story.assignee || story.storyPoints) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {story.assignee && <span>{story.assignee.name}</span>}
              {story.storyPoints && <span>{story.storyPoints}pt</span>}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
