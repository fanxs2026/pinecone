'use client';

import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface EntityDetailHeaderProps {
  /** 编号，如 CTM-S-1 / PINE-EE-I-3 —— 第一行左侧 */
  code?: string | null;
  /** 标题 —— 第一行右侧 */
  title: string;
  /** 类型徽章（支持请求类型 / 测试单类型），无则不传 */
  typeBadge?: React.ReactNode;
  /** 优先级徽章；实体没有 priority 字段时不传（自动跳过） */
  priorityBadge?: React.ReactNode;
  /** 状态下拉（可编辑）或状态徽章 */
  statusControl?: React.ReactNode;
  /** 投票按钮 */
  votes?: React.ReactNode;
  /** 评分编辑器 */
  score?: React.ReactNode;
  /** 负责人姓名 */
  ownerName?: string | null;
  /** "负责人" 的 i18n 文案，由调用方传入 */
  ownerLabel?: string;
  /** 创建人 */
  creatorName?: string | null;
  /** "创建人" 的 i18n 文案 —— 不传时只显示人名，容易和负责人混淆 */
  creatorLabel?: string;
  createdAt?: string | null;
  /** 第一行与元信息之间的附加块（OKR 溯源等） */
  extra?: React.ReactNode;
  className?: string;
}

/**
 * 实体详情页统一头部（2026-11-27）。
 *
 * 之前 5 个详情页各写一套：编号/状态下拉/Vote/评分/标题全挤在第一行，
 * 类型/优先级/创建人/日期在第二行，且有的实体把同一个状态显示两次。
 * 这里统一为两行：
 *   行1：编号 | 标题
 *   行2：类型 | 优先级 | 状态 | Vote | 评分 | 负责人 | 创建人 · 日期时间
 * 没有的字段（如 Idea 无优先级）直接跳过，不留空位。
 */
export default function EntityDetailHeader({
  code,
  title,
  typeBadge,
  priorityBadge,
  statusControl,
  votes,
  score,
  ownerName,
  ownerLabel,
  creatorName,
  creatorLabel,
  createdAt,
  extra,
  className,
}: EntityDetailHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* 行1：编号 + 标题 */}
      <div className="flex min-w-0 items-center gap-2">
        {code && (
          <Badge variant="outline" className="shrink-0 font-mono text-xs tracking-wider">
            {code}
          </Badge>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight" title={title}>
          {title}
        </h1>
      </div>

      {extra}

      {/* 行2：元信息 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {typeBadge}
        {priorityBadge}
        {statusControl}
        {votes}
        {score}
        {ownerName && (
          <span className="whitespace-nowrap">
            {ownerLabel ?? 'Owner'}: {ownerName}
          </span>
        )}
        {/* 负责人与创建人之间补分隔符：两者都是「标签: 人名」，紧挨着会读成一个人 */}
        {ownerName && (creatorName || createdAt) && <span aria-hidden="true">·</span>}
        {(creatorName || createdAt) && (
          <span className="whitespace-nowrap">
            {creatorName ? `${creatorLabel ?? 'Creator'}: ${creatorName}` : ''}
            {creatorName && createdAt ? ' · ' : ''}
            {createdAt ? formatDateTime(createdAt) : ''}
          </span>
        )}
      </div>
    </div>
  );
}
