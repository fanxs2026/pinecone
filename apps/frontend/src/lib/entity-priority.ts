// 实体优先级（2026-08-15：Story 与 Feature 统一 P1-P5，默认 P3）
// 选项：P1(Very high) / P2(High) / P3(Medium) / P4(Low) / P5(Very low)

export const ENTITY_PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type EntityPriority = (typeof ENTITY_PRIORITIES)[number];

export const ENTITY_PRIORITY_LABELS: Record<string, string> = {
  P1: 'Very high',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
  P5: 'Very low',
};

export const ENTITY_PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-blue-100 text-blue-700',
  P4: 'bg-gray-200 text-gray-600',
  P5: 'bg-gray-100 text-gray-400',
};

/** 下拉选项文案：P1 - Very high */
export const entityPriorityOption = (p: string) =>
  ENTITY_PRIORITY_LABELS[p] ? `${p} - ${ENTITY_PRIORITY_LABELS[p]}` : p;

/** 等级名：Very high（未知值回退原值） */
export const entityPriorityLabel = (p: string) => ENTITY_PRIORITY_LABELS[p] ?? p;
