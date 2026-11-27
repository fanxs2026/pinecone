import { decodeUploadFileName } from './uploads.service';

/**
 * 中文文件名乱码回归（2026-11-27）。
 *
 * busboy 用 latin1 解析 multipart filename，UTF-8 中文被拆成多个 latin1 字符后
 * 原样入库：「6岁.png」→「6å².png」。decodeUploadFileName 做 latin1→utf8 回转。
 */
describe('decodeUploadFileName', () => {
  it('还原被 latin1 拆开的中文名', () => {
    // 注意：必须用 Buffer 构造，手写 '6å².png' 会丢掉「岁」的第三个字节 \u0081（不可见控制符）
    const mojibake = Buffer.from('6岁.png', 'utf8').toString('latin1');
    expect(decodeUploadFileName(mojibake)).toBe('6岁.png');
  });

  it('中文 + 空格 + 括号也能还原', () => {
    const mojibake = Buffer.from('产品需求 (最终版).docx', 'utf8').toString('latin1');
    expect(decodeUploadFileName(mojibake)).toBe('产品需求 (最终版).docx');
  });

  it('纯 ASCII 原样返回', () => {
    expect(decodeUploadFileName('qa-test.txt')).toBe('qa-test.txt');
    expect(decodeUploadFileName('Pinecone-green.png')).toBe('Pinecone-green.png');
  });

  it('本来就正确的 UTF-8 名字不会被二次破坏', () => {
    // café 的 é 是单字节 0xE9，按 latin1 回转会得到非法 UTF-8（U+FFFD）→ 应保持原样
    expect(decodeUploadFileName('café.png')).toBe('café.png');
    expect(decodeUploadFileName('6岁.png')).toBe('6岁.png');
  });

  it('空值安全', () => {
    expect(decodeUploadFileName('')).toBe('');
  });
});
