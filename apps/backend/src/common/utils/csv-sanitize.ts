/**
 * CSV 注入（公式注入）防护工具 —— 安全官 P0-5 设计期要求。
 *
 * 所有 CSV 导出（审计日志导出、导入模板导出、通用列表导出）必须经过
 * sanitizeCsvCell() 清洗，否则字段里以 = + - @ \t \r 开头的内容会在
 * Excel/WPS 打开时被当作公式执行（DDE 攻击 → 数据外泄）。
 *
 * 用法：
 *   rows.map(r => r.map(sanitizeCsvCell)).join('\n')
 */

const FORMULA_PREFIX = /^[=+\-@]/;

/**
 * 清洗单个单元格：对公式前缀做转义。
 * - 以 = + - @ 开头的 → 前面加单引号（Excel 惯例，不改变显示内容）
 * - \t \r 开头 → 前面加单引号，避免单元格被解析为制表/换行注入
 * - 其他内容原样返回（空值/undefined/null 转空串）
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  if (raw === '') return '';
  // 制表符/回车开头的注入也防护（Excel 会把 \t 开头的列当 tab 分隔）
  if (raw.startsWith('\t') || raw.startsWith('\r')) {
    return `'${raw}`;
  }
  // 公式前缀：= + - @（Excel 的 DDE/公式注入向量）
  if (FORMULA_PREFIX.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

/**
 * 批量清洗一行（数组形式），与行列转 CSV 的编码逻辑配合。
 */
export function sanitizeCsvRow(row: unknown[]): string[] {
  return row.map(sanitizeCsvCell);
}

/**
 * 将行数组转成标准 CSV 文本（RFC 4180 兼容）：
 * - 每个单元格经 sanitizeCsvCell 清洗
 * - 含逗号/引号/换行的内容用双引号包裹，内部引号翻倍转义
 * - 统一 \r\n 换行
 */
export function toCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = sanitizeCsvCell(cell);
          if (/[",\r\n]/.test(safe)) {
            return `"${safe.replace(/"/g, '""')}"`;
          }
          return safe;
        })
        .join(','),
    )
    .join('\r\n');
}
