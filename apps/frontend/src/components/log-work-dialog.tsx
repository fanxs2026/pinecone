'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntryApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LogWorkDialogProps {
  workspaceId: string;
  entityType: string;
  entityId: string;
  storyId?: string;
}

export default function LogWorkDialog({ workspaceId, entityType, entityId, storyId }: LogWorkDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const t = useTranslations('timeTracking');
  const c = useTranslations('common');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [billable, setBillable] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      timeEntryApi.create(workspaceId!, {
        storyId: storyId || undefined,
        entityType: storyId ? undefined : entityType,
        entityId: storyId ? undefined : entityId,
        description,
        hours: parseFloat(hours),
        date,
        billable,
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] });
      setDescription('');
      setHours('');
      setDate(new Date().toISOString().slice(0, 10));
      setBillable(true);
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Clock className="mr-1 h-3 w-3" /> {t('logWork')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{c('description')}</label>
        <Input
          size={20}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('workDescription')}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('hours')}</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm"
          placeholder="0"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('date')}</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          className="h-4 w-4"
        />
        {t('billable')}
      </label>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={!description.trim() || !hours || mutation.isPending}
        >
          {mutation.isPending ? t('saving') : c('save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {c('cancel')}
        </Button>
      </div>
    </div>
  );
}
