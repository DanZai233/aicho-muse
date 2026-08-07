import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { adminRequired } from '../auth.js';
import { db, saveDb, uuid, resetDb } from '../db.js';

const router = Router();
router.use(adminRequired);

// ---------- 仪表盘统计 ----------
router.get('/stats', (req, res) => {
  const d = db();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const messagesToday = d.messages.filter(m => m.created_at.startsWith(today)).length;
  const convToday = d.conversations.filter(c => c.created_at.startsWith(today)).length;
  res.json({
    code: 0,
    data: {
      users: d.users.length,
      projects: d.projects.length,
      chapters: d.chapters.length,
      conversations: d.conversations.length,
      messages: d.messages.length,
      personas: d.personas.filter(p => !p.is_preset).length + 4,
      outline_nodes: d.outline_nodes.length,
      character_cards: d.character_cards.length,
      timeline_events: d.timeline_events.length,
      idea_notes: d.idea_notes.length,
      messages_today: messagesToday,
      conversations_today: convToday,
      ai_provider: d.settings.ai.provider,
    },
  });
});

// ---------- 用户管理 ----------
router.get('/users', (req, res) => {
  const d = db();
  res.json({ code: 0, data: { list: d.users.map(u => ({ id: u.id, email: u.email, display_name: u.display_name, locale: u.locale, created_at: u.created_at })), total: d.users.length } });
});

router.patch('/users/:id', (req, res) => {
  const d = db();
  const u = d.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ code: 40401, message: '用户不存在' });
  if (req.body.display_name) u.display_name = req.body.display_name;
  if (req.body.locale) u.locale = req.body.locale;
  u.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.delete('/users/:id', (req, res) => {
  const d = db();
  const u = d.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ code: 40401, message: '用户不存在' });
  d.users = d.users.filter(x => x.id !== u.id);
  const projectIds = d.projects.filter(p => p.user_id === u.id).map(p => p.id);
  const chapterIds = d.chapters.filter(c => projectIds.includes(c.project_id)).map(c => c.id);
  const convIds = d.conversations.filter(c => c.user_id === u.id).map(c => c.id);
  d.projects = d.projects.filter(p => p.user_id !== u.id);
  d.chapters = d.chapters.filter(c => !projectIds.includes(c.project_id));
  d.snapshots = d.snapshots.filter(s => !chapterIds.includes(s.chapter_id));
  d.conversations = d.conversations.filter(c => c.user_id !== u.id);
  d.messages = d.messages.filter(m => !convIds.includes(m.conversation_id));
  d.personas = d.personas.filter(p => !p.is_preset && p.user_id !== u.id);
  d.voices = d.voices.filter(v => !v.is_preset && v.user_id !== u.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 系统设置 ----------
// UniLLM 厂商列表（供管理后台选择）
router.get('/llm-providers', async (req, res) => {
  try {
    const lib = await import(process.env.UNILLM_PATH || 'unillm-sdk');
    const providers = (lib.PROVIDERS || []).map(p => ({ id: p.id, label: p.label, needsApiKey: p.needsApiKey, defaultModels: p.defaultModels || [] }));
    res.json({ code: 0, data: { providers } });
  } catch (e) {
    res.status(500).json({ code: 50001, message: 'UniLLM 加载失败: ' + e.message });
  }
});

router.get('/settings', (req, res) => {
  const s = db().settings;
  res.json({ code: 0, data: { settings: s } });
});

router.patch('/settings', (req, res) => {
  const d = db();
  const b = req.body || {};
  for (const section of ['ai', 'quota', 'site', 'tts']) {
    if (b[section] && typeof b[section] === 'object') {
      d.settings[section] = { ...d.settings[section], ...b[section] };
    }
  }
  saveDb();
  res.json({ code: 0, data: { settings: d.settings } });
});

// ---------- 预设管理 ----------
router.get('/presets', (req, res) => {
  const d = db();
  res.json({ code: 0, data: { personas: d.personas.filter(p => p.is_preset), voices: d.voices.filter(v => v.is_preset) } });
});

router.post('/presets/personas', (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ code: 40001, message: '名称必填' });
  const now = new Date().toISOString();
  d.personas.push({ id: uuid(), user_id: null, name: b.name, tagline: b.tagline || '', background: b.background || '', personality: b.personality || [], speaking_style: b.speaking_style || {}, values: b.values || [], relationship: b.relationship || '', expertise: b.expertise || [], greeting: b.greeting || '', avatar_color: b.avatar_color || '#8b7d6b', is_preset: true, version: 1, created_at: now, updated_at: now });
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.post('/presets/voices', (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.display_name) return res.status(400).json({ code: 40001, message: '名称必填' });
  const now = new Date().toISOString();
  d.voices.push({ id: uuid(), user_id: null, display_name: b.display_name, provider: b.provider || 'system', voice_id: b.voice_id || '', params: b.params || {}, speech_notes: b.speech_notes || '', is_preset: true, created_at: now, updated_at: now });
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 管理员账号 ----------
router.get('/admins', (req, res) => {
  const d = db();
  res.json({ code: 0, data: { list: d.admin_users.map(a => ({ id: a.id, username: a.username, role: a.role })) } });
});

router.post('/admins', (req, res) => {
  const d = db();
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ code: 40001, message: '用户名和密码必填' });
  if (d.admin_users.some(a => a.username === username)) return res.status(400).json({ code: 40001, message: '用户名已存在' });
  d.admin_users.push({ id: uuid(), username, password_hash: bcrypt.hashSync(password, 10), role: role || 'admin', created_at: new Date().toISOString() });
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.delete('/admins/:id', (req, res) => {
  const d = db();
  if (req.params.id === req.user.id) return res.status(400).json({ code: 40001, message: '不能删除自己' });
  d.admin_users = d.admin_users.filter(a => a.id !== req.params.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 数据操作 ----------
router.post('/data/reset', (req, res) => {
  resetDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
