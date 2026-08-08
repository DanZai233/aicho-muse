import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { canView, canEdit } from '../access.js';
import { extractText, chunkText } from '../textlib.js';

const router = Router();
router.use(authRequired);

// 大文本参考文章：允许单文件最大 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }

function withMeta(doc) {
  const chunks = (db().reference_chunks || []).filter(c => c.doc_id === doc.id);
  return { ...doc, chunk_count: chunks.length, word_count: (doc.word_count || 0), chunks: undefined };
}

// 导入参考文章（大文本自动分块，写入 reference_chunks，知识库随作品查询）
router.post('/projects/:pid/reference-docs', upload.single('file'), async (req, res) => {
  const d = db();
  const p = projectOf(req.params.pid);
  if (!p || !canEdit(req, p)) return res.status(404).json({ code: 40401, message: '作品不存在或没有编辑权限' });
  try {
    if (!req.file) return res.status(400).json({ code: 40001, message: '请选择要导入的参考文章文件' });
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.docx', '.md', '.markdown', '.txt'].includes(ext)) {
      return res.status(400).json({ code: 40001, message: '仅支持 Word（.docx）、Markdown（.md）或纯文本（.txt）文件' });
    }
    const text = await extractText(req.file);
    if (!text.trim()) return res.status(400).json({ code: 40001, message: '文件内容为空，无法导入' });
    const chunks = chunkText(text, 3000, 200);
    const now = new Date().toISOString();
    const doc = {
      id: uuid(),
      project_id: p.id,
      user_id: p.user_id,
      title: (req.body?.title || path.basename(req.file.originalname || '参考文章', ext)).trim().slice(0, 120),
      source: req.file.originalname || '',
      word_count: text.length,
      created_at: now,
      updated_at: now,
    };
    d.reference_docs.push(doc);
    for (const c of chunks) {
      d.reference_chunks.push({ id: uuid(), doc_id: doc.id, idx: c.idx, text: c.text, created_at: now });
    }
    p.updated_at = now;
    saveDb();
    res.json({ code: 0, data: { doc: withMeta(doc), chunk_count: chunks.length } });
  } catch (e) {
    console.error('[ReferenceDocs] 导入失败:', e.message);
    res.status(500).json({ code: 50001, message: '导入失败：' + e.message });
  }
});

// 作品参考文章列表（知识库）
router.get('/projects/:pid/reference-docs', (req, res) => {
  const d = db();
  const p = projectOf(req.params.pid);
  if (!p || !canView(req, p)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.reference_docs
    .filter(x => x.project_id === p.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(withMeta);
  res.json({ code: 0, data: { list, total: list.length } });
});

// 单篇参考文章元信息 + 前 3 段预览
router.get('/reference-docs/:id', (req, res) => {
  const d = db();
  const doc = d.reference_docs.find(x => x.id === req.params.id);
  if (!doc || !canView(req, projectOf(doc.project_id))) return res.status(404).json({ code: 40401, message: '参考文章不存在' });
  const chunks = d.reference_chunks.filter(c => c.doc_id === doc.id).sort((a, b) => a.idx - b.idx);
  res.json({ code: 0, data: { doc: withMeta(doc), preview: chunks.slice(0, 3).map(c => ({ idx: c.idx, text: c.text.slice(0, 400) })) } });
});

// 分页读取分块（聊天 @ 时后端按需取，不整篇进内存）
router.get('/reference-docs/:id/chunks', (req, res) => {
  const d = db();
  const doc = d.reference_docs.find(x => x.id === req.params.id);
  if (!doc || !canView(req, projectOf(doc.project_id))) return res.status(404).json({ code: 40401, message: '参考文章不存在' });
  const from = Math.max(0, Number(req.query.from) || 0);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const chunks = d.reference_chunks.filter(c => c.doc_id === doc.id).sort((a, b) => a.idx - b.idx).slice(from, from + limit);
  res.json({ code: 0, data: { chunks, from, limit, total: d.reference_chunks.filter(c => c.doc_id === doc.id).length } });
});

// 修改标题
router.patch('/reference-docs/:id', (req, res) => {
  const d = db();
  const doc = d.reference_docs.find(x => x.id === req.params.id);
  if (!doc || !canEdit(req, projectOf(doc.project_id))) return res.status(404).json({ code: 40401, message: '参考文章不存在或没有编辑权限' });
  if (req.body.title !== undefined) doc.title = String(req.body.title).trim().slice(0, 120) || doc.title;
  doc.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { doc: withMeta(doc) } });
});

// 删除参考文章（级联删除分块）
router.delete('/reference-docs/:id', (req, res) => {
  const d = db();
  const doc = d.reference_docs.find(x => x.id === req.params.id);
  if (!doc || !canEdit(req, projectOf(doc.project_id))) return res.status(404).json({ code: 40401, message: '参考文章不存在或没有编辑权限' });
  d.reference_docs = d.reference_docs.filter(x => x.id !== doc.id);
  d.reference_chunks = d.reference_chunks.filter(c => c.doc_id !== doc.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
