// 文本工具：文件文本抽取 + 大文本分块（参考文章/导入共用）
import path from 'node:path';

// 从上传文件抽取纯文本（docx 用 mammoth，其余按 UTF-8）
export async function extractText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer: file.buffer });
    return (r.value || '').replace(/\r\n/g, '\n');
  }
  return file.buffer.toString('utf8').replace(/^\uFEFF/, '');
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
