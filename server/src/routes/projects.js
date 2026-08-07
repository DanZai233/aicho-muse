import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

const GENRES = ['biography', 'fiction', 'prose', 'poetry', 'script'];

router.get('/', (req, res) => {
  const d = db();
  const list = d.projects.filter(p => p.user_id === req.user.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const withMeta = list.map(p => {
    const chapters = d.chapters.filter(c => c.project_id === p.id);
    const words = chapters.reduce((s, c) => s + (c.content || '').length, 0);
    const persona = p.default_persona_id ? d.personas.find(x => x.id === p.default_persona_id) : null;
    return { ...p, chapter_count: chapters.length, word_count: words, default_persona: persona ? { id: persona.id, name: persona.name, avatar_color: persona.avatar_color } : null };
  });
  res.json({ code: 0, data: { list: withMeta, total: withMeta.length } });
});

router.post('/', (req, res) => {
  const d = db();
  const { title, genre, theme, target_audience, goal_word_count, default_persona_id, subtitle, author_name, cover_color } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ code: 40001, message: '作品标题必填' });
  if (genre && !GENRES.includes(genre)) return res.status(400).json({ code: 40001, message: '不支持的体裁' });
  const now = new Date().toISOString();
  const p = {
    id: uuid(),
    user_id: req.user.id,
    title: title.trim(),
    genre: genre || 'biography',
    theme: theme || '',
    target_audience: target_audience || '',
    goal_word_count: goal_word_count || 0,
    status: 'drafting',
    default_persona_id: default_persona_id || null,
    subtitle: subtitle || '',
    author_name: author_name || '',
    cover_color: cover_color || '#8b7d6b',
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
  const p = d.projects.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const chapters = d.chapters.filter(c => c.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
  const words = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  res.json({ code: 0, data: { project: { ...p, word_count: words, chapter_count: chapters.length }, chapters } });
});

router.patch('/:id', (req, res) => {
  const d = db();
  const p = d.projects.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '作品不存在' });
  for (const k of ['title', 'subtitle', 'author_name', 'genre', 'theme', 'target_audience', 'goal_word_count', 'status', 'default_persona_id', 'cover_color']) {
    if (req.body[k] !== undefined) p[k] = req.body[k];
  }
  p.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { project: p } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const p = d.projects.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '作品不存在' });
  d.projects = d.projects.filter(x => x.id !== p.id);
  const chapterIds = d.chapters.filter(c => c.project_id === p.id).map(c => c.id);
  d.chapters = d.chapters.filter(c => c.project_id !== p.id);
  d.snapshots = d.snapshots.filter(s => !chapterIds.includes(s.chapter_id));
  const convIds = d.conversations.filter(c => c.project_id === p.id).map(c => c.id);
  d.conversations = d.conversations.filter(c => c.project_id !== p.id);
  d.messages = d.messages.filter(m => !convIds.includes(m.conversation_id));
  d.outline_nodes = d.outline_nodes.filter(n => n.project_id !== p.id);
  d.character_cards = d.character_cards.filter(c => c.project_id !== p.id);
  d.timeline_events = d.timeline_events.filter(t => t.project_id !== p.id);
  d.idea_notes = d.idea_notes.filter(i => i.project_id !== p.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
