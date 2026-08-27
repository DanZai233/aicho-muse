import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { adminRequired } from '../auth.js';
import { db, saveDb, uuid, resetDb, persistPreset, unpersistPreset } from '../db.js';

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
      trend: (() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          days.push({
            date: day,
            messages: d.messages.filter(m => m.created_at.startsWith(day)).length,
            new_users: d.users.filter(u => u.created_at.startsWith(day)).length,
            new_projects: d.projects.filter(p => p.created_at.startsWith(day)).length,
            new_conversations: d.conversations.filter(c => c.created_at.startsWith(day)).length,
          });
        }
        return days;
      })(),
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
  const list = d.users.map(u => {
    const projectIds = d.projects.filter(p => p.user_id === u.id || (p.collaborators || []).some(c => c.user_id === u.id)).map(p => p.id);
    const convIds = d.conversations.filter(c => c.user_id === u.id).map(c => c.id);
    return {
      id: u.id, email: u.email, display_name: u.display_name, locale: u.locale, status: u.status || 'active',
      created_at: u.created_at, last_active: u.last_active_at || null,
      projects: projectIds.length,
      conversations: convIds.length,
      messages: d.messages.filter(m => convIds.includes(m.conversation_id)).length,
      memories: d.memories.filter(m => m.user_id === u.id).length,
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ code: 0, data: { list, total: list.length } });
});

