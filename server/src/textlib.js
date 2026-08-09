// 文本工具：文件文本抽取 + 大文本分块（参考文章/导入共用）
import path from 'node:path';
import { TextDecoder } from 'node:util';

// 统计字符串中的 CJK 汉字数量（判断解码结果更像哪种编码）
function countCJK(str) {
  let n = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x4e00 && cp <= 0x9fff) n++;
  }
  return n;
}

// 文本编码自动识别：BOM 优先；无 BOM 时先严格 UTF-8，再按 GBK/GB18030 候选，
// 用 CJK 汉字密度判断哪个解码结果更合理（GBK 双字节序列常碰巧是合法 UTF-8，
// 仅靠 fatal 探测不可靠，必须内容启发式）。GB18030 覆盖 GBK/GB2312 全部字节。
export function decodeText(buf) {
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf.subarray(3));
  }
  // UTF-16 LE / BE BOM
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2));
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buf.subarray(2));
  }
  // 无 BOM：严格 UTF-8 探测
  let utf8 = null;
  try { utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* 非法 UTF-8 */ }
  // GB18030 候选（覆盖 GBK/GB2312 全部字节，不会抛错）
  const gbk = new TextDecoder('gb18030').decode(buf);
  if (utf8 !== null) {
    const cjkUtf8 = countCJK(utf8);
    const cjkGbk = countCJK(gbk);
    // GBK 解出明显更多汉字（≥1.8 倍且至少 3 个）→ GBK 更合理
    if (cjkGbk > cjkUtf8 * 1.8 && cjkGbk >= 3) return gbk;
    // UTF-8 解出一个汉字都没有，但 GBK 有汉字（GBK 字节碰巧是合法 UTF-8 的典型产物）→ GBK
    if (cjkUtf8 === 0 && cjkGbk > 0) return gbk;
    return utf8;
  }
  return gbk;
}

// 从上传文件抽取纯文本（docx 用 mammoth，其余按 BOM/内容启发式自动识别编码）
export async function extractText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer: file.buffer });
    return (r.value || '').replace(/\r\n/g, '\n');
  }
  return decodeText(file.buffer).replace(/^\uFEFF/, '');
}

// 大文本分块：按行累积到 size 附近切块，超长单段硬切；带 overlap 保证上下文连续
export function chunkText(text, size = 3000, overlap = 200) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  const lines = cleaned.split('\n');
  const parts = [];
  let cur = '';
  for (const line of lines) {
    const next = cur ? cur + '\n' + line : line;
    if (next.length > size && cur) {
      parts.push(cur.trim());
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  // 处理仍然超长的段落（硬切，保留 overlap）
  const final = [];
  for (const p of parts) {
    if (p.length <= size) { final.push(p); continue; }
    let s = p;
    while (s.length > size) {
      final.push(s.slice(0, size));
      s = s.slice(size - overlap);
    }
    if (s.trim()) final.push(s);
  }
  return final.map((t, i) => ({ idx: i, text: t }));
}
