'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp } from 'lucide-react';
import { votesApi } from '@/lib/api-client';
import { showToast } from '@/components/simple-toast';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface VoteButtonProps {
  wsId: string;
  entityType: string;
  entityId: string;
  count: number;
  /** 变更后失效的查询键（如 ['ideas', wsId]） */
  invalidateKeys?: unknown[];
  size?: 'sm' | 'md';
}

/** P0：内部投票按钮（👍 + 计数）。后端幂等（重复投/取消），乐观切换状态 */
export default function VoteButton({ wsId, entityType, entityId, count, invalidateKeys, size = 'sm' }: VoteButtonProps) {
  const t = useTranslations('votes');
  const queryClient = useQueryClient();
  const [voted, setVoted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      voted ? votesApi.unvote(wsId, entityType, entityId) : votesApi.vote(wsId, entityType, entityId),
    onMutate: () => setVoted((v) => !v),
    onError: () => {
      setVoted((v) => !v);
      showToast(t('error'));
    },
    onSettled: () => {
      if (invalidateKeys) queryClient.invalidateQueries({ queryKey: invalidateKeys });
    },
  });

  return (
    <button
      type="button"
      title={voted ? t('unvote') : t('vote')}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        mutation.mutate();
      }}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium transition-all',
        size === 'sm' ? 'h-5' : 'h-6',
        voted
          ? 'border-primary/50 bg-primary/15 text-primary shadow-sm'
          : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:shadow-sm',
      )}
    >
      <ThumbsUp className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{count}</span>
    </button>
  );
}
