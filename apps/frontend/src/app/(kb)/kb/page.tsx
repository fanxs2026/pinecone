'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import { kbSpacesApi } from '@/lib/api-client';
import { slugifyAscii } from '@/lib/slug';
import { Button } from '@/components/ui/button';
import { FolderOpen, RotateCcw } from 'lucide-react';

export default function KbHomePage() {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const t = useTranslations('kb');

  const wsReady = !!workspaceId;
  const { data: spacesData, isLoading, isError } = useQuery({
    queryKey: ['kb-spaces', workspaceId],
    queryFn: () => kbSpacesApi.list(workspaceId!).then((r) => r.data),
    enabled: wsReady,
  });
  const spaces = spacesData?.items || [];

  // 只自动创建一次。dev(StrictMode) 下 effect 会执行两遍，若不加锁会并发发两个 POST：
  // slug 相同则第二个 409，slug 不同（工作区未加载完时用 'default'）则产生多余空间 ——
  // 正是"该工作区存在多个知识库空间"假提示的成因之一。
  const createFired = useRef(false);

  const autoCreate = useMutation({
    mutationFn: () => {
      // ⚠️ 空间 slug 后端有强校验 /^[a-z0-9]+(-[a-z0-9]+)*$/，
      // 而工作区 slug 允许空格/中文（如 "CEDA Client"）—— 直接透传必然 400，
      // 结果是空间建不出来、页面落到"多空间选择器"分支（假提示）。
      // 这里先净化为 ASCII slug；净化后为空则省略该字段，由后端按 name 派生。
      const slug = slugifyAscii(workspace?.slug || '');
      return kbSpacesApi.create(workspaceId!, {
        name: workspace?.name || t('defaultSpaceName'),
        ...(slug ? { slug } : {}),
        description: t('autoCreatedDesc'),
      });
    },
    onSuccess: (res) => {
      router.push(`/kb/${res.data.id}`);
    },
  });

  useEffect(() => {
    if (!wsReady || isLoading) return;
    if (spaces.length === 1) {
      router.push(`/kb/${spaces[0].id}`);
      return;
    }
    if (
      spaces.length === 0 &&
      !createFired.current &&
      !autoCreate.isPending &&
      !autoCreate.isError
    ) {
      createFired.current = true;
      autoCreate.mutate();
    }
  }, [wsReady, isLoading, spaces, autoCreate.isPending, autoCreate.isError]);

  const retryCreate = () => {
    createFired.current = true;
    autoCreate.reset();
    autoCreate.mutate();
  };

  // 建空间失败时的原因文案（后端 message 可能是数组）
  const createError = (autoCreate.error as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  const createErrorText = Array.isArray(createError) ? createError.join('; ') : createError;

  if (!wsReady || isLoading || (autoCreate.isPending && spaces.length === 0)) {
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

  // 自动建空间失败：给出真实原因 + 重试入口（此前静默失败后被误渲染成"多空间选择器"）
  if (spaces.length === 0 && autoCreate.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-10 w-10 text-muted-foreground/40" />
        <p className="text-destructive">{t('createSpaceFailed')}</p>
        {createErrorText && (
          <p className="mt-2 max-w-md text-xs text-muted-foreground">{createErrorText}</p>
        )}
        <Button variant="outline" size="sm" className="mt-6" onClick={retryCreate}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  // 仅当确实存在多个空间时才展示选择器
  if (spaces.length > 1) {
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

  // spaces === 1 由 effect 跳转；0 且无错误为瞬时态
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FolderOpen className="mb-4 h-12 w-12 animate-pulse text-muted-foreground/40" />
      <p className="text-muted-foreground">{t('loading')}</p>
    </div>
  );
}
