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
    mimes: ['text/plain', 'text/csv', 'text/markdown'],
    // 无魔数：含 NUL 字节视为二进制伪装文本
    match: (b) => !b.includes(0x00),
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
