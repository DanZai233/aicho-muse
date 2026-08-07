import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

import { projectRole, canView, canEdit } from '../access.js';

function ensureView(req, p) { return !!p && canView(req, p); }
function ensureEdit(req, p) { return !!p && canEdit(req, p); }

// ---------- 大纲节点 ----------
router.get('/projects/:pid/outline', (req, res) => {
  const d = db();
  if (!ensureView(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.outline_nodes.filter(n => n.project_id === req.params.pid).sort((a, b) => a.order_index - b.order_index);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/projects/:pid/outline', (req, res) => {
  const d = db();
  if (!ensureEdit(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const b = req.body || {};
  const maxOrder = d.outline_nodes.filter(n => n.project_id === req.params.pid).reduce((m, n) => Math.max(m, n.order_index), -1);
  const now = new Date().toISOString();
  const node = {
    id: uuid(), project_id: req.params.pid, parent_id: b.parent_id || null,
    title: b.title || '未命名节点', summary: b.summary || '', order_index: b.order_index ?? maxOrder + 1,
    chapter_id: b.chapter_id || null, created_at: now, updated_at: now,
  };
  d.outline_nodes.push(node);
  saveDb();
  res.json({ code: 0, data: { node } });
});

router.patch('/outline/:id', (req, res) => {
  const d = db();
  const n = d.outline_nodes.find(x => x.id === req.params.id);
  if (!n || !ensureView(req, projectOf(n.project_id))) return res.status(404).json({ code: 40401, message: '大纲节点不存在' });
  if (!ensureEdit(req, projectOf(n.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  for (const k of ['title', 'summary', 'parent_id', 'order_index', 'chapter_id']) {
    if (req.body[k] !== undefined) n[k] = req.body[k];
  }
  n.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { node: n } });
});

router.delete('/outline/:id', (req, res) => {
  const d = db();
  const n = d.outline_nodes.find(x => x.id === req.params.id);
  if (!n || !ensureView(req, projectOf(n.project_id))) return res.status(404).json({ code: 40401, message: '大纲节点不存在' });
  if (!ensureEdit(req, projectOf(n.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  d.outline_nodes = d.outline_nodes.filter(x => x.id !== n.id && x.parent_id !== n.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 人物卡 ----------
router.get('/projects/:pid/characters', (req, res) => {
  const d = db();
  if (!ensureView(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.character_cards.filter(c => c.project_id === req.params.pid);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/projects/:pid/characters', (req, res) => {
  const d = db();
  if (!ensureEdit(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const b = req.body || {};
  const now = new Date().toISOString();
  const card = {
    id: uuid(), project_id: req.params.pid, name: b.name || '未命名人物', role: b.role || '配角',
    description: b.description || '', arc: b.arc || '', relationships: b.relationships || [], created_at: now, updated_at: now,
  };
  d.character_cards.push(card);
  saveDb();
  res.json({ code: 0, data: { card } });
});

router.patch('/characters/:id', (req, res) => {
  const d = db();
  const c = d.character_cards.find(x => x.id === req.params.id);
  if (!c || !ensureView(req, projectOf(c.project_id))) return res.status(404).json({ code: 40401, message: '人物卡不存在' });
  if (!ensureEdit(req, projectOf(c.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  for (const k of ['name', 'role', 'description', 'arc', 'relationships']) {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  }
  c.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { card: c } });
});

router.delete('/characters/:id', (req, res) => {
  const d = db();
  const c = d.character_cards.find(x => x.id === req.params.id);
  if (!c || !ensureView(req, projectOf(c.project_id))) return res.status(404).json({ code: 40401, message: '人物卡不存在' });
  if (!ensureEdit(req, projectOf(c.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  d.character_cards = d.character_cards.filter(x => x.id !== c.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 时间线 ----------
router.get('/projects/:pid/timeline', (req, res) => {
  const d = db();
  if (!ensureView(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.timeline_events.filter(t => t.project_id === req.params.pid).sort((a, b) => (a.when || '').localeCompare(b.when || ''));
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/projects/:pid/timeline', (req, res) => {
  const d = db();
  if (!ensureEdit(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const b = req.body || {};
  const now = new Date().toISOString();
  const evt = {
    id: uuid(), project_id: req.params.pid, when: b.when || '', event: b.event || '',
    importance: b.importance ?? 3, linked_chapters: b.linked_chapters || [], created_at: now, updated_at: now,
  };
  d.timeline_events.push(evt);
  saveDb();
  res.json({ code: 0, data: { event: evt } });
});

router.patch('/timeline/:id', (req, res) => {
  const d = db();
  const t = d.timeline_events.find(x => x.id === req.params.id);
  if (!t || !ensureView(req, projectOf(t.project_id))) return res.status(404).json({ code: 40401, message: '时间线事件不存在' });
  if (!ensureEdit(req, projectOf(t.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  for (const k of ['when', 'event', 'importance', 'linked_chapters']) {
    if (req.body[k] !== undefined) t[k] = req.body[k];
  }
  t.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { event: t } });
});

router.delete('/timeline/:id', (req, res) => {
  const d = db();
  const t = d.timeline_events.find(x => x.id === req.params.id);
  if (!t || !ensureView(req, projectOf(t.project_id))) return res.status(404).json({ code: 40401, message: '时间线事件不存在' });
  if (!ensureEdit(req, projectOf(t.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  d.timeline_events = d.timeline_events.filter(x => x.id !== t.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 灵感碎片 ----------
router.get('/projects/:pid/ideas', (req, res) => {
  const d = db();
  if (!ensureView(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.idea_notes.filter(i => i.project_id === req.params.pid).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/projects/:pid/ideas', (req, res) => {
  const d = db();
  if (!ensureEdit(req, projectOf(req.params.pid))) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const b = req.body || {};
  const now = new Date().toISOString();
  const note = {
    id: uuid(), project_id: req.params.pid, content: b.content || '', tags: b.tags || [],
    source: b.source || 'text', created_at: now,
  };
  d.idea_notes.push(note);
  saveDb();
  res.json({ code: 0, data: { note } });
});

router.patch('/ideas/:id', (req, res) => {
  const d = db();
  const i = d.idea_notes.find(x => x.id === req.params.id);
  if (!i || !ensureView(req, projectOf(i.project_id))) return res.status(404).json({ code: 40401, message: '灵感不存在' });
  if (!ensureEdit(req, projectOf(i.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  if (req.body.content !== undefined) i.content = req.body.content;
  if (req.body.tags !== undefined) i.tags = req.body.tags;
  saveDb();
  res.json({ code: 0, data: { note: i } });
});

router.delete('/ideas/:id', (req, res) => {
  const d = db();
  const i = d.idea_notes.find(x => x.id === req.params.id);
  if (!i || !ensureView(req, projectOf(i.project_id))) return res.status(404).json({ code: 40401, message: '灵感不存在' });
  if (!ensureEdit(req, projectOf(i.project_id))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  d.idea_notes = d.idea_notes.filter(x => x.id !== i.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
