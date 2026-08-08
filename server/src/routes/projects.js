import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { projectRole, findProject, canView, canEdit, isOwner } from '../access.js';

const router = Router();
router.use(authRequired);

const GENRES = ['biography', 'fiction', 'prose', 'poetry', 'script', 'paper'];
const LANGUAGES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];

router.get('/', (req, res) => {
  const d = db();
  const all = d.projects.filter(p => projectRole(req, p) !== null).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size) || 20));
  const total = all.length;
  const list = all.slice((page - 1) * pageSize, page * pageSize);
  const withMeta = list.map(p => {
    const chapters = d.chapters.filter(c => c.project_id === p.id);
    const words = chapters.reduce((s, c) => s + (c.content || '').length, 0);
    const persona = p.default_persona_id ? d.personas.find(x => x.id === p.default_persona_id) : null;
    const team = (p.team_persona_ids || []).map(id => { const x = d.personas.find(pp => pp.id === id); return x ? { id: x.id, name: x.name, avatar_color: x.avatar_color } : null; }).filter(Boolean);
    const role = projectRole(req, p);
    const collaborators = (p.collaborators || []).map(c => { const u = d.users.find(uu => uu.id === c.user_id); return { user_id: c.user_id, role: c.role, display_name: u?.display_name || u?.email || '协作者', avatar_color: u?.avatar_color } }).filter(Boolean);
    return { ...p, chapter_count: chapters.length, word_count: words, default_persona: persona ? { id: persona.id, name: persona.name, avatar_color: persona.avatar_color } : null, team_personas: team, my_role: role, collaborators };
  });
  res.json({ code: 0, data: { list: withMeta, total, page, page_size: pageSize } });
});

router.post('/', (req, res) => {
  const d = db();
  const { title, genre, language, theme, target_audience, goal_word_count, default_persona_id, team_persona_ids, subtitle, author_name, cover_color, abstract, keywords, citation_style } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ code: 40001, message: '作品标题必填' });
  if (genre && !GENRES.includes(genre)) return res.status(400).json({ code: 40001, message: '不支持的体裁' });
  if (language && !LANGUAGES.includes(language)) return res.status(400).json({ code: 40001, message: '不支持的作品语言' });
  if (citation_style && !['gb7714', 'apa', 'mla'].includes(citation_style)) return res.status(400).json({ code: 40001, message: '不支持的引用格式' });
  const now = new Date().toISOString();
  const p = {
    id: uuid(),
    user_id: req.user.id,
    title: title.trim(),
    genre: genre || 'biography',
    language: language || 'zh-CN',
    theme: theme || '',
    target_audience: target_audience || '',
    goal_word_count: goal_word_count || 0,
    status: 'drafting',
    default_persona_id: default_persona_id || null,
    team_persona_ids: Array.isArray(team_persona_ids) ? team_persona_ids.filter(id => id !== (default_persona_id || null)) : [],
    subtitle: subtitle || '',
    author_name: author_name || '',
    cover_color: cover_color || '#8b7d6b',
    abstract: abstract || '',
    keywords: Array.isArray(keywords) ? keywords : (typeof keywords === 'string' && keywords.trim() ? keywords.split(/[,，;；]/).map(s => s.trim()).filter(Boolean) : []),
    citation_style: citation_style || 'gb7714',
    created_at: now,
    updated_at: now,
  };
  d.projects.push(p);
  d.stats.projects_created++;
  saveDb();
  res.json({ code: 0, data: { project: p } });
});

router.get('/:id', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const p = found.p;
  const chapters = d.chapters.filter(c => c.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
  const words = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  res.json({ code: 0, data: { project: { ...p, word_count: words, chapter_count: chapters.length, my_role: found.role }, chapters } });
});

router.patch('/:id', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!canEdit(req, found.p)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const p = found.p;
  for (const k of ['title', 'subtitle', 'author_name', 'genre', 'language', 'theme', 'target_audience', 'goal_word_count', 'status', 'default_persona_id', 'cover_color', 'abstract', 'citation_style']) {
    if (req.body[k] !== undefined) p[k] = req.body[k];
  }
  if (req.body.keywords !== undefined) {
    p.keywords = Array.isArray(req.body.keywords) ? req.body.keywords : String(req.body.keywords).split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
  }
  if (req.body.language !== undefined && !LANGUAGES.includes(req.body.language)) {
    return res.status(400).json({ code: 40001, message: '不支持的作品语言' });
  }
  if (Array.isArray(req.body.team_persona_ids)) {
    p.team_persona_ids = req.body.team_persona_ids.filter(id => id !== (p.default_persona_id || null));
  }
  p.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { project: p } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!isOwner(req, found.p)) return res.status(403).json({ code: 40301, message: '只有创建者可以删除作品' });
  const p = found.p;
  const chapterIds = d.chapters.filter(c => c.project_id === p.id).map(c => c.id);
  const convIds = d.conversations.filter(c => c.project_id === p.id).map(c => c.id);
  const snapshot = {
    project: p,
    chapters: d.chapters.filter(c => c.project_id === p.id),
    snapshots: d.snapshots.filter(s => chapterIds.includes(s.chapter_id)),
    conversations: d.conversations.filter(c => c.project_id === p.id),
    messages: d.messages.filter(m => convIds.includes(m.conversation_id)),
    outline_nodes: d.outline_nodes.filter(n => n.project_id === p.id),
    character_cards: d.character_cards.filter(c => c.project_id === p.id),
    timeline_events: d.timeline_events.filter(t => t.project_id === p.id),
    idea_notes: d.idea_notes.filter(i => i.project_id === p.id),
  };
  d.projects = d.projects.filter(x => x.id !== p.id);
  d.chapters = d.chapters.filter(c => c.project_id !== p.id);
  d.snapshots = d.snapshots.filter(s => !chapterIds.includes(s.chapter_id));
  d.conversations = d.conversations.filter(c => c.project_id !== p.id);
  d.messages = d.messages.filter(m => !convIds.includes(m.conversation_id));
  d.outline_nodes = d.outline_nodes.filter(n => n.project_id !== p.id);
  d.character_cards = d.character_cards.filter(c => c.project_id !== p.id);
  d.timeline_events = d.timeline_events.filter(t => t.project_id !== p.id);
  d.idea_notes = d.idea_notes.filter(i => i.project_id !== p.id);
  d.trash.push({ id: p.id, kind: 'project', deleted_at: new Date().toISOString(), data: snapshot });
  saveDb();
  res.json({ code: 0, data: { ok: true, undo_until: Date.now() + 30000 } });
});

