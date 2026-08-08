// 角色关系图：读取 / AI 生成 / 应用作品人物关系
import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { callLLM } from '../ai.js';
import { canView, canEdit } from '../access.js';

const router = Router();
router.use(authRequired);

function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }
function ensureView(req, p) { return !!p && canView(req, p); }
function ensureEdit(req, p) { return !!p && canEdit(req, p); }

// 从人物卡 relationships 构建关系图数据
export function buildGraph(pid) {
  const d = db();
  const cards = d.character_cards.filter(c => c.project_id === pid);
  const nodes = cards.map(c => ({
    id: c.id,
    name: c.name || '未命名人物',
    role: c.role || '配角',
    description: c.description || '',
    arc: c.arc || '',
  }));
  const nameToId = new Map(nodes.map(n => [n.name, n.id]));
  const idToName = new Map(nodes.map(n => [n.id, n.name]));
  const edges = [];
  const seen = new Set();
  for (const c of cards) {
    for (const r of (Array.isArray(c.relationships) ? c.relationships : [])) {
      const rel = r && typeof r === 'object' ? r : { target: r };
      const targetName = String(rel.target || rel.name || '').trim();
      if (!targetName) continue;
      // target 可能是角色名（旧数据/手工）或角色 ID（apply 写入），两种都解析
      let targetId = nameToId.get(targetName);
      if (!targetId && idToName.has(targetName)) targetId = targetName;
      if (!targetId || targetId === c.id) continue;
      const resolvedTargetName = idToName.get(targetId) || targetName;
      const type = String(rel.type || rel.label || rel.relation || '').trim() || '认识';
      const key = c.id + '|' + targetId + '|' + type;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: uuid(), source: c.id, sourceName: c.name,
        target: targetId, targetName: resolvedTargetName,
        type, note: String(rel.note || '').trim(),
      });
    }
  }
  return { nodes, edges };
}

router.get('/projects/:pid/relationship-graph', (req, res) => {
  const proj = projectOf(req.params.pid);
  if (!ensureView(req, proj)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  res.json({ code: 0, data: buildGraph(req.params.pid) });
});

// AI 生成候选关系（不落库，返回给前端确认）
router.post('/projects/:pid/relationship-graph/generate', async (req, res) => {
  const pid = req.params.pid;
  const proj = projectOf(pid);
  if (!ensureEdit(req, proj)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const d = db();
  const cards = d.character_cards.filter(c => c.project_id === pid);
  const chapters = d.chapters.filter(c => c.project_id === pid).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const outline = d.outline_nodes.filter(n => n.project_id === pid).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (!cards.length) return res.status(400).json({ code: 40001, message: '请先添加至少一位角色' });
  const charCtx = cards.slice(0, 20).map(c => {
    const rels = (Array.isArray(c.relationships) ? c.relationships : []).map(r => (r && (r.target || r.name)) || '').filter(Boolean).join('、');
    return '姓名：' + (c.name || '') + '｜角色：' + (c.role || '') + '｜设定：' + (c.description || '').slice(0, 120) + (rels ? '｜已有关系：' + rels : '');
  }).join('\n');
  const outlineCtx = outline.slice(0, 10).map((n, i) => (i + 1) + '. ' + (n.title || '') + (n.summary ? '：' + n.summary.slice(0, 80) : '')).join('\n');
  const chapterCtx = chapters.slice(0, 3).map(c => '【' + (c.title || '') + '】' + (c.content || '').slice(0, 1500)).join('\n');
  const names = cards.map(c => c.name || '未命名人物').join('、');
  const sys = '你是专业的文学角色关系分析师。根据角色设定、大纲与正文片段，梳理主要人物之间的关系网络。只输出 JSON（不要 markdown 代码块），格式：{"edges":[{"source":"角色名","target":"角色名","type":"关系类型","note":"一句话说明"}]}。source 和 target 必须严格使用给出的角色名之一；type 用简洁中文短语，如 恋人、师徒、挚友、敌对、家人、同事、对手、暗恋、恩人。生成 4-12 条关系，避免重复与琐碎关系。';
  const user = '作品：《' + (proj?.title || '') + '》主题：' + (proj?.theme || '未设置') + '\n可选角色名：' + names + '\n【角色设定】\n' + charCtx + '\n【大纲】\n' + (outlineCtx || '（暂无）') + '\n【正文片段】\n' + (chapterCtx || '（暂无）');
  try {
    const text = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1600, temperature: 0.7 });
    if (!text) return res.status(500).json({ code: 50001, message: 'AI 未返回结果' });
    let parsed = null;
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fallthrough */ } }
    const arr = (parsed && Array.isArray(parsed.edges) ? parsed.edges : []);
    const nameSet = new Set(cards.map(c => c.name || ''));
    const edges = arr.filter(e => e && nameSet.has(String(e.source || '')) && nameSet.has(String(e.target || '')) && String(e.source) !== String(e.target))
      .slice(0, 20)
      .map(e => ({ source: String(e.source), target: String(e.target), type: String(e.type || '认识').trim() || '认识', note: String(e.note || '').trim() }));
    if (!edges.length) return res.status(500).json({ code: 50001, message: 'AI 未能生成有效关系，请重试或先补充人物设定' });
    res.json({ code: 0, data: { edges } });
  } catch (e) { res.status(500).json({ code: 50001, message: e.message }); }
});

// 应用关系：写入人物卡 relationships（双向），重复自动跳过
router.post('/projects/:pid/relationship-graph/apply', (req, res) => {
  const pid = req.params.pid;
  const proj = projectOf(pid);
  if (!ensureEdit(req, proj)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const d = db();
  const cards = d.character_cards.filter(c => c.project_id === pid);
  const nameToId = new Map(cards.map(c => [c.name || '', c.id]));
  const reqEdges = Array.isArray(req.body?.edges) ? req.body.edges : [];
  let applied = 0;
  for (const e of reqEdges) {
    const sourceId = nameToId.get(String(e.source || ''));
    const targetId = nameToId.get(String(e.target || ''));
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const type = String(e.type || '认识').trim() || '认识';
    const note = String(e.note || '').trim();
    const pairs = [[sourceId, targetId, String(e.target)], [targetId, sourceId, String(e.source)]];
    for (const [fromId, toId, toName] of pairs) {
      const card = d.character_cards.find(x => x.id === fromId);
      if (!card) continue;
      const rels = Array.isArray(card.relationships) ? card.relationships : [];
      const dup = rels.some(r => (r && (r.target === toId || r.target === toName || r.name === toName)) && String(r.type || r.label || r.relation || '认识') === type);
      if (dup) continue;
      card.relationships = [...rels, { target: toId, type, note }];
      card.updated_at = new Date().toISOString();
      applied++;
    }
  }
  saveDb();
  res.json({ code: 0, data: { ok: true, applied, graph: buildGraph(pid) } });
});

export default router;
