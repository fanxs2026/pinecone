/**
 * PDF 导出 — Canvas 绘制表格 + 手写 PDF 结构（DCTDecode 嵌入 JPEG）
 * 无第三方依赖；中文由浏览器 canvas 渲染，无需嵌入字体
 *
 * 列宽与截断：使用 Canvas measureText 真实测量（解决中英文混排的字符估算失真），
 * 二分查找最长可容纳子串（精确截断，避免溢出到邻列）。
 *
 * 注意：PDF 字典字符串使用 + 拼接而非模板字符串，避开 SWC 在
 * 「模板字符串 + << /... >> PDF 字典语法」上的解析异常。
 */

// A4 比例页面（单位：pt，PDF 内部用点）
const PAGE_W = 1000;
const PAGE_H = 1414; // A4 比例 1:1.414
const MARGIN = 40;
const HEADER_H = 34;
const ROW_H = 28;     // 单行最小行高
const LINE_H = 16;    // 折行后的行距（12px 字体）
const V_PADDING = 4;  // 单元格垂直 padding
const PADDING = 10;
const MIN_COL_PX = 70;  // 列内容区最小像素宽（防止过窄不可读）
const MAX_COL_PX = 480; // 列内容区最大像素宽（防止过长浪费）

interface PdfColumn {
  title: string;
  /** 列内容区宽度（不含左右 padding） */
  width: number;
}

/** 真实测量每列需要的像素宽度，按可用空间等比缩放 */
function measureColumns(
  measureCtx: CanvasRenderingContext2D,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): { columns: PdfColumn[]; cellWs: number[]; totalW: number } {
  const avail = PAGE_W - MARGIN * 2;
  const dataFont = '12px sans-serif';
  const headerFont = 'bold 13px sans-serif';

  // 测每列最长内容的实际像素宽（含 PADDING 余量）
  const measured: number[] = headers.map((h, i) => {
    measureCtx.font = headerFont;
    let maxW = measureCtx.measureText(h).width;
    measureCtx.font = dataFont;
    for (const row of rows) {
      const v = row[i];
      if (v != null) {
        const w = measureCtx.measureText(String(v)).width;
        if (w > maxW) maxW = w;
      }
    }
    return Math.min(Math.max(maxW + PADDING * 2, MIN_COL_PX), MAX_COL_PX);
  });

  // 等比缩放到可用空间
  const total = measured.reduce((s, n) => s + n, 0);
  const scale = total > avail ? avail / total : 1;

  const columns: PdfColumn[] = headers.map((h, i) => ({
    title: h,
    width: Math.max(Math.round(measured[i] * scale) - PADDING * 2, 30),
  }));
  const cellWs = columns.map((c) => c.width + PADDING * 2);
  const totalW = cellWs.reduce((s, w) => s + w, 0);
  return { columns, cellWs, totalW };
}

/**
 * 二分查找：在 maxWidth 内能放下的最长子串（追加省略号）
 * 精确截断，避免溢出到邻列
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  if (maxWidth < ctx.measureText(ellipsis).width) {
    // 极端窄列：连省略号都放不下，直接按字符截断
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (ctx.measureText(text.slice(0, mid)).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo);
  }
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : ellipsis;
}

/**
 * 自动折行：把长文本按列宽折成多行，返回行数组。
 * 逐字符用 measureText 真实测量（中英文混排不失真），完整保留内容、不省略。
 * 中文按字断行；英文长串按字符断行（保证内容完整优先）。
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const chars = Array.from(text); // Unicode 安全（表情/生僻字不拆坏）
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  for (const ch of chars) {
    const w = ctx.measureText(ch).width;
    if (line !== '' && lineW + w > maxWidth) {
      lines.push(line);
      line = '';
      lineW = 0;
    }
    line += ch;
    lineW += w;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 计算每行的实际高度（取该行所有单元格折行行数的最大值）。
 * 与绘制共用同一 ctx/font，保证测量一致。
 */
function getRowHeights(
  ctx: CanvasRenderingContext2D,
  columns: PdfColumn[],
  rows: (string | number | null | undefined)[][],
): number[] {
  const font = '12px sans-serif';
  return rows.map((row) => {
    let maxLines = 1;
    columns.forEach((col, ci) => {
      const v = row[ci];
      if (v == null) return;
      const lines = wrapText(ctx, String(v), col.width, font).length;
      if (lines > maxLines) maxLines = lines;
    });
    return Math.max(ROW_H, maxLines * LINE_H + V_PADDING * 2);
  });
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  columns: PdfColumn[],
  cellWs: number[],
  totalW: number,
  headers: string[],
  pageRows: (string | number | null | undefined)[][],
  rowHeights: number[],
  title: string,
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // 标题
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(title, MARGIN, MARGIN + 20);

  const tableTop = MARGIN + 40;
  const colX: number[] = [];
  let x = MARGIN;
  for (const w of cellWs) {
    colX.push(x);
    x += w;
  }

  // 表头
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(MARGIN, tableTop, totalW, HEADER_H);
  ctx.fillStyle = '#374151';
  headers.forEach((h, i) => {
    const cellText = fitText(ctx, h, columns[i].width, 'bold 13px sans-serif');
    // 垂直居中：13px 字体在 HEADER_H=34 行内，y 偏移 = (34-13)/2 ≈ 11
    ctx.fillText(cellText, colX[i] + PADDING, tableTop + 11);
  });
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(MARGIN, tableTop, totalW, HEADER_H);

  // 计算每行起始 y（动态行高累加）
  const rowYs: number[] = [];
  let ty = tableTop + HEADER_H;
  for (const rh of rowHeights) {
    rowYs.push(ty);
    ty += rh;
  }
  const tableBottom = ty;

  // 数据行（先画全部偶数行背景，再画全部文字，避免文字越界被覆盖）
  const dataFont = '12px sans-serif';
  ctx.fillStyle = '#f8fafc';
  for (let ri = 1; ri < pageRows.length; ri += 2) {
    ctx.fillRect(MARGIN, rowYs[ri], totalW, rowHeights[ri]);
  }
  ctx.fillStyle = '#374151';
  ctx.font = dataFont;
  pageRows.forEach((row, ri) => {
    columns.forEach((col, ci) => {
      const v = String(row[ci] ?? '');
      const lines = wrapText(ctx, v, col.width, dataFont);
      lines.forEach((ln, li) => {
        ctx.fillText(ln, colX[ci] + PADDING, rowYs[ri] + V_PADDING + li * LINE_H);
      });
    });
  });

  // 行分隔线
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  for (let ri = 1; ri <= pageRows.length; ri++) {
    const y = ri < rowYs.length ? rowYs[ri] : tableBottom;
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(MARGIN + totalW, y);
  }
  ctx.stroke();

  // 竖向分隔线
  ctx.beginPath();
  for (let i = 0; i < colX.length; i++) {
    const lx = colX[i] + cellWs[i];
    ctx.moveTo(lx, tableTop);
    ctx.lineTo(lx, tableBottom);
  }
  ctx.stroke();
}

