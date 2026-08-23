/**
 * 按负责人看板拖拽决策：返回要设置的 assigneeId。
 *
 * - targetColumnId === null（拖到「未分配」列）：当前有负责人 → 返回 null（清空）；
 *   当前无负责人 → 返回 undefined（不操作，避免无意义的 PATCH）
 * - targetColumnId 为具体用户 id：已是该用户 → undefined（不操作）；
 *   否则 → 返回该用户 id（改派）
 *
 * ⚠️ 返回 null 与 undefined 语义不同：null 必须随 PATCH 透传给后端（清空负责人），
 * undefined 表示不发请求。调用处用 `!== undefined` 判断是否发请求。
 */
export function resolveAssigneeAction(
  currentAssigneeId: string | null | undefined,
  targetColumnId: string | null,
): string | null | undefined {
  if (targetColumnId === null) {
    return currentAssigneeId == null ? undefined : null;
  }
  return currentAssigneeId === targetColumnId ? undefined : targetColumnId;
}
