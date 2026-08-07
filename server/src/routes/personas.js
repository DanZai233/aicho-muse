import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { generateCoachReply } from '../ai.js';

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
  for (const k of ['name', 'tagline', 'background', 'personality', 'speaking_style', 'values', 'relationship', 'expertise', 'greeting', 'avatar_color', 'is_public']) {
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

export default router;
