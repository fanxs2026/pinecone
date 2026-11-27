/**
 * 全站统一的日期/时间显示格式（2026-11-27 老板要求）：
 *   formatDate     → yyyy-mm-dd
 *   formatDateTime → yyyy-mm-dd HH:mm:ss
 * 不要再用 toLocaleDateString / toLocaleString —— 它们跟随系统区域设置，
 * 会产出 2026/11/27、2026/11/27 21:05:00 这类格式，与界面其他位置不一致。
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
