// 创作内容加密：AES-256-GCM（架构文档 §8）
// 通过环境变量 DATA_ENCRYPTION_KEY 开启；未配置时明文透传（兼容现有数据）
import crypto from 'node:crypto';

export const encryptionKey = () => process.env.DATA_ENCRYPTION_KEY || '';

export function encryptText(text) {
  const key = encryptionKey();
  if (!key || !text) return text;
  try {
    const iv = crypto.randomBytes(12);
    const cip = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), iv);
    const enc = Buffer.concat([cip.update(String(text), 'utf8'), cip.final()]);
    const tag = cip.getAuthTag();
    return 'enc:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64');
  } catch (e) {
    console.error('[crypto] 加密失败（保持原文）:', e.message);
    return text;
  }
}

export function decryptText(text) {
  if (!text || typeof text !== 'string' || !text.startsWith('enc:')) return text;
  const key = encryptionKey();
  if (!key) return text;
  try {
    const [ivB64, tagB64, dataB64] = text.slice(4).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[crypto] 解密失败（返回原文）:', e.message);
    return text;
  }
}

// 全量加密/解密章节内容（在序列化前后调用）
export function encryptChapters(cache) {
  if (!encryptionKey()) return;
  for (const ch of cache.chapters || []) {
    if (ch.content && !ch.content.startsWith('enc:')) ch.content = encryptText(ch.content);
  }
  for (const s of cache.snapshots || []) {
    if (s.content && !s.content.startsWith('enc:')) s.content = encryptText(s.content);
  }
}

export function decryptChapters(cache) {
  for (const ch of cache.chapters || []) {
    if (ch.content && ch.content.startsWith('enc:')) ch.content = decryptText(ch.content);
  }
  for (const s of cache.snapshots || []) {
    if (s.content && s.content.startsWith('enc:')) s.content = decryptText(s.content);
  }
}
