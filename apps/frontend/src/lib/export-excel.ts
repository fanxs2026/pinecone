/**
 * Excel 导出 — 生成标准 .xlsx（OOXML + ZIP）
 * 无第三方依赖：ZIP 结构手写 + CompressionStream('deflate-raw') 压缩 XML
 * 浏览器要求：Chrome/Edge/Firefox/Safari 16.4+（均支持 CompressionStream）
 */

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- ZIP ---------- */
function writeU16(arr: Uint8Array, off: number, v: number): void {
  arr[off] = v & 0xff;
  arr[off + 1] = (v >>> 8) & 0xff;
}
function writeU32(arr: Uint8Array, off: number, v: number): void {
  arr[off] = v & 0xff;
  arr[off + 1] = (v >>> 8) & 0xff;
  arr[off + 2] = (v >>> 16) & 0xff;
  arr[off + 3] = (v >>> 24) & 0xff;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  // Copy into an ArrayBuffer-backed view: satisfies BlobPart typing on TS 5.7+
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function buildZip(files: { name: string; content: Uint8Array }[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const compressed = await deflateRaw(f.content);
    const crc = crc32(f.content);

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20); // version needed
    writeU16(local, 6, 0x0800); // UTF-8 name flag
    writeU16(local, 8, 8); // deflate
    writeU16(local, 10, 0); // mod time
    writeU16(local, 12, 0); // mod date
    writeU32(local, 14, crc);
    writeU32(local, 18, compressed.length);
    writeU32(local, 22, f.content.length);
    writeU16(local, 26, nameBytes.length);
    writeU16(local, 28, 0);
    local.set(nameBytes, 30);
    chunks.push(local, compressed);

    // Central directory header
    const cen = new Uint8Array(46 + nameBytes.length);
    writeU32(cen, 0, 0x02014b50);
    writeU16(cen, 4, 20); // version made by
    writeU16(cen, 6, 20); // version needed
    writeU16(cen, 8, 0x0800);
    writeU16(cen, 10, 8);
    writeU16(cen, 12, 0);
    writeU16(cen, 14, 0);
    writeU32(cen, 16, crc);
    writeU32(cen, 20, compressed.length);
    writeU32(cen, 24, f.content.length);
    writeU16(cen, 28, nameBytes.length);
    writeU16(cen, 30, 0);
    writeU16(cen, 32, 0);
    writeU16(cen, 34, 0);
    writeU16(cen, 36, 0);
    writeU32(cen, 38, 0); // external attrs
    writeU32(cen, 42, offset); // local header offset
    cen.set(nameBytes, 46);
    centralParts.push(cen);

    offset += local.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, offset);
  writeU16(eocd, 20, 0);

  const all = [...chunks, ...centralParts, eocd];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of all) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/* ---------- XLSX XML ---------- */
function xmlEscape(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(index: number): string {
  let n = index;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function sheetXml(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  lines.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>');

  const headerCells = headers
    .map((h, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${xmlEscape(h)}</t></is></c>`)
    .join('');
  lines.push(`<row r="1">${headerCells}</row>`);

  rows.forEach((row, ri) => {
    const cells = row
      .map((v, ci) => `<c r="${colName(ci)}${ri + 2}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`)
      .join('');
    lines.push(`<row r="${ri + 2}">${cells}</row>`);
  });

  lines.push('</sheetData></worksheet>');
  return lines.join('');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

/**
 * 导出 Excel (.xlsx) — 标准 OOXML 格式
 * @param filename 文件名（不含扩展名，自动加日期）
 */
export async function downloadExcel(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', content: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', content: encoder.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', content: encoder.encode(WORKBOOK) },
    { name: 'xl/_rels/workbook.xml.rels', content: encoder.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', content: encoder.encode(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', content: encoder.encode(sheetXml(headers, rows)) },
  ];

  const zip = await buildZip(files);
  const blob = new Blob([new Uint8Array(zip)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
