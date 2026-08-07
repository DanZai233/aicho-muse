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
      memories: (d.memories || []).length,
      messages_today: messagesToday,
      conversations_today: convToday,
      ai_provider: (process.env.LLM_PROVIDER || d.settings.ai.llm_provider || d.settings.ai.provider || 'none'),
      ai_model: (process.env.LLM_MODEL || d.settings.ai.llm_model || d.settings.ai.model || ''),
      reply_types: {
        question: d.messages.filter(m => m.reply_type === 'question').length,
        feedback: d.messages.filter(m => m.reply_type === 'feedback').length,
        suggestion: d.messages.filter(m => m.reply_type === 'suggestion').length,
        encouragement: d.messages.filter(m => m.reply_type === 'encouragement').length,
        other: d.messages.filter(m => m.reply_type && !['question', 'feedback', 'suggestion', 'encouragement'].includes(m.reply_type)).length,
      },
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

// 查询当前厂商的可用模型列表（OpenAI 兼容 /models；失败时回退厂商默认列表）
router.get('/ai/models', async (req, res) => {
  const d = db();
  const s = d.settings.ai;
  const provider = String(process.env.LLM_PROVIDER || s.llm_provider || s.provider || '').toLowerCase();
  const apiKey = String(process.env.LLM_API_KEY || s.llm_api_key || s.api_key || '');
  const baseUrl = String(process.env.LLM_BASE_URL || s.base_url || '').replace(/\/+$/, '');
  const COMPAT_BASES = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    kimi: 'https://api.moonshot.cn/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
    grok: 'https://api.x.ai/v1',
  };
  const base = baseUrl || COMPAT_BASES[provider] || '';
  let models = [];
  if (base && apiKey) {
    try {
      const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + apiKey }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const data = await r.json();
        models = (data.data || []).map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean);
      }
    } catch (e) { /* 端点不可达时回退到厂商默认列表 */ }
  }
  if (!models.length) {
    try {
      const lib = await import(process.env.UNILLM_PATH || 'unillm-sdk');
      const p = (lib.PROVIDERS || []).find(x => String(x.id).toLowerCase() === provider);
      models = p?.defaultModels || [];
    } catch { /* ignore */ }
  }
  const list = models.map(id => {
    const pid = String(id);
    const isFlash = /v4-flash|flash/i.test(pid);
    const isPro = /pro|thinking|reasoner/i.test(pid);
    return {
      id: pid,
      recommended: provider === 'deepseek' && isFlash,
      disabled: provider === 'deepseek' && isPro,
      note: provider === 'deepseek' && isPro ? 'pro 模型已禁用（当前仅允许 v4-flash）' : undefined,
    };
  });
  res.json({ code: 0, data: { provider, base_url: base, models: list } });
});

router.get('/settings', (req, res) => {
  const s = db().settings;
  res.json({ code: 0, data: { settings: s } });
});

router.patch('/settings', (req, res) => {
  const d = db();
  const b = req.body || {};
  for (const section of ['ai', 'quota', 'site', 'tts', 'stt']) {
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
