import { describe, it, expect } from 'vitest';
import { toHoursNumber } from '@/lib/number-utils';

describe('toHoursNumber', () => {
  it('后端 Decimal 字符串（"2.5"）正确转 number', () => {
    expect(toHoursNumber('2.5')).toBe(2.5);
  });

  it('纯 number 原样返回', () => {
    expect(toHoursNumber(3)).toBe(3);
    expect(toHoursNumber(0)).toBe(0);
  });

  it('null / undefined 归 0（求和时不产生 NaN）', () => {
    expect(toHoursNumber(null)).toBe(0);
    expect(toHoursNumber(undefined)).toBe(0);
  });

  it('空字符串与非法字符串归 0', () => {
    expect(toHoursNumber('')).toBe(0);
    expect(toHoursNumber('abc')).toBe(0);
  });

  it('负数与小数正常', () => {
    expect(toHoursNumber('-1.25')).toBe(-1.25);
    expect(toHoursNumber(2.5)).toBe(2.5);
  });

  it('求和场景：0 + Number("2.5") = 2.5（回归：此前字符串拼接成 "02.5" 导致 toFixed 崩溃）', () => {
    const entries = ['2.5', 1, null, undefined];
    const total = entries.reduce<number>((sum, e) => sum + toHoursNumber(e), 0);
    expect(total).toBe(3.5);
    expect(total.toFixed(1)).toBe('3.5');
  });
});
