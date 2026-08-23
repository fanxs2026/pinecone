'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type KbPageTreeNode } from '@/lib/api-client';
import { ChevronRight, FileText, FolderOpen, FolderClosed, PanelLeftClose, PanelLeftOpen, Plus, Trash2, Globe, Lock, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TreeNode extends KbPageTreeNode {
  children: TreeNode[];
  depth: number;
}

function buildTree(pages: KbPageTreeNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const page of pages) {
    map.set(page.id, { ...page, children: [], depth: 0 });
  }

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
      node.depth = (map.get(node.parentId)!.depth || 0) + 1;
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    // sortOrder 优先；相同时按标题字典序（中文按拼音、数字按数值），实现"从小到大"排序
    nodes.sort((a, b) =>
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }),
    );
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

function TreeItem({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const hasChildren = (node._count?.children ?? 0) > 0;
  const tStatus = useTranslations('status');

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center"
          >
            {expanded ? <FolderOpen className="h-3.5 w-3.5" /> : <FolderClosed className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{node.title}</span>
        {node.status === 'draft' && (
          <span className="ml-auto shrink-0 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            {tStatus('KB_DRAFT')}
          </span>
        )}
      </button>
      {expanded && hasChildren && (
        <ExpandableChildren
          pages={node.children as TreeNode[]}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function ExpandableChildren({
  pages,
  selectedId,
  onSelect,
  depth,
}: {
  pages: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  return (
    <>
      {pages.map((child) => (
        <TreeItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth} />
      ))}
    </>
  );
}

interface PageTreeProps {
  spaceId: string;
  workspaceId: string;
  pages: KbPageTreeNode[];
  selectedPageId: string | null;
  onNewPage?: () => void;
  onDeleteSpace?: () => void;
  visibility?: string;
  onVisibilityChange?: (v: string) => void;
}

export function PageTree({ spaceId, workspaceId, pages, selectedPageId, onNewPage, onDeleteSpace, visibility, onVisibilityChange }: PageTreeProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('kb');

  const tree = useMemo(() => buildTree(pages), [pages]);

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r bg-[#eef1f5] py-2">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={t('expand')}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="group/sidebar flex w-64 shrink-0 flex-col border-r bg-[#eef1f5]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">{t('treeTitle')}</h2>
          {visibility && (
            <button
              onClick={() => {
                if (!onVisibilityChange) return;
                const next = visibility === 'everyone' ? 'member' : visibility === 'member' ? 'admin' : 'everyone';
                onVisibilityChange(next);
              }}
              className="flex cursor-pointer items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              title={`${t('visibilityCurrent')}${visibility === 'everyone' ? t('visibilityEveryone') : visibility === 'member' ? t('visibilityMember') : t('visibilityAdmin')}${t('visibilityToggleHint')}`}
            >
              {visibility === 'everyone' ? <Globe className="h-3 w-3" /> : visibility === 'member' ? <Lock className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
              {visibility === 'everyone' ? t('visibilityPublic') : visibility === 'member' ? t('visibilityMemberLabel') : t('visibilityAdminLabel')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onDeleteSpace && (
            <button
              onClick={onDeleteSpace}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover/sidebar:opacity-100"
              title={t('deleteSpace')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title={t('collapse')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-b px-4 py-2">
        <button
          onClick={() => onNewPage?.()}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('newPage')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {tree.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('emptyPages')}</p>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              selectedId={selectedPageId}
              onSelect={(id) => router.push(`/kb/${spaceId}/${id}`)}
              depth={0}
            />
          ))
        )}
      </div>
    </aside>
  );
}
