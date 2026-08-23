export type RelationDirection = 'source' | 'target';

export type RelationLabelKey = 'promotedTo' | 'promotedFrom' | 'clonedTo' | 'clonedFrom' | 'related';

/**
 * 返回关联关系标签的 i18n key（按 direction 区分语义）。
 *
 * - direction === 'target'：当前实体是源头（如 Idea 升级为 Feature）→ "…to"（升级为 / 克隆为）
 * - direction === 'source'：当前实体是产物（如 Feature 升级自 Idea）→ "…from"（升级自 / 克隆自）
 *
 * 之前统一显示"升级自"导致 I-3 详情页出现"功能 升级自"的反向语义 bug。
 */
export function getRelationLabelKey(
  relationType: string,
  direction: RelationDirection,
): RelationLabelKey {
  if (relationType === 'PROMOTED_FROM') {
    return direction === 'target' ? 'promotedTo' : 'promotedFrom';
  }
  if (relationType === 'CLONED_FROM') {
    return direction === 'target' ? 'clonedTo' : 'clonedFrom';
  }
  return 'related';
}
