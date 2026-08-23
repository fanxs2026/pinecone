'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi, type KbAskResult } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, ChevronDown, ChevronRight, FileText } from 'lucide-react';

/**
 * I1 知识库 AI 问答面板（2026-08-18 P0，竞品差距 G1）。
 * 折叠式：输入问题 → POST /workspaces/:wsId/ai/kb-ask → 展示答案 + 引用来源。
 * 无 AI_API_KEY 时后端降级返回相关页面（no-key），面板同样展示，可用作"高级搜索"。
 */
export function AiQaPanel({
  workspaceId,
  spaceId,
  onSelectPage,
}: {
  workspaceId: string;
  spaceId: string;
  onSelectPage?: (pageId: string) => void;
}) {
  const t = useTranslations('kbAi');
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<KbAskResult | null>(null);

  const askMutation = useMutation({
    mutationFn: (q: string) => aiApi.kbAsk(workspaceId, q).then((r) => r.data),
    onSuccess: (d) => setResult(d),
  });

  const submit = () => {
    const q = question.trim();
    if (!q || askMutation.isPending) return;
    setResult(null);
    askMutation.mutate(q);
  };

  const openPage = (pageId: string) => {
    if (onSelectPage) {
      onSelectPage(pageId);
    } else {
      window.location.href = `/kb/${spaceId}/${pageId}`;
    }
  };

  return (
    <div className="overflow-hidden rounded-md border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {t('title')}
        </span>
        <span className="text-xs font-normal text-muted-foreground">{t('hint')}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('placeholder')}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 shrink-0" disabled={!question.trim() || askMutation.isPending} onClick={submit}>
              {askMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              {t('ask')}
            </Button>
          </div>

          {askMutation.isError && (
            <p className="text-xs text-destructive">{t('error')}</p>
          )}

          {result && (
            <div className="space-y-2 text-sm">
              <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 leading-relaxed">
                {result.answer}
              </div>
              {result.sources.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t('sources')}</p>
                  {result.sources.map((s) => (
                    <button
                      key={s.pageId}
                      type="button"
                      onClick={() => openPage(s.pageId)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
                    >
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{s.title}</span>
                        {s.excerpt && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{s.excerpt}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
