'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { feedbackPortalApi } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { ThumbsUp, Lock, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** P0：客户反馈门户公开页（免登录：提交反馈 + 投票），令牌 = 工作区级 */
export default function FeedbackPortalPage() {
  const params = useParams<{ token: string }>();
  const t = useTranslations('feedbackPortal');
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [voterEmail, setVoterEmail] = useState('');
  const [voterName, setVoterName] = useState('');
  const [votedItems, setVotedItems] = useState<Set<string>>(new Set());
  // 2026-08-15：算术验证码（防刷）
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const fetchCaptcha = useCallback(async () => {
    try {
      const r = await feedbackPortalApi.captcha(params.token);
      setCaptchaId(r.data.captchaId);
      setCaptchaQuestion(r.data.question);
      setCaptchaAnswer('');
    } catch {
      /* 验证码不可用时静默（不影响页面） */
    }
  }, [params.token]);

  useEffect(() => {
    if (params.token) void fetchCaptcha();
  }, [params.token, fetchCaptcha]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feedback-portal', params.token],
    queryFn: () => feedbackPortalApi.view(params.token).then((r) => r.data),
    enabled: !!params.token,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackPortalApi.submit(params.token, {
        title,
        description: description || undefined,
        voterEmail: data?.requireEmail || email ? email || undefined : undefined,
        voterName: voterName || undefined,
        captchaId,
        captchaAnswer: captchaAnswer.trim(),
      }),
    onSuccess: () => {
      showToast(t('thanks'));
      setShowForm(false);
      setTitle('');
      setDescription('');
      setEmail('');
      setCaptchaAnswer('');
      void fetchCaptcha();
      queryClient.invalidateQueries({ queryKey: ['feedback-portal', params.token] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('error')),
  });

  const voteMutation = useMutation({
    mutationFn: ({ entityType, entityId, itemId }: { entityType: string; entityId: string; itemId: string }) => {
      const needEmail = !!data?.requireEmail && !voterEmail.trim();
      if (needEmail) {
        showToast(t('requireEmailHint'));
        return Promise.reject(new Error('email required'));
      }
      return feedbackPortalApi.vote(params.token, {
        entityType,
        entityId,
        voterEmail: voterEmail.trim() || undefined,
        voterName: voterName.trim() || undefined,
        captchaId,
        captchaAnswer: captchaAnswer.trim(),
      });
    },
    onSuccess: (_r, vars) => {
      setVotedItems((prev) => new Set(prev).add(vars.itemId));
      setCaptchaAnswer('');
      void fetchCaptcha();
      queryClient.invalidateQueries({ queryKey: ['feedback-portal', params.token] });
      showToast(t('voted'));
    },
    onError: (err: any) => {
      if (err?.message !== 'email required') showToast(err?.response?.data?.message || t('error'));
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 p-16 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t('invalidTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('invalidDesc')}</p>
      </div>
    );
  }

  const canSubmit = title.trim().length >= 2 && (!data.requireEmail || email.trim().length > 0) && captchaAnswer.trim().length > 0;

  const captchaField = (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded-md border bg-accent/40 px-2.5 py-1.5 font-mono text-sm">{captchaQuestion}</span>
      <Input
        placeholder={t('captchaPlaceholder')}
        value={captchaAnswer}
        onChange={(e) => setCaptchaAnswer(e.target.value)}
        className="h-8 w-24 text-sm"
      />
      <button
        type="button"
        onClick={() => void fetchCaptcha()}
        className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {t('captchaRefresh')}
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t('title')} · {data.workspaceName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Submit */}
      {!showForm ? (
        <Button className="w-full" onClick={() => setShowForm(true)}>
          <Send className="mr-1 h-4 w-4" /> {t('submit')}
        </Button>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Input placeholder={t('titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              placeholder={t('descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            {data.requireEmail && (
              <Input type="email" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
            {captchaField}
            <div className="flex gap-2">
              <Button onClick={() => submitMutation.mutate()} disabled={!canSubmit || submitMutation.isPending}>
                {submitMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {submitMutation.isPending ? t('submitting') : t('confirmSubmit')}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voter identity (voting) */}
      <Card>
        <CardContent className="space-y-2 pt-4 text-sm">
          <p className="text-xs text-muted-foreground">{t('voteIdentityHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.requireEmail && (
              <Input type="email" placeholder={t('emailPlaceholder')} value={voterEmail} onChange={(e) => setVoterEmail(e.target.value)} />
            )}
            <Input placeholder={t('namePlaceholder')} value={voterName} onChange={(e) => setVoterName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {captchaField}
            <span className="text-[11px] text-muted-foreground">{t('captchaHint')}</span>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('listTitle')} ({data.items.length})</h2>
        {data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="space-y-2">
            {data.items.map((item) => (
              <Card key={item.id} className="group">
                <CardContent className="flex items-start gap-3 p-3.5">
                  <button
                    type="button"
                    disabled={voteMutation.isPending}
                    onClick={() => voteMutation.mutate({ entityType: data.target, entityId: item.id, itemId: item.id })}
                    className={cn(
                      'mt-0.5 inline-flex shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-1 transition-colors',
                      votedItems.has(item.id)
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-input text-muted-foreground hover:border-primary/40 hover:text-primary',
                    )}
                    title={t('vote')}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-xs font-semibold">{item.voteCount}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.code && <span className="font-mono text-[11px] text-muted-foreground">{item.code}</span>}
                      <span className="text-sm font-medium break-words">{item.title}</span>
                    </div>
                    {item.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {item.themes.map((th) => (
                        <Badge key={th} variant="secondary" className="text-[10px]">{th}</Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{item.status}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="pb-6 text-center text-[11px] text-muted-foreground">{t('footerNote')}</p>
    </div>
  );
}
