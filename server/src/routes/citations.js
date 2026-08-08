import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { projectRole, canView, canEdit } from '../access.js';

const router = Router();
router.use(authRequired);

function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }
function ensureView(req, p) { return !!p && canView(req, p); }
function ensureEdit(req, p) { return !!p && canEdit(req, p); }

// 参考文献 / 引用管理（论文模式专用）
router.get('/projects/:pid/citations', (req, res) => {
  const d = db();
  if (!ensureView(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.citations.filter(c => c.project_id === req.params.pid).sort((a, b) => a.order_index - b.order_index);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/projects/:pid/citations', (req, res) => {
  const d = db();
  const p = projectOf(req.params.pid);
  if (!ensureEdit(req, p)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const b = req.body || {};
  const maxOrder = d.citations.filter(c => c.project_id === req.params.pid).reduce((m, c) => Math.max(m, c.order_index), -1);
  const now = new Date().toISOString();
  const citation = {
    id: uuid(),
    project_id: req.params.pid,
    key: b.key || null,
    raw: b.raw || '',
    title: b.title || '',
    authors: b.authors || '',
    year: b.year || '',
    source: b.source || '',
    note: b.note || '',
    order_index: b.order_index ?? maxOrder + 1,
    created_at: now,
    updated_at: now,
  };
  d.citations.push(citation);
  if (p) p.updated_at = now;
  saveDb();
  res.json({ code: 0, data: { citation } });
});

router.patch('/citations/:id', (req, res) => {
  const d = db();
  const c = d.citations.find(x => x.id === req.params.id);
  if (!c || !ensureView(req, projectOf(c.project_id))) return res.status(404).json({ code: 40401, message: '引用不存在' });
  if (!ensureEdit(req, projectOf(c.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  for (const k of ['key', 'raw', 'title', 'authors', 'year', 'source', 'note', 'order_index']) {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  }
  c.updated_at = new Date().toISOString();
  const p = projectOf(c.project_id);
  if (p) p.updated_at = c.updated_at;
  saveDb();
  res.json({ code: 0, data: { citation: c } });
});

router.delete('/citations/:id', (req, res) => {
  const d = db();
  const c = d.citations.find(x => x.id === req.params.id);
  if (!c || !ensureView(req, projectOf(c.project_id))) return res.status(404).json({ code: 40401, message: '引用不存在' });
  if (!ensureEdit(req, projectOf(c.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  d.citations = d.citations.filter(x => x.id !== c.id);
  const p = projectOf(c.project_id);
  if (p) p.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
