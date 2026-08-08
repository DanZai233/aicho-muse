import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { generateCoachReply, callLLM } from '../ai.js';
import { DATA_DIR } from '../db.js';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();
router.use(authRequired);

function visiblePersonas(req) {
  return db().personas.filter(p => p.is_preset || p.user_id === req.user.id || p.is_public);
}

router.get('/', (req, res) => {
  const scope = req.query.scope;
  let list = visiblePersonas(req);
  if (scope === 'preset') list = list.filter(p => p.is_preset);
  if (scope === 'mine') list = list.filter(p => !p.is_preset);
  if (scope === 'public') list = list.filter(p => p.is_public);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.get('/:id', (req, res) => {
  const p = db().personas.find(x => x.id === req.params.id);
  if (!p || (!p.is_preset && p.user_id !== req.user.id && !p.is_public)) return res.status(404).json({ code: 40401, message: '人设不存在' });
  res.json({ code: 0, data: { persona: p } });
});

router.post('/', (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.name || !b.name.trim()) return res.status(400).json({ code: 40001, message: '人设名称必填' });
  const now = new Date().toISOString();
  const p = {
    id: uuid(),
    user_id: req.user.id,
    name: b.name.trim(),
    tagline: b.tagline || '',
    background: b.background || '',
    personality: Array.isArray(b.personality) ? b.personality : [],
    speaking_style: b.speaking_style || { tone: '自然', preferences: [], avoid: [] },
    values: Array.isArray(b.values) ? b.values : [],
    relationship: b.relationship || '',
    expertise: Array.isArray(b.expertise) ? b.expertise : [],
    greeting: b.greeting || '',
    avatar: b.avatar || '',
    avatar_color: b.avatar_color || '#8b7d6b',
    is_preset: false,
    is_public: !!b.is_public,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  d.personas.push(p);
  saveDb();
  res.json({ code: 0, data: { persona: p } });
});

// 试聊预览：使用未保存的人设草稿生成一条回复，不入库
router.post('/preview', async (req, res) => {
  const b = req.body || {};
  const persona = b.persona && typeof b.persona === 'object' ? b.persona : null;
  const input = (b.input || '').toString().trim();
  if (!persona || !persona.name) return res.status(400).json({ code: 40001, message: '请先填写人设名称' });
  if (!input) return res.status(400).json({ code: 40001, message: '试聊内容不能为空' });
  try {
    const { reply, replyType, source } = await generateCoachReply({
      persona: { ...persona, name: persona.name, tagline: persona.tagline || '试聊中' },
      input, history: Array.isArray(b.history) ? b.history.slice(-8) : [],
      userId: req.user.id,
    });
    res.json({ code: 0, data: { reply, reply_type: replyType, source } });
  } catch (e) {
    res.status(500).json({ code: 50001, message: '生成失败：' + e.message });
  }
});

router.post('/:id/clone', (req, res) => {
  const d = db();
  const src = d.personas.find(x => x.id === req.params.id);
  if (!src || (!src.is_preset && src.user_id !== req.user.id && !src.is_public)) return res.status(404).json({ code: 40401, message: '人设不存在' });
  if (src.user_id === req.user.id && !src.is_preset) return res.status(400).json({ code: 40001, message: '这是你的人设，无需克隆' });
  const now = new Date().toISOString();
  const p = { ...JSON.parse(JSON.stringify(src)), id: uuid(), user_id: req.user.id, is_preset: false, name: `${src.name}（我的版本）`, version: 1, created_at: now, updated_at: now };
  d.personas.push(p);
  saveDb();
  res.json({ code: 0, data: { persona: p } });
});

router.patch('/:id', (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '人设不存在或为预设' });
  for (const k of ['name', 'tagline', 'background', 'personality', 'speaking_style', 'values', 'relationship', 'expertise', 'greeting', 'avatar', 'avatar_color', 'is_public']) {
    if (req.body[k] !== undefined) p[k] = req.body[k];
  }
  p.version++;
  p.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { persona: p } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '人设不存在或为预设' });
  d.personas = d.personas.filter(x => x.id !== p.id);
  d.projects.forEach(pr => { if (pr.default_persona_id === p.id) pr.default_persona_id = null; });
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});


