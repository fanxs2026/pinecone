/**
 * Status 配色方案 — 参考 Aha! muted pastel 风格
 *
 * 集中管理所有实体的状态配色，遵循以下规则：
 * - 浅色背景（-50 级别）用于卡片/列头底色
 * - 边框色（-200 级别）用于边框/分割
 * - 文字色（-800/-900）保证可读（对比度 ≥ 4.5:1）
 * - 暗色徽章（-500/-600 + 白字）用于详情页大徽章
 *
 * 使用方式：
 *   import { getStatusClasses, getStatusBadgeClasses, getStatusBg, getStatusBorder } from '@/lib/status-colors';
 *
 *   // 卡片/列头底色 + 边框 + 文字
 *   <Card className={getStatusClasses('STORY', 'IN_PROGRESS')}>
 *
 *   // 详情页大徽章
 *   <Badge className={getStatusBadgeClasses('IDEA', 'IN_REVIEW')}>
 */

export type EntityKind = 'IDEA' | 'FEATURE' | 'STORY' | 'SUPPORT';

export interface StatusColor {
  /** 卡片/列头底色（最浅，-50 级别） */
  bg: string;
  /** 边框色（-200 级别） */
  border: string;
  /** 文字色（-800/-900，可读） */
  text: string;
  /** 实心徽章（深色底 + 白字，-500/-600） */
  badge: string;
  /** 实心徽章文字色（通常 white） */
  badgeText: string;
}

export const STATUS_COLORS = {
  IDEA: {
    OPEN:             { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-700',   badge: 'bg-slate-500',   badgeText: 'text-white' },
    IN_REVIEW:        { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   badgeText: 'text-white' },
    PLANNED:          { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-500', badgeText: 'text-white' },
    SHIPPED:          { bg: 'bg-emerald-100',border: 'border-emerald-300', text: 'text-emerald-900', badge: 'bg-emerald-600', badgeText: 'text-white' },
    REJECTED:         { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    badge: 'bg-rose-500',    badgeText: 'text-white' },
    ALREADY_EXISTING: { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    badge: 'bg-rose-500',    badgeText: 'text-white' },
    DUPLICATED:       { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  badge: 'bg-orange-500',  badgeText: 'text-white' },
    DRAFT:            { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-800',     badge: 'bg-sky-500',     badgeText: 'text-white' },
  },
  FEATURE: {
    OPEN:               { bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-800',    badge: 'bg-pink-500',    badgeText: 'text-white' },
    READY_FOR_GROOMING: { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-800',  badge: 'bg-violet-500',  badgeText: 'text-white' },
    DECOMPOSITION:      { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   badgeText: 'text-white' },
    IN_DEVELOPING:      { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    badge: 'bg-blue-500',    badgeText: 'text-white' },
    IN_VERIFICATION:    { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  badge: 'bg-orange-500',  badgeText: 'text-white' },
    CLOSED:             { bg: 'bg-emerald-100',border: 'border-emerald-300', text: 'text-emerald-900', badge: 'bg-emerald-600', badgeText: 'text-white' },
  },
  STORY: {
    OPEN:        { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-700',   badge: 'bg-slate-500',   badgeText: 'text-white' },
    IN_PROGRESS: { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    badge: 'bg-blue-500',    badgeText: 'text-white' },
    REVIEW:      { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   badgeText: 'text-white' },
    DONE:        { bg: 'bg-emerald-100',border: 'border-emerald-300', text: 'text-emerald-900', badge: 'bg-emerald-600', badgeText: 'text-white' },
    BLOCKED:     { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    badge: 'bg-rose-500',    badgeText: 'text-white' },
  },
  SUPPORT: {
    OPEN:        { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    badge: 'bg-blue-500',    badgeText: 'text-white' },
    IN_REVIEW:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   badgeText: 'text-white' },
    CLOSED:      { bg: 'bg-emerald-100',border: 'border-emerald-300', text: 'text-emerald-900', badge: 'bg-emerald-600', badgeText: 'text-white' },
  },
} as const;

/** 默认 fallback（未知状态时使用） */
const DEFAULT_STATUS_COLOR: StatusColor = {
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
  badge: 'bg-gray-500',
  badgeText: 'text-white',
};

function getColor(kind: EntityKind, status: string): StatusColor {
  const group = STATUS_COLORS[kind] as Record<string, StatusColor>;
  return group[status] ?? DEFAULT_STATUS_COLOR;
}

/**
 * 获取卡片底色 + 边框 + 文字色（用于卡片、列头等需要轻量着色的容器）
 */
export function getStatusClasses(kind: EntityKind, status: string): string {
  const c = getColor(kind, status);
  return `${c.bg} ${c.border} ${c.text}`;
}

/**
 * 获取实心徽章样式（深色底 + 白字，用于详情页大徽章）
 */
export function getStatusBadgeClasses(kind: EntityKind, status: string): string {
  const c = getColor(kind, status);
  return `${c.badge} ${c.badgeText}`;
}

/**
 * 仅获取底色（用于卡片背景/左侧色条等）
 */
export function getStatusBg(kind: EntityKind, status: string): string {
  return getColor(kind, status).bg;
}

/**
 * 仅获取边框色
 */
export function getStatusBorder(kind: EntityKind, status: string): string {
  return getColor(kind, status).border;
}

/**
 * 仅获取文字色
 */
export function getStatusText(kind: EntityKind, status: string): string {
  return getColor(kind, status).text;
}
