'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import { kbSpacesApi, kbPagesApi } from '@/lib/api-client';
import { PageTree } from '@/components/kb/page-tree';
import { AiQaPanel } from '@/components/kb/ai-qa-panel';
import { Button } from '@/components/ui/button';
import {
  ChevronRight, FileText, Pencil, FolderTree, X,
} from 'lucide-react';
import Link from 'next/link';

export default function SpaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const spaceId = params.spaceId as string;
  const { workspaceId } = useWorkspace();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  // I4 移动端适配：页面树抽屉（<md 默认收起，选中页面后自动关闭）
  const [treeOpen, setTreeOpen] = useState(false);
  const t = useTranslations('kb');
  const c = useTranslations('common');
  const tStatus = useTranslations('status');

  useEffect(() => {
    setTreeOpen(false);
  }, [selectedPageId]);

  const { data: space } = useQuery({
    queryKey: ['kb-space', workspaceId, spaceId],
    queryFn: () => kbSpacesApi.get(workspaceId!, spaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['kb-pages-tree', workspaceId, spaceId],
    queryFn: () => kbPagesApi.tree(workspaceId!, spaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: selectedPage } = useQuery({
    queryKey: ['kb-page', workspaceId, selectedPageId],
    queryFn: () => kbPagesApi.get(workspaceId!, selectedPageId!).then((r) => r.data),
    enabled: !!workspaceId && !!selectedPageId,
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: () => kbSpacesApi.remove(workspaceId!, spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-spaces', workspaceId] });
      router.push('/kb');
    },
  });

  const updateVisibilityMutation = useMutation({
    mutationFn: (visibility: string) =>
      kbSpacesApi.update(workspaceId!, spaceId, { visibility } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-space', workspaceId, spaceId] });
    },
  });

  const handleDeleteSpace = useCallback(() => {
    if (window.confirm(t('deleteSpaceConfirm'))) {
      deleteSpaceMutation.mutate();
    }
  }, [deleteSpaceMutation, t]);

  const handleVisibilityChange = (v: string) => updateVisibilityMutation.mutate(v);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* I4 移动端：页面树抽屉（<md），遮罩 + 左侧滑入 */}
      {treeOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTreeOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <div className="relative">
              <button
                type="button"
                onClick={() => setTreeOpen(false)}
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="close tree"
              >
                <X className="h-4 w-4" />
              </button>
              <PageTree
                spaceId={spaceId}
                workspaceId={workspaceId!}
                pages={pages}
                selectedPageId={selectedPageId}
                onNewPage={() => router.push(`/kb/${spaceId}/new`)}
                onDeleteSpace={handleDeleteSpace}
                visibility={space?.visibility}
                onVisibilityChange={handleVisibilityChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Left sidebar - page tree（桌面 ≥md） */}
      <div className="hidden md:block">
        <PageTree
          spaceId={spaceId}
          workspaceId={workspaceId!}
          pages={pages}
          selectedPageId={selectedPageId}
          onNewPage={() => router.push(`/kb/${spaceId}/new`)}
          onDeleteSpace={handleDeleteSpace}
          visibility={space?.visibility}
          onVisibilityChange={handleVisibilityChange}
        />
      </div>

      {/* Right - page preview */}
      <main className="flex-1 overflow-auto">
        {/* I4 移动端：目录按钮 */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setTreeOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            <FolderTree className="h-3.5 w-3.5" />
            {t('treeTitle')}
          </button>
        </div>
        {/* I1 知识库 AI 问答（2026-08-18 P0）：页内折叠面板，sticky 置顶 */}
        <div className="sticky top-0 z-10 border-b bg-background/95 p-3 backdrop-blur md:top-0">
          <AiQaPanel
            workspaceId={workspaceId!}
            spaceId={spaceId}
            onSelectPage={setSelectedPageId}
          />
        </div>
        {!selectedPageId ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <FileText className="mb-4 h-16 w-16 text-muted-foreground/20" />
            <h3 className="text-lg font-medium text-muted-foreground">{t('selectPage')}</h3>
            <p className="mt-1 text-sm text-muted-foreground/60">
              {t('selectPageHint')}
            </p>
          </div>
        ) : selectedPage ? (
          <div className="p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{selectedPage.title}</h1>
              <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                <span>{selectedPage.author?.name || selectedPage.author?.email}</span>
                <span>·</span>
                <span>{new Date(selectedPage.updatedAt).toLocaleDateString('zh-CN')}</span>
                <span>·</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {selectedPage.status === 'published'
                    ? tStatus('KB_PUBLISHED')
                    : selectedPage.status === 'draft'
                      ? tStatus('KB_DRAFT')
                      : tStatus('KB_ARCHIVED')}
                </span>
              </div>
              {selectedPage.tags && selectedPage.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedPage.tags.map((t: any) => (
                    <span
                      key={t.tag.id}
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: t.tag.color ? `${t.tag.color}20` : undefined,
                        color: t.tag.color,
                      }}
                    >
                      {t.tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-6">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/kb/${spaceId}/${selectedPageId}`)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {c('edit')}
              </Button>
            </div>

            {/* Render Tiptap JSON content as simple text/html preview */}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {selectedPage.contentText ? (
                <div className="whitespace-pre-wrap">{selectedPage.contentText}</div>
              ) : selectedPage.content ? (
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {extractTextPreview(selectedPage.content, t('emptyContent'), t('previewUnavailable'))}
                </div>
              ) : (
                <p className="italic text-muted-foreground">{t('noContent')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Loading page...</p>
          </div>
        )}
      </main>
    </div>
  );
}

function extractTextPreview(content: any, emptyText: string, errorText: string): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  try {
    const parts: string[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (node.text) parts.push(node.text);
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(walk);
      }
      if (node.type === 'paragraph') parts.push('\n');
    };
    walk(content);
    return parts.join('').trim() || emptyText;
  } catch {
    return errorText;
  }
}