// ---------- 头像上传（base64，存 DATA_DIR/uploads，返回内部 URL） ----------
const ALLOWED_AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
router.post('/:id/avatar', (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '人设不存在或为预设' });
  const { data, mime } = req.body || {};
  if (!data || !mime || !ALLOWED_AVATAR_MIME.includes(mime)) return res.status(400).json({ code: 40001, message: '仅支持 png/jpeg/webp/gif 图片' });
  let buf;
  try { buf = Buffer.from(String(data), 'base64'); } catch { return res.status(400).json({ code: 40001, message: '图片数据无效' }); }
  if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ code: 40001, message: '图片不能超过 2MB' });
  const uploads = path.join(DATA_DIR, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
  const filename = p.id + '-' + Date.now() + '.' + ext;
  fs.writeFileSync(path.join(uploads, filename), buf);
  if (p.avatar && p.avatar.startsWith('/uploads/')) {
    const oldFile = path.join(DATA_DIR, p.avatar.replace('/uploads/', ''));
    try { fs.unlinkSync(oldFile); } catch { /* ignore */ }
  }
  p.avatar = '/uploads/' + filename;
  p.version++;
  p.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { persona: p } });
});


// 归一化 AI 返回的人设字段（DeepSeek 偶发把数组输出成逗号/顿号字符串）
function normalizePersonaResult(r) {
  const toArr = (v) => {
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(/[,，、\n]/).map(x => x.trim()).filter(Boolean);
    return [];
  };
  const ss = r.speaking_style && typeof r.speaking_style === 'object' ? r.speaking_style : {};
  return {
    name: String(r.name || '').trim(),
    tagline: String(r.tagline || '').trim(),
    background: String(r.background || '').trim(),
    personality: toArr(r.personality),
    speaking_style: {
      tone: String(ss.tone || '').trim(),
      preferences: toArr(ss.preferences),
      avoid: toArr(ss.avoid),
      catchphrase: String(ss.catchphrase || '').trim(),
    },
    values: toArr(r.values),
    relationship: String(r.relationship || '').trim(),
    expertise: toArr(r.expertise),
    greeting: String(r.greeting || '').trim(),
    avatar_color: String(r.avatar_color || '#8b7d6b').trim(),
  };
}

// ---------- 人设 AI 辅助：生成 / 润色 ----------
function personaAIText(p) {
  return `姓名：${p.name}；一句话定位：${p.tagline || ''}；背景：${p.background || ''}；性格：${(p.personality || []).join('、')}；说话风格：${p.speaking_style?.tone || ''}（偏好：${(p.speaking_style?.preferences || []).join('、')}；避免：${(p.speaking_style?.avoid || []).join('、')}；口头禅：${p.speaking_style?.catchphrase || ''}）；价值观：${(p.values || []).join('、')}；与用户关系：${p.relationship || ''}；擅长：${(p.expertise || []).join('、')}；开场白：${p.greeting || ''}`;
}

// 生成：基于用户的创作方向，生成一份完整人设草稿（JSON 结构）
router.post('/ai/generate', async (req, res) => {
  const { prompt, name } = req.body || {};
  const userReq = String(prompt || '').trim();
  const sys = '你是专业的角色与人格设计师。根据用户的创作方向，设计一位适合陪伴创作的 AI 人设。只输出 JSON（不要 markdown 代码块），字段：name、tagline、background、personality（数组）、speaking_style（对象：tone、preferences、avoid、catchphrase）、values（数组）、relationship、expertise（数组）、greeting、avatar_color。';
  const user = '创作方向/期望：' + (userReq || '一位温柔耐心的创作伙伴') + (name ? '\n指定名称：' + name : '');
  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1000, temperature: 0.8 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    let parsed = null;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fallthrough */ } }
    if (!parsed || !parsed.name) return res.status(500).json({ code: 50001, message: 'AI 返回格式不正确' });
    res.json({ code: 0, data: { result: normalizePersonaResult(parsed) } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});

// 润色：基于当前人设内容，按用户要求改进（返回 JSON 结构，不落库）
router.post('/:id/ai/polish', async (req, res) => {
  const d = db();
  const p = d.personas.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '人设不存在或为预设' });
  const { prompt } = req.body || {};
  const userReq = String(prompt || '').trim();
  const sys = '你是专业的角色与人格设计师。根据用户对现有 AI 人设的修改要求，输出润色后的完整人设。只输出 JSON（不要 markdown 代码块），字段与输入一致：name、tagline、background、personality（数组）、speaking_style（对象：tone、preferences、avoid、catchphrase）、values（数组）、relationship、expertise（数组）、greeting、avatar_color。保持未要求变动的部分不变。';
  const user = '当前人设：' + personaAIText(p) + '\n修改要求：' + (userReq || '请整体润色，让人设更立体');
  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1000, temperature: 0.8 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    const m = text.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fallthrough */ } }
    if (!parsed || !parsed.name) return res.status(500).json({ code: 50001, message: 'AI 返回格式不正确' });
    res.json({ code: 0, data: { result: normalizePersonaResult(parsed) } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});

export default router;

