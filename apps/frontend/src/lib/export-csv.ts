/**
 * 导出 CSV 工具 — 带 BOM（\uFEFF），避免 Excel 打开中文乱码
 */

import { formatDate } from './date-utils';

function escapeCsvCell(value: string | number | null | undefined): string {
  let s = String(value ?? '');
  // CSV formula injection: neutralize = + - @ and tab/CR prefixes so Excel
  // treats them as text, not formulas (OWASP CSV Injection)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 导出 CSV 文件（触发浏览器下载）
 * @param filename 文件名（不含扩展名，自动加 .csv 和日期）
 * @param headers 表头
 * @param rows 数据行
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const date = formatDate(new Date()); // 本地日期：toISOString 走 UTC，凌晨导出会差一天
  const content =
    '\uFEFF' +
    [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
