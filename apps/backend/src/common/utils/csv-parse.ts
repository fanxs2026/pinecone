/**
 * RFC 4180 兼容的 CSV 解析器（零依赖）。
 * 支持：双引号包裹含逗号/换行的字段、"" 转义引号、\r\n 与 \n 换行。
 * 输出：string[][]（第一行 = 表头）。空行自动跳过。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // 忽略（\r\n 的 \r 部分；孤立的 \r 换行在下面处理）
      if (text[i + 1] === '\n') continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 去掉空行（整行只有一个空字段）
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
