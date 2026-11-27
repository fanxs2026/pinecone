import { BadRequestException } from '@nestjs/common';

/**
 * 日期（date-only）归一化——DTO 到 Prisma 之间必须过这一层。
 *
 * 背景（2026-11-26 线上故障）：
 *   实体 DTO 的 dueDate 按产品语义是 `YYYY-MM-DD`（前端 `<input type="date">` 的原生值），
 *   但 Prisma 的 `DateTime` 参数只接受完整 ISO-8601（带时间），传纯日期会报
 *   `Invalid value for argument 'dueDate': premature end of input. Expected ISO-8601 DateTime.`
 *   表现为创建支持请求/特性/任务 500。
 *
 * 实现要点：
 *   1. 只取前 10 位 `YYYY-MM-DD`，**按 UTC 零点构造**——
 *      若直接 `new Date('2026-12-01T00:00:00+08:00')` 再存 date 列，UTC 日期会退到 11-30。
 *   2. 校验日期真实存在：`2026-02-31` 会被 Date 滚动到 3-3，这里比对回读的月/日拦掉。
 *   3. `null` / `undefined` / 空串 统一返回 null（清空语义）。
 */
export function toDateOnly(value?: string | Date | null): Date | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const s = String(value).trim();
  if (!s) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new BadRequestException(`无效日期：${s}（需 YYYY-MM-DD）`);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    throw new BadRequestException(`无效日期：${s}`);
  }
  return dt;
}
