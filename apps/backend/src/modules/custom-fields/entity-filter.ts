/**
 * 列表筛选条件的解析与归一（纯函数）。
 *
 * 前端以单个查询参数 `cf` 传 JSON，而不是散落的多个参数——
 * 保存视图需要把整套条件原样存取，单参数结构与存储结构一一对应，不会漂移。
 *
 * 结构：
 * {
 *   "status": ["OPEN", "IN_PROGRESS"],
 *   "priority": ["P1"],
 *   "assigneeId": ["<userId>", "unassigned"],
 *   "customFields": { "env": ["prod"], "customer": ["A公司"] }
 * }
 */

export interface EntityFilter {
  status?: string[];
  priority?: string[];
  /** 'unassigned' 表示未指派 */
  assigneeId?: string[];
  /** 每个 key 对应字段定义的 key，值为允许的取值集合（任一命中即匹配） */
  customFields?: Record<string, (string | number | boolean)[]>;
}

const MAX_VALUES_PER_KEY = 50;
const MAX_KEYS = 40;
const MAX_RAW_LENGTH = 8000;

function toArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return null;
  // 容忍单值，前端某些场景会直接传字符串
  return [value];
}

function toStringList(value: unknown, max = MAX_VALUES_PER_KEY): string[] | undefined {
  const list = toArray(value);
  if (!list) return undefined;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 200) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 解析 `cf` 查询参数。任何格式错误一律当作「无筛选」而不是抛错——
 * 筛选条件保存在客户端，脏数据不应导致列表打不开。
 */
export function parseEntityFilter(raw: string | undefined | null): EntityFilter | null {
  if (!raw || raw.trim() === '' || raw.length > MAX_RAW_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const src = parsed as Record<string, unknown>;
  const filter: EntityFilter = {};

  const status = toStringList(src.status);
  if (status) filter.status = status;
  const priority = toStringList(src.priority, 10);
  if (priority) filter.priority = priority;
  const assigneeId = toStringList(src.assigneeId);
  if (assigneeId) filter.assigneeId = assigneeId;

  if (typeof src.customFields === 'object' && src.customFields !== null && !Array.isArray(src.customFields)) {
    const entries = Object.entries(src.customFields as Record<string, unknown>).slice(0, MAX_KEYS);
    const customFields: Record<string, (string | number | boolean)[]> = {};
    for (const [key, value] of entries) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
      const list = toArray(value);
      if (!list) continue;
      const picked: (string | number | boolean)[] = [];
      for (const item of list) {
        if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') continue;
        if (!picked.includes(item)) picked.push(item);
        if (picked.length >= MAX_VALUES_PER_KEY) break;
      }
      if (picked.length > 0) customFields[key] = picked;
    }
    if (Object.keys(customFields).length > 0) filter.customFields = customFields;
  }

  return Object.keys(filter).length > 0 ? filter : null;
}
