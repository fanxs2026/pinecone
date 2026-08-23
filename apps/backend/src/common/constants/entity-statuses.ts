/**
 * 实体状态枚举 — 单一事实源（后端）。
 *
 * 规则：
 * 1. 所有 Create/Update DTO 的白名单必须引用这里的常量（禁止在 DTO 里另写一份）
 * 2. 修改状态枚举时同步更新前端 src/lib/entity-statuses.ts（两端物理分离，注释对齐）
 * 3. DB 的 status 字段是 String（非 Prisma enum），合法性完全依赖这里的白名单 + DTO @IsIn
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

// 缺陷严重度（仅 type=DEFECT 有意义）
export const SUPPORT_SEVERITIES = [
  'CRITICAL',
  'MAJOR',
  'MINOR',
  'TRIVIAL',
] as const;

// Story 子类型：功能 / 缺陷 / 技术债
export const STORY_KINDS = [
  'FEATURE',
  'DEFECT',
  'CHORE',
] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export type StoryStatus = (typeof STORY_STATUSES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];
export type StoryKind = (typeof STORY_KINDS)[number];
