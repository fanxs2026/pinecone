/**
 * 实体状态枚举 — 单一事实源（前端）。
 *
 * 规则：
 * 1. 所有页面/组件的状态筛选、看板列、详情页选择器必须引用这里的常量（禁止在页面里另写）
 * 2. 修改状态枚举时同步更新后端 src/common/constants/entity-statuses.ts（两端物理分离，注释对齐）
 * 3. status-colors.ts 只负责配色，不负责枚举定义
 */

export const IDEA_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'PLANNED',
  'SHIPPED',
  'REJECTED',
  'ALREADY_EXISTING',
  'DUPLICATED',
  'DRAFT',
] as const;

export const FEATURE_STATUSES = [
  'OPEN',
  'READY_FOR_GROOMING',
  'DECOMPOSITION',
  'IN_DEVELOPING',
  'IN_VERIFICATION',
  'CLOSED',
] as const;

export const STORY_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'BLOCKED',
] as const;

export const SUPPORT_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'CLOSED',
] as const;

// 缺陷严重度（仅 type=DEFECT 有意义）——与后端 common/constants/entity-statuses.ts 对齐
export const SUPPORT_SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'] as const;

// Story 子类型：功能 / 缺陷 / 技术债——与后端对齐
export const STORY_KINDS = ['FEATURE', 'DEFECT', 'CHORE'] as const;

export const SUPPORT_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: '致命',
  MAJOR: '严重',
  MINOR: '一般',
  TRIVIAL: '轻微',
};

export const STORY_KIND_LABELS: Record<string, string> = {
  FEATURE: '功能',
  DEFECT: '缺陷',
  CHORE: '技术债',
};

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export type StoryStatus = (typeof STORY_STATUSES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