router.patch('/users/:id', (req, res) => {
  const d = db();
  const u = d.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ code: 40401, message: '用户不存在' });
  if (req.body.display_name) u.display_name = req.body.display_name;
  if (req.body.locale) u.locale = req.body.locale;
  if (req.body.status === 'disabled' || req.body.status === 'active') u.status = req.body.status;
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
  d.outline_nodes = d.outline_nodes.filter(n => !projectIds.includes(n.project_id));
  d.character_cards = d.character_cards.filter(c => !projectIds.includes(c.project_id));
  d.timeline_events = d.timeline_events.filter(t => !projectIds.includes(t.project_id));
  d.idea_notes = d.idea_notes.filter(i => !projectIds.includes(i.project_id));
  d.memories = d.memories.filter(m => m.user_id !== u.id);
  d.feedback = d.feedback.filter(f => f.user_id !== u.id);
  d.reviews = d.reviews.filter(r => r.user_id !== u.id);
  d.trash = d.trash.filter(t => t.kind === 'project' ? !projectIds.includes(t.id) : !chapterIds.includes(t.id));
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
  for (const section of ['ai', 'quota', 'site', 'tts', 'stt', 'voice_clone']) {
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
  const p = { id: uuid(), user_id: null, name: b.name, tagline: b.tagline || '', background: b.background || '', personality: b.personality || [], speaking_style: b.speaking_style || {}, values: b.values || [], relationship: b.relationship || '', expertise: b.expertise || [], greeting: b.greeting || '', avatar_color: b.avatar_color || '#8b7d6b', voice_profile_id: b.voice_profile_id || null, is_preset: true, version: 1, created_at: now, updated_at: now };
  d.personas.push(p);
  persistPreset('persona', p);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.post('/presets/voices', (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.display_name) return res.status(400).json({ code: 40001, message: '名称必填' });
  const now = new Date().toISOString();
  const v = { id: uuid(), user_id: null, display_name: b.display_name, provider: b.provider || 'system', voice_id: b.voice_id || '', params: b.params || {}, speech_notes: b.speech_notes || '', is_preset: true, created_at: now, updated_at: now };
  d.voices.push(v);
  persistPreset('voice', v);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.delete('/presets/personas/:id', (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && x.is_preset);
  if (!p) return res.status(404).json({ code: 40401, message: '预设人设不存在' });
  if (String(p.id).startsWith('preset-')) return res.status(400).json({ code: 40001, message: '内置官方预设不可删除（永久落库）' });
  d.personas = d.personas.filter(x => x.id !== req.params.id);
  unpersistPreset('persona', p.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.delete('/presets/voices/:id', (req, res) => {
  const d = db();
  const v = d.voices.find(x => x.id === req.params.id && x.is_preset);
  if (!v) return res.status(404).json({ code: 40401, message: '预设音色不存在' });
  if (String(v.id).startsWith('preset-')) return res.status(400).json({ code: 40001, message: '内置官方音色不可删除（永久落库）' });
  d.voices = d.voices.filter(x => x.id !== req.params.id);
  unpersistPreset('voice', v.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// 编辑预设人设（后台创建的自定义预设可编辑，内置官方预设仅提示）
router.patch('/presets/personas/:id', (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && x.is_preset);
  if (!p) return res.status(404).json({ code: 40401, message: '预设人设不存在' });
  if (String(p.id).startsWith('preset-')) return res.status(400).json({ code: 40001, message: '内置官方预设不可编辑（如需调整请克隆为自定义预设）' });
  const b = req.body || {};
  for (const k of ['name', 'tagline', 'background', 'personality', 'speaking_style', 'values', 'relationship', 'expertise', 'greeting', 'avatar_color', 'voice_profile_id']) {
    if (b[k] !== undefined) p[k] = b[k];
  }
  p.version = (p.version || 1) + 1;
  p.updated_at = new Date().toISOString();
  persistPreset('persona', p);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// 编辑预设音色
router.patch('/presets/voices/:id', (req, res) => {
  const d = db();
  const v = d.voices.find(x => x.id === req.params.id && x.is_preset);
  if (!v) return res.status(404).json({ code: 40401, message: '预设音色不存在' });
  if (String(v.id).startsWith('preset-')) return res.status(400).json({ code: 40001, message: '内置官方音色不可编辑' });
  const b = req.body || {};
  for (const k of ['display_name', 'provider', 'voice_id', 'params', 'speech_notes']) {
    if (b[k] !== undefined) v[k] = b[k];
  }
  v.updated_at = new Date().toISOString();
  persistPreset('voice', v);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- AI 自动生成预设人设（描述 → 人设 JSON + 音色候选） ----------
// 用 LLM 根据一句话描述生成完整人设字段，同时按角色名搜索 Fish 音色广场返回候选
router.post('/presets/ai-generate', async (req, res) => {
  const { description, voice_query } = req.body || {};
  const desc = String(description || '').trim();
  if (desc.length < 2) return res.status(400).json({ code: 40001, message: '请先描述角色，例如：陆沉，光与夜之恋，万甄集团CEO血族，温柔神秘' });
  try {
    const { callLLM } = await import('../ai.js');
    const sys = [
      '你是资深游戏与二次元角色设定专家，非常熟悉乙女游戏（恋与制作人、光与夜之恋、未定事件簿、时空中的绘旅人等）、原神、崩坏星穹铁道等作品的角色人设。',
      '根据用户的角色描述，输出该角色的完整设定 JSON，严格使用以下结构（不要输出任何 JSON 之外的内容）：',
      '{"name":"角色名","tagline":"一句话标签","background":"背景故事（2-4句，含出处）","personality":["性格","标签","3-6个"],"speaking_style":{"tone":"语气总述","preferences":["说话偏好","3-5条"],"avoid":["要避免的","2-4条"]},"values":["1-3条价值观"],"relationship":"与写信人/用户的关系设定","expertise":["1-3项专长"],"greeting":"初次见面的一句话","avatar_color":"十六进制颜色，贴合角色气质"}',
      '如果描述提到具体作品角色（如陆沉），请使用该角色的真实人设；如果是原创角色，则根据描述合理创作。所有文本用简体中文。',
    ].join('\n');
    const raw = await callLLM(
      [{ role: 'system', content: sys }, { role: 'user', content: desc }],
      { temperature: 0.7, max_tokens: 1600, noFallback: true }
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 未返回有效 JSON');
    const persona = JSON.parse(m[0]);
    if (!persona.name) throw new Error('AI 未生成角色名');
    // 规范字段类型
    persona.personality = Array.isArray(persona.personality) ? persona.personality.map(String).slice(0, 6) : [];
    persona.values = Array.isArray(persona.values) ? persona.values.map(String).slice(0, 3) : [];
    persona.expertise = Array.isArray(persona.expertise) ? persona.expertise.map(String).slice(0, 3) : [];
    persona.speaking_style = persona.speaking_style && typeof persona.speaking_style === 'object' ? persona.speaking_style : {};
    if (!Array.isArray(persona.speaking_style.preferences)) persona.speaking_style.preferences = [];
    if (!Array.isArray(persona.speaking_style.avoid)) persona.speaking_style.avoid = [];
    persona.avatar_color = /^#[0-9a-fA-F]{6}$/.test(persona.avatar_color || '') ? persona.avatar_color : '#8b7d6b';

    // 按角色名搜索 Fish 音色广场（同音色搜索接口）
    const s = db().settings.tts || {};
    const fishKey = process.env.TTS_API_KEY || s.api_key || '';
    const fishBase = String(process.env.TTS_BASE_URL || s.base_url || 'https://api.fish.audio').replace(/\/+$/, '');
    const q = String(voice_query || persona.name || '').trim();
    let voices = [];
    if (fishKey && q) {
      try {
        const url = fishBase + '/model?self_only=false&page_size=10&page=1&title=' + encodeURIComponent(q);
        const r = await fetch(url, { headers: { Authorization: 'Bearer ' + fishKey }, signal: AbortSignal.timeout(30000) });
        if (r.ok) {
          const data = await r.json();
          voices = (data.items || []).filter(i => i.state === 'trained').map(i => ({
            id: i._id,
            title: i.title,
            description: i.description,
            tags: i.tags || [],
            languages: i.languages || [],
            sample_audio: i.samples?.[0]?.audio || null,
          }));
        }
      } catch { /* 音色搜索失败不阻断人设生成 */ }
    }
    res.json({ code: 0, data: { persona, voices } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: 'AI 生成失败：' + e.message });
  }
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

// ---------- 管理员修改自己的密码 ----------
router.post('/me/password', (req, res) => {
  const d = db();
  const a = d.admin_users.find(x => x.id === req.admin.id);
  if (!a) return res.status(404).json({ code: 40401, message: '管理员不存在' });
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ code: 40001, message: '旧密码和新密码必填' });
  if (!bcrypt.compareSync(old_password, a.password_hash)) return res.status(400).json({ code: 40001, message: '旧密码不正确' });
  if (String(new_password).length < 8) return res.status(400).json({ code: 40001, message: '新密码至少 8 位' });
  a.password_hash = bcrypt.hashSync(String(new_password), 10);
  a.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 用户反馈管理 ----------
router.get('/feedback', (req, res) => {
  const d = db();
  const status = String(req.query.status || '');
  let list = d.feedback.map(f => {
    const u = d.users.find(x => x.id === f.user_id);
    return { ...f, user_email: u?.email || null, user_name: u?.display_name || null };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (status) list = list.filter(f => f.status === status);
  res.json({ code: 0, data: { list, total: list.length, open_count: list.filter(f => f.status === 'open').length } });
});

router.patch('/feedback/:id', (req, res) => {
  const d = db();
  const f = d.feedback.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ code: 40401, message: '反馈不存在' });
  if (req.body.status && ['open', 'done', 'ignored'].includes(req.body.status)) f.status = req.body.status;
  if (req.body.note !== undefined) f.note = String(req.body.note || '').slice(0, 1000);
  f.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.delete('/feedback/:id', (req, res) => {
  const d = db();
  const f = d.feedback.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ code: 40401, message: '反馈不存在' });
  d.feedback = d.feedback.filter(x => x.id !== f.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// ---------- 数据操作 ----------
router.post('/data/reset', (req, res) => {
  resetDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
