import { describe, it, expect } from 'vitest';
import { resolveAssigneeAction } from '@/lib/assignee-utils';

describe('resolveAssigneeAction（按负责人看板拖拽决策）', () => {
  describe('拖到「未分配」列（targetColumnId = null）', () => {
    it('当前有负责人 → 返回 null（必须清空，P0 回归点：此前 null 被 || undefined 抹掉）', () => {
      expect(resolveAssigneeAction('user-a', null)).toBeNull();
    });

    it('当前无负责人 → undefined（不发无意义的 PATCH）', () => {
      expect(resolveAssigneeAction(null, null)).toBeUndefined();
      expect(resolveAssigneeAction(undefined, null)).toBeUndefined();
    });
  });

  describe('拖到具体用户列', () => {
    it('负责人已是该用户 → undefined（不操作）', () => {
      expect(resolveAssigneeAction('user-a', 'user-a')).toBeUndefined();
    });

    it('负责人不是该用户 → 返回目标用户 id（改派）', () => {
      expect(resolveAssigneeAction('user-b', 'user-a')).toBe('user-a');
    });

    it('当前无负责人 → 返回目标用户 id（指派）', () => {
      expect(resolveAssigneeAction(null, 'user-a')).toBe('user-a');
    });
  });

  it('null 与 undefined 语义隔离：null 透传、undefined 不请求', () => {
    const actions = [
      resolveAssigneeAction('user-a', null), // 清空
      resolveAssigneeAction('user-a', 'user-a'), // no-op
    ];
    expect(actions[0]).toBeNull();
    expect(actions[1]).toBeUndefined();
  });
});
