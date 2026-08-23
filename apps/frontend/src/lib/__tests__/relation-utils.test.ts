import { describe, it, expect } from 'vitest';
import { getRelationLabelKey } from '@/lib/relation-utils';

describe('getRelationLabelKey（关联关系方向语义）', () => {
  it('PROMOTED_FROM + target（当前是源头/Idea 页）→ promotedTo「升级为」', () => {
    expect(getRelationLabelKey('PROMOTED_FROM', 'target')).toBe('promotedTo');
  });

  it('PROMOTED_FROM + source（当前是产物/Feature 页）→ promotedFrom「升级自」', () => {
    expect(getRelationLabelKey('PROMOTED_FROM', 'source')).toBe('promotedFrom');
  });

  it('CLONED_FROM + target → clonedTo「克隆为」', () => {
    expect(getRelationLabelKey('CLONED_FROM', 'target')).toBe('clonedTo');
  });

  it('CLONED_FROM + source → clonedFrom「克隆自」', () => {
    expect(getRelationLabelKey('CLONED_FROM', 'source')).toBe('clonedFrom');
  });

  it('RELATED 或未知类型 → related（无方向区分）', () => {
    expect(getRelationLabelKey('RELATED', 'target')).toBe('related');
    expect(getRelationLabelKey('UNKNOWN_TYPE', 'source')).toBe('related');
  });

  it('回归：I-3 场景（Idea 页看关联的 Feature）必须是 promotedTo 而非 promotedFrom', () => {
    // I-3 是源头（direction=target），关联的是"功能 升级为 PINECONE-F-1"
    const key = getRelationLabelKey('PROMOTED_FROM', 'target');
    expect(key).toBe('promotedTo');
    expect(key).not.toBe('promotedFrom');
  });
});
