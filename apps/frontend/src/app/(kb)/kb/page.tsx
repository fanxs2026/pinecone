'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import { kbSpacesApi } from '@/lib/api-client';
import { FolderOpen } from 'lucide-react';

export default function KbHomePage() {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const t = useTranslations('kb');

  const { data: spacesData, isLoading, isError } = useQuery({
    queryKey: ['kb-spaces', workspaceId],
    queryFn: () => kbSpacesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const spaces = spacesData?.items || [];

  const autoCreate = useMutation({
    mutationFn: () =>
      kbSpacesApi.create(workspaceId!, {
        name: workspace?.name || t('defaultSpaceName'),
        slug: (workspace?.slug || 'default').toLowerCase(),
        description: t('autoCreatedDesc'),
      }),
    onSuccess: (res) => {
      router.push(`/kb/${res.data.id}`);
    },
  });

  useEffect(() => {
    if (!isLoading && spaces.length === 1) {
      router.push(`/kb/${spaces[0].id}`);
    }
    if (!isLoading && spaces.length === 0 && !autoCreate.isPending) {
      autoCreate.mutate();
    }
  }, [isLoading, spaces]);

  if (isLoading || autoCreate.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-12 w-12 animate-pulse text-muted-foreground/40" />
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    );
  }

  // Multiple spaces: show the picker (edge case — e.g. 历史遗留多个空间时不能卡死)
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <FolderOpen className="mb-4 h-10 w-10 text-muted-foreground/40" />
      <h2 className="mb-1 text-lg font-semibold">{t('selectSpace')}</h2>
      <p className="mb-6 text-sm text-muted-foreground">{t('selectSpaceHint')}</p>
      <div className="flex flex-col gap-2">
        {spaces.map((space: { id: string; name: string; slug: string }) => (
          <button
            key={space.id}
            onClick={() => router.push(`/kb/${space.id}`)}
            className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-accent transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{space.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
