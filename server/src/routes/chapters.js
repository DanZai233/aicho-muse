import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { projectRole, findProject, canView, canEdit } from '../access.js';

const router = Router();
router.use(authRequired);

function projectOf(ch) { return ch ? db().projects.find(p => p.id === ch.project_id) : null; }
function findChapter(req, id) {
  const ch = db().chapters.find(c => c.id === id);
  if (!ch) return null;
  const role = projectRole(req, projectOf(ch));
  return role ? { ch, role } : null;
}

router.post('/projects/:pid/chapters', (req, res) => {
  const d = db();
  const proj0 = db().projects.find(p => p.id === req.params.pid);
  if (!canView(req, proj0)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!canEdit(req, proj0)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const { title, content, order_index } = req.body || {};
  const now = new Date().toISOString();
  const maxOrder = d.chapters.filter(c => c.project_id === req.params.pid).reduce((m, c) => Math.max(m, c.order_index), -1);
  const ch = {
    id: uuid(),
    project_id: req.params.pid,
    title: title || `第 ${maxOrder + 2} 章`,
    content: content || '',
    order_index: order_index ?? maxOrder + 1,
    status: 'draft',
    word_count: (content || '').length,
    created_at: now,
    updated_at: now,
  };
  d.chapters.push(ch);
  const proj = d.projects.find(p => p.id === req.params.pid);
  if (proj) proj.updated_at = now;
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.get('/projects/:pid/chapters', (req, res) => {
  const d = db();
  const proj0 = d.projects.find(p => p.id === req.params.pid);
  if (!canView(req, proj0)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.chapters.filter(c => c.project_id === req.params.pid).sort((a, b) => a.order_index - b.order_index);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.get('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  res.json({ code: 0, data: { chapter: ch } });
});

router.patch('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const oldContent = ch.content;
  const changed = (req.body.content !== undefined && req.body.content !== oldContent);
  for (const k of ['title', 'content', 'status', 'order_index']) {
    if (req.body[k] !== undefined) ch[k] = req.body[k];
  }
  ch.word_count = (ch.content || '').length;
  ch.updated_at = new Date().toISOString();
  if (changed) {
    d.snapshots.push({
      id: uuid(),
      chapter_id: ch.id,
      content: oldContent,
      note: req.body.note || '手动编辑',
      created_at: new Date().toISOString(),
    });
    d.snapshots = d.snapshots.slice(-50);
  }
  const proj = d.projects.find(p => p.id === ch.project_id);
  if (proj) proj.updated_at = ch.updated_at;
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.get('/chapters/:id/versions', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !ownProject(req, ch.project_id)) return res.status(404).json({ code: 40401, message: '章节不存在' });
  const list = d.snapshots.filter(s => s.chapter_id === ch.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/chapters/:id/restore', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const snap = d.snapshots.find(s => s.id === req.body?.version_id);
  if (!snap || snap.chapter_id !== ch.id) return res.status(400).json({ code: 40001, message: '版本不存在' });
  d.snapshots.push({ id: uuid(), chapter_id: ch.id, content: ch.content, note: '回滚到历史版本', created_at: new Date().toISOString() });
  ch.content = snap.content;
  ch.word_count = snap.content.length;
  ch.updated_at = new Date().toISOString();
  d.snapshots = d.snapshots.slice(-50);
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.delete('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const snapshots = d.snapshots.filter(s => s.chapter_id === ch.id);
  d.chapters = d.chapters.filter(c => c.id !== ch.id);
  d.snapshots = d.snapshots.filter(s => s.chapter_id !== ch.id);
  d.trash.push({
    id: ch.id,
    kind: 'chapter',
    deleted_at: new Date().toISOString(),
    data: { chapter: ch, snapshots },
  });
  const proj = d.projects.find(p => p.id === ch.project_id);
  if (proj) proj.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true, undo_until: Date.now() + 30000 } });
});

export default router;
