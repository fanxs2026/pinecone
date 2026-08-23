import { computeWeightedScore, enrichScore } from './scoring';

/**
 * P0 测试集（2026-08-19 上线前全检）：评分数学（RICE/ICE/CUSTOM）+ autoReach 动态重算。
 * 纯函数，无 DB。
 */
describe('scoring (P0)', () => {
  it('RICE: reach * impact * confidence / effort', () => {
    expect(computeWeightedScore('RICE', { reach: 1000, impact: 3, confidence: 0.8, effort: 5 })).toBe(480);
  });

  it('RICE: effort 0 treated as 1 (防除零)', () => {
    expect(computeWeightedScore('RICE', { reach: 10, impact: 3, confidence: 1, effort: 0 })).toBe(30);
  });

  it('ICE: impact * confidence * ease', () => {
    expect(computeWeightedScore('ICE', { impact: 3, confidence: 0.8, ease: 0.5 })).toBe(1.2);
  });

  it('CUSTOM: weighted normalization to 0-100', () => {
    const cfg = {
      model: 'CUSTOM' as const,
      dimensions: [
        { key: 'impact', label: 'Impact', weight: 1, scale: 3 },
        { key: 'effort', label: 'Effort', weight: 1, scale: 0 },
      ],
    };
    // impact=3/3 → 1.0；effort=50/100 → 0.5 → avg 0.75 → 75
    expect(computeWeightedScore('CUSTOM', { impact: 3, effort: 50 }, cfg)).toBeCloseTo(75, 2);
  });

  it('enrichScore: RICE autoReach recomputes with current voteCount', () => {
    const s = { model: 'RICE', weightedScore: 0, dimensions: { reach: 0, impact: 3, confidence: 1, effort: 1, _reachAuto: true } };
    const out = enrichScore(s, 42);
    expect(out.weightedScore).toBe(126); // 42*3*1/1
    expect(out.reachAuto).toBe(true);
    expect((out.dimensions as any)._reachAuto).toBeUndefined(); // 内部标记剥离
  });

  it('enrichScore: manual reach (not auto) keeps stored score', () => {
    const s = { model: 'RICE', weightedScore: 500, dimensions: { reach: 100, impact: 5, confidence: 1, effort: 1 } };
    const out = enrichScore(s, 9999);
    expect(out.weightedScore).toBe(500);
    expect(out.reachAuto).toBe(false);
  });
});
