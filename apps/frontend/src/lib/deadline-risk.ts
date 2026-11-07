/**
 * 交付时限风险计算（纯函数）。
 *
 * 口径：
 * - 有效截止日按 dueDate → 迭代结束日 → 发布结束日 回退，回退结果不写回数据库。
 * - 只按时间消耗比例分级，不掺进度（任务拆分、改估点会让进度因子剧烈抖动，先上会误报）。
 * - 日期一律按「日历日」比较，不做时区换算，避免跨时区出现差一天。
 */

export type DeadlineRisk = 'NONE' | 'DONE' | 'GREEN' | 'YELLOW' | 'RED' | 'OVERDUE';

/** 时间消耗比例的分界值：低于黄色→绿，达到红色→红 */
export const RISK_YELLOW_AT = 0.6;
export const RISK_RED_AT = 0.85;

/** 各实体的完成态（用于判断是否还参与风险计算） */
export const DONE_STATUSES_BY_ENTITY: Record<string, readonly string[]> = {
  STORY: ['DONE'],
  FEATURE: ['CLOSED'],
  SUPPORT: ['CLOSED'],
};

export interface DeadlineRiskResult {
  risk: DeadlineRisk;
  /** 时间消耗比例 0-1；无法计算时为 null */
  ratio: number | null;
  /** 实际参与计算的有效截止日（YYYY-MM-DD） */
  effectiveDue: string | null;
  /** 有效截止日是否来自回退（迭代/发布），用于界面提示 */
  fromFallback: boolean;
  /** 逾期天数，未逾期为 0 */
  overdueDays: number;
}

const EMPTY: DeadlineRiskResult = {
  risk: 'NONE',
  ratio: null,
  effectiveDue: null,
  fromFallback: false,
  overdueDays: 0,
};

/**
 * 取出 YYYY-MM-DD 部分。
 * 后端返回的是 ISO 时间串（@db.Date 序列化为 UTC 零点），直接切片可避免时区偏移。
 */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

/** 两端都是 YYYY-MM-DD，返回 b - a 的天数 */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const left = Date.UTC(ay, am - 1, ad);
  const right = Date.UTC(by, bm - 1, bd);
  return Math.round((right - left) / 86_400_000);
}

function todayLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeDeadlineRisk(input: {
  status: string;
  entityType: keyof typeof DONE_STATUSES_BY_ENTITY;
  dueDate?: string | Date | null;
  /** 计时起点：迭代开始日，没有则用实体创建时间 */
  startedAt?: string | Date | null;
  /** 回退截止日：迭代结束日，其次发布结束日 */
  fallbackDueDate?: string | Date | null;
  now?: Date;
}): DeadlineRiskResult {
  const doneStatuses = DONE_STATUSES_BY_ENTITY[input.entityType] ?? [];
  if (doneStatuses.includes(input.status)) {
    return { ...EMPTY, risk: 'DONE', effectiveDue: toDateOnly(input.dueDate) };
  }

  const ownDue = toDateOnly(input.dueDate);
  const fallbackDue = toDateOnly(input.fallbackDueDate);
  const effectiveDue = ownDue ?? fallbackDue;
  if (!effectiveDue) return EMPTY;

  const now = input.now ?? new Date();
  const today = todayLocal(now);

  const overdueDays = daysBetween(effectiveDue, today);
  if (overdueDays > 0) {
    return {
      risk: 'OVERDUE',
      ratio: 1,
      effectiveDue,
      fromFallback: ownDue === null,
      overdueDays,
    };
  }

  const startedOn = toDateOnly(input.startedAt) ?? today;
  const total = daysBetween(startedOn, effectiveDue);
  if (total <= 0) {
    // 起始日晚于截止日属于数据异常，按最高风险呈现，避免静默漏报
    return {
      risk: 'OVERDUE',
      ratio: 1,
      effectiveDue,
      fromFallback: ownDue === null,
      overdueDays: 0,
    };
  }

  const used = Math.max(0, daysBetween(startedOn, today));
  const ratio = Math.min(1, used / total);

  let risk: DeadlineRisk = 'GREEN';
  if (ratio >= RISK_RED_AT) risk = 'RED';
  else if (ratio >= RISK_YELLOW_AT) risk = 'YELLOW';

  return { risk, ratio, effectiveDue, fromFallback: ownDue === null, overdueDays: 0 };
}
