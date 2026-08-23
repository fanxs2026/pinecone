/**
 * 安全转 number。
 *
 * 后端 Prisma Decimal 字段（如 time entry 的 hours）在 JSON 响应中是 string
 * （实测返回 "2.5" 而非 2.5），求和/格式化前必须显式转换，否则会触发
 * 字符串拼接或 toFixed is not a function 崩溃。
 */
export function toHoursNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
