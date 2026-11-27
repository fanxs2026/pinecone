/**
 * 文件内容魔数校验（P1-① 安全加固，无第三方依赖）。
 *
 * 背景：uploads 之前仅校验客户端声明的 file.mimetype（完全可控），攻击者可
 * 上传伪装成 image/png 的 Webshell/恶意脚本（MIME 造假）→ 存储型恶意文件。
 *
 * 方案：校验文件内容前若干字节的魔数（magic number），与声明的 MIME 家族
 * 必须匹配，不匹配即拒绝。同时收紧白名单：UI 仅支持图片上传（file-upload.tsx
 * accept="image/*"），故移除纯压缩包类型（zip/rar/7z/gz/tar，无解压扫描能力）。
 * Office 文档（docx/xlsx/pptx）本质是 ZIP 容器，按 ZIP 魔数校验。
 *
 * 文本类（text/plain|csv|markdown）无魔数，校验"不含 NUL 字节"（防伪装文本的二进制）。
 */

export interface MagicRule {
  /** 声明的 MIME 家族（小写） */
  mimes: string[];
  /** 校验内容头部是否匹配 */
  match: (b: Buffer) => boolean;
}

const isZip = (b: Buffer) =>
  b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);

const MAGIC_RULES: MagicRule[] = [
  {
    mimes: ['image/jpeg'],
    match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimes: ['image/png'],
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mimes: ['image/gif'],
    match: (b) => b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    mimes: ['image/webp'],
    match: (b) =>
      b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mimes: ['application/pdf'],
    match: (b) => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-',
  },
  // Office 文档（docx/xlsx/pptx）本质是 ZIP 容器
  {
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    match: isZip,
  },
  {
    mimes: ['text/plain', 'text/csv', 'text/markdown', 'application/sql', 'text/x-sql', 'application/x-sql'],
    // 无魔数：含 NUL 字节视为二进制伪装文本
    match: (b) => !b.includes(0x00),
  },
  // 老版 Office（doc/xls/ppt）是 OLE2 复合文档，魔数 D0CF11E0A1B11AE1
  // （此前白名单收录了这三个 MIME 却没有对应规则，上传时会被判"类型不允许"）
  {
    mimes: ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'],
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
      b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1,
  },
];

/** 校验文件头部内容与声明的 MIME 家族一致；不一致抛异常（由调用方转 400） */
export function assertFileContentMatchesMime(mimetype: string, header: Buffer): void {
  const declared = String(mimetype || '').toLowerCase();
  const rule = MAGIC_RULES.find((r) => r.mimes.includes(declared));
  if (!rule) {
    throw new Error(`File type "${mimetype}" is not allowed`);
  }
  if (!rule.match(header)) {
    throw new Error(`File content does not match declared type "${mimetype}"`);
  }
}

/**
 * 允许上传的 MIME 全集 —— 唯一事实来源（2026-11-27 收敛）。
 *
 * 此前 controller 和 service 各维护一份 ALLOWED_MIME_TYPES，而这里的 MAGIC_RULES
 * 又是第三份，三者不同步就会出「白名单放行、魔数表找不到规则 → 上传被拒」的坑
 * （老版 .doc/.xls/.ppt 就这么被挡了很久）。
 *
 * 现在白名单直接由规则表派生：**要加文件类型，只在下面 MAGIC_RULES 里加一条规则**。
 */
export const ALLOWED_UPLOAD_MIMES: ReadonlySet<string> = new Set(
  MAGIC_RULES.flatMap((r) => r.mimes),
);

export function isAllowedUploadMime(mimetype: string): boolean {
  return ALLOWED_UPLOAD_MIMES.has(String(mimetype || '').toLowerCase());
}

/**
 * 文本类 MIME：下载/预览时统一转成 UTF-8 并显式声明 charset。
 * 不加 charset 时浏览器会按系统编码（中文 Windows 用 GBK）解码 UTF-8，中文即乱码。
 */
export const TEXT_LIKE_MIMES: ReadonlySet<string> = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/sql',
  'text/x-sql',
  'application/x-sql',
]);
