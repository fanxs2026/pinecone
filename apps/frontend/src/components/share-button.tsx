'use client';

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { shareApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Share2, Copy, Check, Link2Off, Loader2, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';

interface ShareButtonProps {
  workspaceId: string;
  entityType: 'STORY' | 'IDEA' | 'FEATURE' | 'SUPPORT' | 'RELEASE';
  entityId: string;
  defaultTitle?: string;
}

const PRESET_COLORS = ['#3b82f6', '#8b5cf6', '#f97316', '#10b981', '#ef4444', '#64748b'];

/** 弹窗宽度（w-96 = 24rem = 384px） */
const PANEL_WIDTH = 384;

/** P2-⑭ 访客分享：生成只读分享链接（无账号可看）；P2 品牌化：RELEASE 可配品牌标题/主题色/视图模式 */
export function ShareButton({ workspaceId, entityType, entityId, defaultTitle }: ShareButtonProps) {
  const t = useTranslations('share');
  const btnRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [brandTitle, setBrandTitle] = useState(defaultTitle ?? '');
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'FULL'>('FULL');

  /** 打开弹窗并计算落点：保证弹窗左右边界都不超出视口 */
  const openPanel = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const margin = 8;
      const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
      const left = Math.max(margin, Math.min(rect.left, maxLeft));
      setPanelPos({ left, top: rect.bottom + 4 });
    }
    setOpen(true);
    if (!link && !createMutation.isSuccess) createMutation.mutate();
  };

  const createMutation = useMutation({
    mutationFn: () =>
      shareApi.create(workspaceId!, entityType, entityId, {
        days: 30,
        brandTitle: brandTitle.trim() || undefined,
        brandColor: brandColor || undefined,
        viewMode,
      }).then((r) => r.data),
    onSuccess: (data) => {
      const url = `${window.location.origin}/share/${data.token}`;
      setLink(url);
      showToast(t('created'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const revokeMutation = useMutation({
    mutationFn: () => shareApi.revoke(workspaceId!, entityType, entityId),
    onSuccess: () => {
      setLink(null);
      setOpen(false);
      showToast(t('revoked'));
    },
  });

  const copy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative" ref={btnRef}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openPanel();
          }
        }}
      >
        {createMutation.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="mr-1 h-3.5 w-3.5" />
        )}
        {t('share')}
      </Button>

      {open && panelPos && (
        <div
          className="fixed z-50 w-96 rounded-lg border border-border bg-popover p-3 shadow-xl"
          style={{ left: panelPos.left, top: panelPos.top, maxWidth: `calc(100vw - 16px)` }}
        >
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('desc')}</p>

          {/* 品牌配置（RELEASE 分享默认展开） */}
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setShowBrand(!showBrand)}
          >
            <Palette className="h-3 w-3" />
            {t('brandConfig')}
          </button>
          {showBrand && (
            <div className="mb-2 space-y-2 rounded-md border p-2">
              <div className="space-y-1">
                <Label className="text-[11px]">{t('brandTitle')}</Label>
                <Input value={brandTitle} onChange={(e) => setBrandTitle(e.target.value)} placeholder={t('brandTitlePh')} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">{t('brandColor')}</Label>
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map((cl) => (
                    <button
                      key={cl}
                      type="button"
                      onClick={() => setBrandColor(cl === brandColor ? null : cl)}
                      className={`h-5 w-5 rounded-full border-2 transition-transform ${brandColor === cl ? 'scale-110 border-primary' : 'border-transparent'}`}
                      style={{ backgroundColor: cl }}
                    />
                  ))}
                  <button type="button" onClick={() => setBrandColor(null)} className="h-5 rounded border px-1.5 text-[10px] text-muted-foreground">
                    {t('noColor')}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">{t('viewMode')}</Label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'SIMPLE' | 'FULL')}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs"
                >
                  <option value="FULL">{t('viewFull')}</option>
                  <option value="SIMPLE">{t('viewSimple')}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {t('apply')}
                </Button>
              </div>
            </div>
          )}

          {link ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={link} readOnly className="h-8 text-xs" onFocus={(e) => e.target.select()} />
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t('expiresNote')}</p>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate()} className="text-destructive hover:text-destructive">
                  <Link2Off className="mr-1 h-3.5 w-3.5" />
                  {t('revoke')}
                </Button>
              </div>
            </>
          ) : (
            createMutation.isPending && (
              <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('generating')}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
