import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { callLLM } from '../ai.js';

const router = Router();
router.use(authRequired);

import { projectRole, canView, canEdit } from '../access.js';

function ensureView(req, p) { return !!p && canView(req, p); }
function ensureEdit(req, p) { return !!p && canEdit(req, p); }
function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }

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

// ---------- AI 辅助：大纲 / 人物卡 生成与润色 ----------
function smartContextText(pid) {
  const d = db();
  const outline = d.outline_nodes.filter(n => n.project_id === pid).sort((a, b) => a.order_index - b.order_index);
  const cards = d.character_cards.filter(c => c.project_id === pid);
  const parts = [];
  if (outline.length) parts.push('【现有大纲】' + outline.slice(0, 12).map((n, i) => (i + 1) + '. ' + (n.title || '') + (n.summary ? '：' + n.summary : '')).join('；'));
  if (cards.length) parts.push('【现有角色】' + cards.slice(0, 10).map(c => (c.name || '') + '(' + (c.role || '') + ')' + (c.description ? '：' + c.description.slice(0, 60) : '')).join('；'));
  return parts.join('\n');
}

// 生成：给定主题/提示词，生成完整内容
router.post('/:kind/:id/ai/generate', async (req, res) => {
  const { kind, id } = req.params;
  if (!['outline', 'characters'].includes(kind)) return res.status(400).json({ code: 40001, message: '不支持的 AI 辅助类型' });
  const d = db();
  let item = null, pid = null;
  if (kind === 'outline') item = d.outline_nodes.find(x => x.id === id);
  else item = d.character_cards.find(x => x.id === id);
  if (!item) return res.status(404).json({ code: 40401, message: '内容不存在' });
  pid = item.project_id;
  const proj = d.projects.find(p => p.id === pid);
  if (!ensureEdit(req, proj)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const prompt = String(req.body?.prompt || '').trim();
  const langNote = proj?.language && proj.language !== 'zh-CN' ? '作品语言：' + proj.language + '，请用该语言输出。' : '';
  const sys = kind === 'outline'
    ? '你是专业的文学策划。根据作品主题与现有大纲，生成新的大纲节点：标题 + 一句话摘要。只输出内容本身，不要解释。格式：标题：摘要。' + langNote
    : '你是专业的角色设定师。根据作品主题与现有角色，生成新的人物卡：姓名、角色定位、一句话描述。只输出内容本身，不要解释。格式：姓名（角色）：描述。' + langNote;
  const ctx = smartContextText(pid);
  const user = '作品：《' + (proj?.title || '') + '》主题：' + (proj?.theme || '未设置') + '\n' + ctx + '\n我的要求：' + (prompt || '请合理生成');
  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1000, temperature: 0.8 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    res.json({ code: 0, data: { result: text.trim() } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});

// 润色：把现有内容交给 AI 重写，返回润色结果
router.post('/:kind/:id/ai/polish', async (req, res) => {
  const { kind, id } = req.params;
  if (!['outline', 'characters'].includes(kind)) return res.status(400).json({ code: 40001, message: '不支持的 AI 辅助类型' });
  const d = db();
  let item = null;
  if (kind === 'outline') item = d.outline_nodes.find(x => x.id === id);
  else item = d.character_cards.find(x => x.id === id);
  if (!item) return res.status(404).json({ code: 40401, message: '内容不存在' });
  const proj = d.projects.find(p => p.id === item.project_id);
  if (!ensureEdit(req, proj)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const langNote = proj?.language && proj.language !== 'zh-CN' ? '作品语言：' + proj.language + '，请用该语言输出。' : '';
  const target = kind === 'outline'
    ? '大纲节点「' + (item.title || '') + '」摘要：' + (item.summary || '')
    : '人物卡「' + (item.name || '') + '」' + (item.role || '') + '：' + (item.description || '') + (item.arc ? '；成长线：' + item.arc : '');
  const sys = kind === 'outline'
    ? '你是专业的文学策划。润色这个大纲节点：让摘要更清晰、更有张力、更贴合主题。只输出润色后的摘要，不要标题与解释。' + langNote
    : '你是专业的角色设定师。润色这段人物设定：让描述更立体、更有记忆点。只输出润色后的描述，不要解释。' + langNote;
  const user = '作品：《' + (proj?.title || '') + '》主题：' + (proj?.theme || '未设置') + '\n需要润色的内容：' + target;
  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1000, temperature: 0.8 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    res.json({ code: 0, data: { result: text.trim() } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});


// ---------- AI 建议：大纲 / 人物 / 时间线 批量建议（每条可单独保留） ----------
const SUGGEST_SPEC = {
  outline: {
    sys: '你是专业的文学策划。根据作品主题与现有大纲，给出 3-4 条有价值的大纲建议：可以补充新节点、调整顺序、深化冲突或新增伏笔。每条必须包含建议内容与理由，可给出建议的标题。',
    fmt: '输出 JSON 数组，每项 {"type":"add"|"update"|"note","title":"建议标题或新节点标题","summary":"一句话内容","reason":"为什么建议这样做"}。只输出 JSON。',
  },
  characters: {
    sys: '你是专业的角色设定师。根据作品主题与现有角色，给出 3-4 条人物建议：新增配角、深化主角、制造人物冲突或补全动机。',
    fmt: '输出 JSON 数组，每项 {"type":"add"|"update"|"note","name":"建议新增或调整的角色名","role":"角色定位","description":"一句话描述","reason":"为什么建议这样做"}。只输出 JSON。',
  },
  timeline: {
    sys: '你是专业的编剧/叙事顾问。根据作品主题与现有时间线，给出 3-4 条时间线建议：新增关键事件、调整事件顺序、补充转折或强化因果。',
    fmt: '输出 JSON 数组，每项 {"type":"add"|"update"|"note","when":"时间/节点","event":"事件内容","reason":"为什么建议这样做"}。只输出 JSON。',
  },
};

router.post('/projects/:pid/ai-suggest', async (req, res) => {
  const { pid } = req.params;
  const kind = String(req.body?.kind || 'outline');
  if (!SUGGEST_SPEC[kind]) return res.status(400).json({ code: 40001, message: '不支持的 AI 建议类型' });
  const proj = db().projects.find(p => p.id === pid);
  if (!ensureEdit(req, proj)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });

  const d = db();
  const outline = d.outline_nodes.filter(n => n.project_id === pid);
  const cards = d.character_cards.filter(c => c.project_id === pid);
  const events = d.timeline_events.filter(e => e.project_id === pid);
  const ctxParts = [];
  if (outline.length) ctxParts.push('现有大纲：' + outline.slice(0, 10).map(n => n.title + (n.summary ? '：' + n.summary.slice(0, 40) : '')).join('；'));
  if (cards.length) ctxParts.push('现有角色：' + cards.slice(0, 8).map(c => c.name + '(' + (c.role || '') + ')' + (c.description ? '：' + c.description.slice(0, 40) : '')).join('；'));
  if (events.length) ctxParts.push('现有时间线：' + events.slice(0, 10).map(e => (e.when || '') + ' ' + (e.event || '')).join('；'));
  const langNote = proj?.language && proj.language !== 'zh-CN' ? '作品语言：' + proj.language + '，请用该语言输出。' : '';

  const sys = SUGGEST_SPEC[kind].sys + '\n' + SUGGEST_SPEC[kind].fmt + '\n' + langNote;
  const user = '作品：《' + (proj?.title || '') + '》主题：' + (proj?.theme || '未设置') + '\n' + (ctxParts.join('\n') || '（暂无内容，从零开始给建议）');

  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1500, temperature: 0.8 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    // 解析 JSON 数组（容错）
    let arr = [];
    const m = String(text).match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch { /* 忽略 */ } }
    if (!Array.isArray(arr) || arr.length === 0) {
      // 兜底：把文本按空行拆成建议
      arr = String(text).split(/\n{2,}/).filter(Boolean).map(x => ({ type: 'note', summary: x.trim().slice(0, 200), reason: '' }));
    }
    const cleaned = arr.filter(x => x && (x.summary || x.title || x.name || x.event)).slice(0, 5).map(x => ({ ...x, type: ['add', 'update', 'note'].includes(x.type) ? x.type : 'note' }));
    res.json({ code: 0, data: { list: cleaned } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});

export default router;
