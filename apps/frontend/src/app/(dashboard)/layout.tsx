'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useEditionStore } from '@/stores/edition-store';
import { useWorkspace } from '@/hooks/use-workspace';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import SimpleToast from '@/components/simple-toast';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { CommandPalette } from '@/components/command-palette';
import type { LucideIcon } from 'lucide-react';
import {
  Lightbulb,
  Package,
  Layers,
  Columns3,
  Clock,
  LogOut,
  ChevronRight,
  LayoutDashboard,
  LayoutGrid,
  Building2,
  Plus,
  Check,
  LifeBuoy,
  BookOpen,
  Settings,
  Upload,
  Archive,
  Search,
  Target,
  Tags,
  ClipboardCheck,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';

const sidebarItems: Array<{
  href: string;
  key: string;
  icon: LucideIcon;
  external?: boolean;
  enterpriseFeature?: string;
}> = [
  { href: '/', key: 'overview', icon: LayoutDashboard },
  { href: '/supports', key: 'supports', icon: LifeBuoy },
  { href: '/themes', key: 'themes', icon: Tags },
  { href: '/ideas', key: 'ideas', icon: Lightbulb },
  { href: '/features', key: 'features', icon: Layers },
  { href: '/stories', key: 'stories', icon: Columns3 },
  { href: '/releases', key: 'releases', icon: Package },
  { href: '/test-plans', key: 'testPlans', icon: ClipboardCheck },
  // OKR：组织级规划功能，使用频率低于日常实体操作，放测试单之后
  // 企业版功能（PINE_EDITION=enterprise 才显示；社区版完全隐藏，后端同时 403 拦截）
  { href: '/okr', key: 'okr', icon: Target, enterpriseFeature: 'okr' },
  { href: '/time-tracking', key: 'timeTracking', icon: Clock },
  { href: '/imports', key: 'imports', icon: Upload },
  { href: '/dashboards', key: 'dashboards', icon: LayoutGrid },
  { href: '/reports', key: 'reports', icon: BarChart3 },
  { href: '/trash', key: 'trash', icon: Archive, enterpriseFeature: 'trash' },
  { href: '/settings', key: 'settings', icon: Settings },
  // 知识库新开页面（external），放最后
  { href: '/kb', key: 'knowledgeBase', icon: BookOpen, external: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { workspace, workspaceId, workspaces, switchWorkspace } = useWorkspace();
  const [wsOpen, setWsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // I4 移动端适配（2026-08-18）：路由变化时自动关闭移动抽屉
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // 版本信息：启动时拉取 /api/bootstrap，企业功能按 edition 过滤（社区版完全隐藏）
  const editionLoaded = useEditionStore((s) => s.loaded);
  const edition = useEditionStore((s) => s.edition);
  const loadBootstrap = useEditionStore((s) => s.loadBootstrap);
  useEffect(() => {
    if (!editionLoaded) void loadBootstrap();
  }, [editionLoaded, loadBootstrap]);
  const visibleItems = sidebarItems.filter(
    (item) => !item.enterpriseFeature || edition === 'enterprise',
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setWsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // F-01 修复：退出登录必须先调后端（撤销 refresh token + 清 httpOnly cookie），
  // 再清前端状态——否则服务端会话仍有效 7 天，被窃 cookie 无法撤销
  const handleLogout = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      // Verify2 P0：即使后端返回非 2xx（如网关拦截），服务端会话可能未撤销——
      // 记录日志便于排查；前端仍清本地态（cookie 最终会过期兜底）
      if (!res.ok) {
        console.warn('[Logout] server returned', res.status, '— session may not be revoked server-side');
      }
    } catch {
      // 网络失败也继续清前端（后端 cookie 会随过期失效）
    }
    clearAuth();
    window.location.href = '/login';
  };

  const initials = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() ?? '?';

  // I4 移动端适配（2026-08-18）：侧栏内容提取复用（桌面常驻 + 移动抽屉）
  const sidebarContent = (
    <>
      {/* Workspace switcher */}
      <div className="border-b px-3 py-2" ref={ref}>
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">
            {workspace?.name ?? t('selectWorkspace')}
          </span>
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              wsOpen && 'rotate-90',
            )}
          />
        </button>
        {wsOpen && (
          <div className="mt-1 space-y-0.5 rounded-lg border border-border bg-white p-1 text-sm shadow-2xl">
            {workspaces.length === 0 && (
              <p className="px-3 py-2 text-muted-foreground">{tCommon('noWorkspace')}</p>
            )}
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  switchWorkspace(ws.id);
                  setWsOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors',
                  ws.id === workspaceId
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                )}
              >
                <span className="flex-1 truncate">{ws.name}</span>
                {ws.id === workspaceId && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
            <hr className="my-1 border-t" />
            <Link
              href="/?create-ws=1"
              onClick={() => setWsOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{tCommon('createWorkspace')}</span>
            </Link>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const commonClass = cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          );
          if ('external' in item && item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={commonClass}
              >
                <Icon className="h-4 w-4" />
                <span>{t(item.key)}</span>
              </a>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={commonClass}
            >
              <Icon className="h-4 w-4" />
              <span>{t(item.key)}</span>
              {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t p-3">
        <div className="flex items-center justify-between px-1 pb-1">
          <NotificationBell workspaceId={workspaceId ?? null} />
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            title={t('searchShortcut')}
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">⌘K</kbd>
          </button>
        </div>
        <div className="px-3 pb-2">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.name || user?.email}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title={tCommon('logout')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <SimpleToast />
      {/* Sidebar */}
      {/* 桌面侧栏（≥lg） */}
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-60 flex-col border-r bg-[#eef1f5] lg:flex">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b px-6">
          <img src="/pinecone-logo.jpg" alt="Pinecone" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-lg font-bold">Pinecone</span>
        </div>
        {sidebarContent}
      </aside>

      {/* I4 移动端顶栏（<lg） */}
      <header className="fixed left-0 top-0 z-40 flex h-14 w-full items-center gap-2 border-b bg-[#eef1f5] px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent"
          aria-label="open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <img src="/pinecone-logo.jpg" alt="Pinecone" className="h-7 w-7 rounded-lg object-cover" />
        <span className="text-base font-bold">Pinecone</span>
        <div className="ml-auto">
          <NotificationBell workspaceId={workspaceId ?? null} />
        </div>
      </header>

      {/* I4 移动端抽屉（<lg）：遮罩 + 滑入侧栏 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r bg-[#eef1f5] shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <img src="/pinecone-logo.jpg" alt="Pinecone" className="h-7 w-7 rounded-lg object-cover" />
                <span className="text-base font-bold">Pinecone</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="relative z-0 flex-1 overflow-hidden min-w-0 lg:ml-60">
        <div className="h-full p-4 pt-[4.5rem] lg:p-6 lg:pt-6">{children}</div>
      </main>

      <CommandPalette workspaceId={workspaceId ?? null} />
    </div>
  );
}