// ---------- 团队协作 ----------
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// 生成/刷新邀请码（仅 owner）
router.post('/:id/invite', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!isOwner(req, found.p)) return res.status(403).json({ code: 40301, message: '只有创建者可以邀请协作者' });
  const code = genCode();
  found.p.invite_code = code;
  found.p.invite_expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  found.p.invite_role = ['editor', 'viewer'].includes(req.body?.role) ? req.body.role : 'editor';
  found.p.invite_note = req.body?.note || '';
  d.projects = d.projects.map(x => x.id === found.p.id ? found.p : x);
  saveDb();
  res.json({ code: 0, data: { code, role: found.p.invite_role, expires: found.p.invite_expires, note: found.p.invite_note } });
});

// 查看当前邀请码（owner / editor）
router.get('/:id/invite', (req, res) => {
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!canEdit(req, found.p)) return res.status(403).json({ code: 40301, message: '没有权限查看邀请' });
  if (!found.p.invite_code) return res.json({ code: 0, data: { active: false } });
  const expired = new Date(found.p.invite_expires || 0) < new Date();
  res.json({ code: 0, data: { active: !expired, code: found.p.invite_code, role: found.p.invite_role, expires: found.p.invite_expires, note: found.p.invite_note } });
});

// 使用邀请码加入协作
router.post('/join', (req, res) => {
  const d = db();
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ code: 40001, message: '请输入邀请码' });
  const p = d.projects.find(x => (x.invite_code || '').toUpperCase() === String(code).trim().toUpperCase());
  if (!p) return res.status(404).json({ code: 40401, message: '邀请码无效' });
  if (new Date(p.invite_expires || 0) < new Date()) return res.status(400).json({ code: 40001, message: '邀请码已过期' });
  if (p.user_id === req.user.id) return res.status(400).json({ code: 40001, message: '这是你自己的作品' });
  const list = p.collaborators || [];
  if (list.some(c => c.user_id === req.user.id)) return res.status(400).json({ code: 40001, message: '你已是协作者' });
  p.collaborators = [...list, { user_id: req.user.id, role: p.invite_role || 'editor', invited_by: req.user.id, joined_at: new Date().toISOString() }];
  d.projects = d.projects.map(x => x.id === p.id ? p : x);
  saveDb();
  res.json({ code: 0, data: { project_id: p.id, title: p.title, role: p.invite_role || 'editor' } });
});

// 协作者列表（owner / editor）
router.get('/:id/collaborators', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!canEdit(req, found.p)) return res.status(403).json({ code: 40301, message: '没有权限查看协作者' });
  const list = (found.p.collaborators || []).map(c => {
    const u = d.users.find(uu => uu.id === c.user_id);
    return { user_id: c.user_id, role: c.role, display_name: u?.display_name || u?.email || '协作者', email: u?.email || '', joined_at: c.joined_at };
  });
  res.json({ code: 0, data: { list, my_role: projectRole(req, found.p) } });
});

// 修改协作者角色 / 移除（仅 owner）
router.patch('/:id/collaborators/:uid', (req, res) => {
  const d = db();
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!isOwner(req, found.p)) return res.status(403).json({ code: 40301, message: '只有创建者可以管理协作者' });
  const list = found.p.collaborators || [];
  const idx = list.findIndex(c => c.user_id === req.params.uid);
  if (idx < 0) return res.status(404).json({ code: 40401, message: '协作者不存在' });
  if (req.body?.role) {
    if (!['editor', 'viewer'].includes(req.body.role)) return res.status(400).json({ code: 40001, message: '不支持的协作角色' });
    list[idx].role = req.body.role;
  }
  if (req.body?.remove) {
    found.p.collaborators = list.filter(c => c.user_id !== req.params.uid);
  }
  d.projects = d.projects.map(x => x.id === found.p.id ? found.p : x);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
