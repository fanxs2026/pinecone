import { BadRequestException } from '@nestjs/common';
import { toDateOnly } from './date-only';

/**
 * 2026-11-26 线上故障回归：DTO 的 dueDate 是 YYYY-MM-DD，
 * Prisma 的 DateTime 只接受完整 ISO-8601，直接透传会 500。
 */
describe('toDateOnly', () => {
  it('纯日期 → UTC 零点（不因时区偏移到前一天）', () => {
    const d = toDateOnly('2026-12-01');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('带时区的完整 ISO 只取日期部分', () => {
    // 若按本地时区解析，+08:00 的零点在 UTC 是前一天 16:00，date 列会被写成 11-30
    const d = toDateOnly('2026-12-01T00:00:00+08:00');
    expect(d!.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('空值统一为 null（清空语义）', () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
    expect(toDateOnly('')).toBeNull();
    expect(toDateOnly('   ')).toBeNull();
  });

  it('Date 对象原样返回', () => {
    const src = new Date('2030-05-06T00:00:00.000Z');
    expect(toDateOnly(src)).toBe(src);
  });

  it('不存在的日期抛 400（2026-02-31）', () => {
    expect(() => toDateOnly('2026-02-31')).toThrow(BadRequestException);
  });

  it('格式非法抛 400', () => {
    expect(() => toDateOnly('2026/12/01')).toThrow(BadRequestException);
    expect(() => toDateOnly('tomorrow')).toThrow(BadRequestException);
  });

  it('闰年 2 月 29 合法 / 平年非法', () => {
    expect(toDateOnly('2028-02-29')!.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(() => toDateOnly('2026-02-29')).toThrow(BadRequestException);
  });
});