/** 生成一个 PDF 文件（每页 3 对象：Page/Image/Content） */
function buildPdf(jpegPages: Uint8Array[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const push = (s: string) => parts.push(encoder.encode(s));
  const byteLength = () => parts.reduce((s, p) => s + p.length, 0);

  const pageCount = jpegPages.length;
  const offsets: number[] = [];

  push('%PDF-1.4\n');

  // 1: Catalog
  offsets.push(byteLength());
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets.push(byteLength());
  const kids: string[] = [];
  for (let i = 0; i < pageCount; i++) kids.push((3 + i * 3) + ' 0 R');
  push('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>\nendobj\n');

  jpegPages.forEach((jpeg, i) => {
    const pageObj = 3 + i * 3;
    const imgObj = pageObj + 1;
    const contentObj = pageObj + 2;

    offsets.push(byteLength());
    push(pageObj + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Resources << /XObject << /Im0 ' + imgObj + ' 0 R >> >> /Contents ' + contentObj + ' 0 R >>\nendobj\n');

    offsets.push(byteLength());
    push(imgObj + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + PAGE_W + ' /Height ' + PAGE_H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    parts.push(jpeg);
    push('\nendstream\nendobj\n');

    offsets.push(byteLength());
    const contentStream = 'q ' + PAGE_W + ' 0 0 ' + PAGE_H + ' 0 0 cm /Im0 Do Q';
    const contentBytes = encoder.encode(contentStream);
    push(contentObj + ' 0 obj\n<< /Length ' + contentBytes.length + ' >>\nstream\n');
    parts.push(contentBytes);
    push('\nendstream\nendobj\n');
  });

  const xrefPos = byteLength();
  push('xref\n0 ' + (offsets.length + 1) + '\n0000000000 65535 f \n');
  for (const off of offsets) {
    push(String(off).padStart(10, '0') + ' 00000 n \n');
  }
  push('trailer\n<< /Size ' + (offsets.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');

  // Copy parts into ArrayBuffer-backed views to satisfy BlobPart typing (TS 5.7+)
  return new Blob(parts.map((p) => new Uint8Array(p)), { type: 'application/pdf' });
}

/**
 * 导出 PDF（表格渲染，自动分页，支持中文）
 * @param filename 文件名（不含扩展名，自动加日期）
 */
export async function downloadPdf(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  title?: string,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);

  // 测量列宽（用独立 canvas，与绘制同字体环境）
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.textBaseline = 'top';
  measureCtx.textAlign = 'left';
  const { columns, cellWs, totalW } = measureColumns(measureCtx, headers, rows);

  // 自动折行 + 动态行高
  const rowHeights = getRowHeights(measureCtx, columns, rows);
  const availH = PAGE_H - MARGIN - 60 - HEADER_H;

  // 按累计行高分页（每页放不下就换页，行高自适应内容）
  const pageChunks: (string | number | null | undefined)[][][] = [];
  const pageRowHeights: number[][] = [];
  let chunk: (string | number | null | undefined)[][] = [];
  let chunkHeights: number[] = [];
  let chunkH = 0;
  for (let i = 0; i < rows.length; i++) {
    const rh = rowHeights[i];
    if (chunk.length > 0 && chunkH + rh > availH) {
      pageChunks.push(chunk);
      pageRowHeights.push(chunkHeights);
      chunk = [];
      chunkHeights = [];
      chunkH = 0;
    }
    chunk.push(rows[i]);
    chunkHeights.push(rh);
    chunkH += rh;
  }
  if (chunk.length > 0 || pageChunks.length === 0) {
    pageChunks.push(chunk);
    pageRowHeights.push(chunkHeights);
  }

  // 每页绘制为 canvas → JPEG
  const jpegPages: Uint8Array[] = [];
  for (let p = 0; p < pageChunks.length; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    drawPage(ctx, columns, cellWs, totalW, headers, pageChunks[p], pageRowHeights[p], title || filename);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    jpegPages.push(bytes);
  }

  const blob = buildPdf(jpegPages);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '-' + date + '.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
