/**
 * 自定义属性值校验与归一（纯函数，便于单测）。
 *
 * 约定：
 * - 定义是唯一真相：入参中未定义的 key 一律丢弃，避免历史残留与脏数据回流。
 * - 空值判定统一为 undefined / null / '' / []，其余一律按类型校验。
 * - 本文件不依赖 Nest，错误以字符串数组返回，由 service 层决定抛什么异常。
 */

/** 单工作区单实体类型的启用字段默认上限（归档不占额度） */
export const DEFAULT_CUSTOM_FIELD_LIMIT = 20;

/** 可配置上限的天花板：再高会拖慢详情页渲染与删除字段时的批量清理 */
export const MAX_CUSTOM_FIELD_LIMIT = 200;

/**
 * 读取部署环境配置的字段上限。
 *
 * 通过环境变量 `CUSTOM_FIELD_LIMIT` 调整，默认 20；非法值或越界一律回退默认，
 * 避免配错把新建入口锁死。上限本身不对外开放给终端用户——它是容量保护，
 * 客户自行调高只会让详情页渲染更多控件。
 */
export function getCustomFieldLimit(): number {
  const raw = process.env.CUSTOM_FIELD_LIMIT;
  if (!raw || raw.trim() === '') return DEFAULT_CUSTOM_FIELD_LIMIT;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CUSTOM_FIELD_LIMIT) {
    return DEFAULT_CUSTOM_FIELD_LIMIT;
  }
  return parsed;
}

export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'SELECT',
  'MULTI_SELECT',
  'DATE',
  'CHECKBOX',
  'URL',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** SELECT / MULTI_SELECT 的选项结构 */
export interface CustomFieldOption {
  value: string;
  label: string;
}

/** 校验所需的最小定义视图（与 Prisma 模型解耦，便于测试构造） */
export interface CustomFieldDef {
  key: string;
  label: string;
  type: string;
  options?: unknown;
  isRequired: boolean;
  isActive: boolean;
}

const TEXT_MAX = 2000;
const URL_MAX = 2048;

/** 解析选项，容忍 null / 非数组 / 缺字段的历史数据 */
export function parseOptions(raw: unknown): CustomFieldOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldOption[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const value = rec.value;
    if (typeof value !== 'string' || value.length === 0) continue;
    const label = typeof rec.label === 'string' && rec.label.length > 0 ? rec.label : value;
    out.push({ value, label });
  }
  return out;
}

/** 严格日历校验：既校验格式，也拦住 2026-02-30 这类不存在的日期 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface NormalizeOneResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function normalizeOne(def: CustomFieldDef, raw: unknown): NormalizeOneResult {
  switch (def.type) {
    case 'TEXT': {
      if (typeof raw !== 'string') return { ok: false, error: '应为文本' };
      const text = raw.trim();
      if (text.length > TEXT_MAX) return { ok: false, error: `长度不能超过 ${TEXT_MAX} 个字符` };
      return { ok: true, value: text };
    }
    case 'URL': {
      if (typeof raw !== 'string') return { ok: false, error: '应为链接' };
      const text = raw.trim();
      if (text.length > URL_MAX) return { ok: false, error: `长度不能超过 ${URL_MAX} 个字符` };
      if (!isHttpUrl(text)) return { ok: false, error: '需为 http/https 链接' };
      return { ok: true, value: text };
    }
    case 'NUMBER': {
      const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
      if (!Number.isFinite(num)) return { ok: false, error: '应为数字' };
      return { ok: true, value: num };
    }
    case 'DATE': {
      if (typeof raw !== 'string') return { ok: false, error: '应为日期（YYYY-MM-DD）' };
      const text = raw.trim();
      if (!isIsoDate(text)) return { ok: false, error: '应为合法日期（YYYY-MM-DD）' };
      return { ok: true, value: text };
    }
    case 'SELECT': {
      if (typeof raw !== 'string') return { ok: false, error: '应为单个选项值' };
      const allowed = parseOptions(def.options).map((o) => o.value);
      if (!allowed.includes(raw)) return { ok: false, error: `不在可选项内（${allowed.join(' / ')}）` };
      return { ok: true, value: raw };
    }
    case 'MULTI_SELECT': {
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
      if (!list) return { ok: false, error: '应为选项值数组' };
      const allowed = parseOptions(def.options).map((o) => o.value);
      const picked: string[] = [];
      for (const item of list) {
        if (typeof item !== 'string') return { ok: false, error: '选项值必须为文本' };
        if (!allowed.includes(item)) return { ok: false, error: `包含不可选项（${item}）` };
        if (!picked.includes(item)) picked.push(item);
      }
      return { ok: true, value: picked };
    }
    case 'CHECKBOX': {
      if (typeof raw !== 'boolean') return { ok: false, error: '应为是/否' };
      return { ok: true, value: raw };
    }
    default:
      // 未知类型按文本处理，避免历史脏类型定义导致整条实体无法保存
      if (typeof raw !== 'string') return { ok: false, error: '应为文本' };
      return { ok: true, value: raw.trim() };
  }
}

/**
 * 按定义归一 + 校验。
 *
 * @param defs     当前工作区该实体类型的字段定义（调用方负责只传 isActive=true）
 * @param input    前端提交的 customFields 对象
 * @param requireAll 是否校验必填（创建、或更新时携带了 customFields 都为 true）
 */
export function normalizeCustomFields(
  defs: CustomFieldDef[],
  input: Record<string, unknown> | null | undefined,
  opts: { requireAll: boolean },
): { value: Record<string, unknown>; errors: string[] } {
  const source = input ?? {};
  const errors: string[] = [];
  const value: Record<string, unknown> = {};

  for (const def of defs) {
    const raw = source[def.key];
    if (isEmpty(raw)) {
      if (opts.requireAll && def.isRequired) {
        errors.push(`「${def.label}」为必填项`);
      }
      continue;
    }
    const result = normalizeOne(def, raw);
    if (!result.ok) {
      errors.push(`「${def.label}」${result.error ?? '格式不正确'}`);
      continue;
    }
    value[def.key] = result.value;
  }

  return { value, errors };
}

/** key 命名规范：小写字母开头，允许小写字母、数字、下划线，长度 1-40 */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,39}$/.test(key);
}

/** 字段类型变更是否兼容（仅允许同族内的宽松方向，其余要求新建字段） */
export function isTypeChangeAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  // 文本族：TEXT 与 URL 之间可切换（历史值多为自由文本）
  const textFamily = new Set(['TEXT', 'URL']);
  return textFamily.has(from) && textFamily.has(to);
}
