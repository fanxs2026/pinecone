// P0：优先级评分公式 + 配置归一化（RICE / ICE / CUSTOM）
// 供 scores 模块与实体列表聚合共用。

export type ScoringDimension = {
  key: string;
  label: string;
  weight: number; // 权重（CUSTOM 用；RICE/ICE 为 1）
  scale: number; // 量表上限（0 = 无上限/自由值，如 reach、effort）
};

export type ScoringConfig = {
  model: 'RICE' | 'ICE' | 'CUSTOM';
  dimensions: ScoringDimension[];
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  model: 'RICE',
  dimensions: [
    { key: 'reach', label: 'Reach', weight: 1, scale: 0 },
    { key: 'impact', label: 'Impact', weight: 1, scale: 3 },
    { key: 'confidence', label: 'Confidence', weight: 1, scale: 1 },
    { key: 'effort', label: 'Effort', weight: 1, scale: 0 },
  ],
};

/** 归一化 workspace.scoringConfig（脏数据/缺失 → 默认） */
export function normalizeScoringConfig(raw: unknown): ScoringConfig {
  const config = (raw ?? {}) as Partial<ScoringConfig>;
  if (config.model !== 'RICE' && config.model !== 'ICE' && config.model !== 'CUSTOM') {
    return DEFAULT_SCORING_CONFIG;
  }
  const dims = Array.isArray(config.dimensions) && config.dimensions.length > 0
    ? (config.dimensions as ScoringDimension[]).filter((d) => d && typeof d.key === 'string')
    : DEFAULT_SCORING_CONFIG.dimensions;
  return { model: config.model, dimensions: dims };
}

/** 计算加权分。reach 支持手动覆盖；autoReach 由调用方（票数）注入 */
export function computeWeightedScore(
  model: string,
  dimensions: Record<string, number>,
  config?: ScoringConfig,
): number {
  const d = dimensions ?? {};
  if (model === 'RICE') {
    const reach = d.reach ?? 0;
    const impact = d.impact ?? 0;
    const confidence = d.confidence ?? 0;
    const effort = d.effort && d.effort > 0 ? d.effort : 1;
    return Number(((reach * impact * confidence) / effort).toFixed(2));
  }
  if (model === 'ICE') {
    const impact = d.impact ?? 0;
    const confidence = d.confidence ?? 0;
    const ease = d.ease ?? 0;
    return Number((impact * confidence * ease).toFixed(2));
  }
  // CUSTOM：加权归一化到 0-100
  const cfg = config ?? DEFAULT_SCORING_CONFIG;
  const dims = cfg.dimensions.length ? cfg.dimensions : DEFAULT_SCORING_CONFIG.dimensions;
  let sum = 0;
  let weightTotal = 0;
  for (const dim of dims) {
    const val = d[dim.key];
    if (val === undefined || val === null || Number.isNaN(Number(val))) continue;
    const normalized = dim.scale > 0 ? Math.min(Math.max(Number(val), 0), dim.scale) / dim.scale : Math.min(Math.max(Number(val), 0), 100) / 100;
    sum += normalized * (dim.weight || 1);
    weightTotal += dim.weight || 1;
  }
  if (weightTotal <= 0) return 0;
  return Number(((sum / weightTotal) * 100).toFixed(2));
}

export interface PublicScore {
  model: string;
  weightedScore: number;
  dimensions: Record<string, number>;
  /** reach 是否为自动（RICE 未手动填，由票数驱动） */
  reachAuto: boolean;
}

/**
 * 读取端统一处理（2026-08-15）：RICE + 自动 reach 时用当前票数动态重算加权分，
 * 并剥离内部标记 _reachAuto（不暴露给前端）。
 */
export function enrichScore(
  score: { model: string; weightedScore: number; dimensions: any },
  voteCount?: number,
): PublicScore {
  const dims: any = { ...(score.dimensions ?? {}) };
  const reachAuto = dims._reachAuto === true;
  let weightedScore = score.weightedScore;
  if (score.model === 'RICE' && reachAuto && typeof voteCount === 'number') {
    dims.reach = voteCount;
    weightedScore = computeWeightedScore(score.model, dims, undefined);
  }
  const { _reachAuto, ...publicDims } = dims;
  return { model: score.model, weightedScore, dimensions: publicDims as Record<string, number>, reachAuto };
}
