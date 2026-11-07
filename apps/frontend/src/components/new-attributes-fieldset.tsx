'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { customFieldApi, type CustomFieldEntityType } from '@/lib/api-client';
import { CustomFieldsSection } from '@/components/custom-fields-section';

/**
 * 新建表单里的扩展字段区：承诺完成日 + 工作区自定义属性。
 *
 * 设计要点：
 * - 自定义属性折起来放，避免新建表单被字段撑长；存在必填字段时默认展开，
 *   否则用户看不见必填项、提交后才撞到校验错误。
 * - 字段定义查询与详情页共用同一 queryKey，React Query 会自动复用缓存，不额外发请求。
 */
interface Props {
  workspaceId: string | null;
  entityType: CustomFieldEntityType;
  /** 该实体是否支持承诺完成日（需求池不支持） */
  withDueDate?: boolean;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  customFields: Record<string, unknown>;
  onCustomFieldsChange: (next: Record<string, unknown>) => void;
}

export function NewAttributesFieldset({
  workspaceId,
  entityType,
  withDueDate = true,
  dueDate,
  onDueDateChange,
  customFields,
  onCustomFieldsChange,
}: Props) {
  const t = useTranslations('customFields');
  const td = useTranslations('deadline');

  const { data } = useQuery({
    queryKey: ['custom-fields', workspaceId, entityType],
    queryFn: () => customFieldApi.list(workspaceId!, entityType).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const defs = data?.items ?? [];
  const hasRequired = defs.some((d) => d.isRequired);
  const [open, setOpen] = useState(false);
  const expanded = open || hasRequired;

  return (
    <>
      {withDueDate && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{td('label')}</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
      )}

      {defs.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpen(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {t('moreAttributes')}
            {hasRequired && !open && <span className="ml-1 text-destructive">*</span>}
          </button>

          {expanded && (
            <div className="space-y-3 rounded-md border border-input p-3">
              <CustomFieldsSection
                workspaceId={workspaceId}
                entityType={entityType}
                value={customFields}
                onSubmit={onCustomFieldsChange}
                layout="stack"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
