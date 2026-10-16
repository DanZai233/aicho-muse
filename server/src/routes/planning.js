import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { canView, canEdit } from '../access.js';
import { callLLM } from '../ai.js';
import { writingContext, EDITOR_RULES } from '../writing/genres.js';
import { notifyChapterSaved } from '../realtime/rooms.js';

const text = (value, max = 12000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function parseOutlinePlan(raw) {
  const match = String(raw).match(/\[[\s\S]*\]/);
  if (!match) throw new Error('大纲格式不完整，请重新生成；已有内容未修改');
  const list = JSON.parse(match[0]);
  if (!Array.isArray(list) || !list.length || list.length > 24) throw new Error('请生成 1–24 章大纲');
  return list.map(n => {
    const title = text(n?.title, 160), summary = text(n?.summary);
    if (!title || !summary) throw new Error('大纲缺少标题或详细写作说明，请重新生成');
    return { title, summary };
  });
}

export function createPlanningRouter(generate = callLLM) {
  const router = Router();
  router.use(authRequired);
  function project(req, res, id) {
    const p = db().projects.find(x => x.id === id);
    if (!p || !canView(req, p)) { res.status(404).json({ code: 40401, message: '作品不存在' }); return null; }
    if (!canEdit(req, p)) { res.status(403).json({ code: 40301, message: '没有编辑权限' }); return null; }
    return p;
  }
  function node(req, res) {
    const n = db().outline_nodes.find(x => x.id === req.params.id);
    if (!n) { res.status(404).json({ code: 40401, message: '大纲节点不存在，请刷新列表' }); return null; }
    const p = project(req, res, n.project_id);
    return p ? { n, p } : null;
  }
  router.post('/projects/:pid/outline-plan', async (req, res) => {
    const p = project(req, res, req.params.pid); if (!p) return;
    const b = req.body || {};
    const brief = { purpose: text(b.purpose, 3000), audience: text(b.audience, 1000), style: text(b.style, 1500), coverage: text(b.coverage, 4000), constraints: text(b.constraints, 2000) };
    if (!brief.purpose || !brief.audience || !brief.style) return res.status(400).json({ code: 40001, message: '先告诉我写作目标、读者和想要的口吻，再生成大纲' });
    const count = Math.max(3, Math.min(20, Number(b.chapter_count) || 10));
    const existing = db().outline_nodes.filter(x => x.project_id === p.id).slice(0, 24).map(x => ({ title: x.title, summary: x.summary }));
    try {
      const result = await generate([
        { role: 'system', content: EDITOR_RULES + '\n你是图书策划编辑。根据已确认的写作意图设计一份可以直接指导正文写作的详细大纲。只输出 JSON 数组 [{"title":"章节标题","summary":"详细说明，使用换行分段"}]。每章 summary 约 180–350 字，包含本章目标、3–5 个小节和展开要点、具体场景/例子、可执行清单或读者收获、与下章衔接。非虚构不虚构事实或来源；故事类则写场景、人物动机与情节推进。生活指南每章加低精力/低预算备选方案。遵循用户的语言、口吻、覆盖范围和禁区。' },
        { role: 'user', content: writingContext(p) + '\n已确认的写作意图：' + JSON.stringify(brief) + '\n请规划 ' + count + ' 章。现有大纲仅供参考，不自动覆盖：' + JSON.stringify(existing) },
      ], { max_tokens: 12000, temperature: 0.7 });
      const nodes = parseOutlinePlan(result);
      res.json({ code: 0, data: { nodes, plan_id: uuid(), brief } });
    } catch (e) { res.status(502).json({ code: 50201, message: e.message || '生成失败，请重试' }); }
  });
  router.post('/projects/:pid/outline-plan/adopt', (req, res) => {
    const p = project(req, res, req.params.pid); if (!p) return;
    const planId = text(req.body?.plan_id, 100);
    if (!planId) return res.status(400).json({ code: 40001, message: '缺少大纲草稿标识，请重新生成' });
    try {
      const nodes = parseOutlinePlan(JSON.stringify(req.body.nodes));
      const d = db(), old = d.outline_nodes.filter(x => x.project_id === p.id);
      const adopted = old.filter(x => x.source_plan_id === planId);
      if (adopted.length) return res.json({ code: 0, data: { nodes: adopted, duplicate: true } });
      let order = Math.max(-1, ...old.map(x => x.order_index || 0));
      const now = new Date().toISOString();
      const created = nodes.map(n => ({ ...n, id: uuid(), project_id: p.id, chapter_id: null, parent_id: null, order_index: ++order, source_plan_id: planId, created_at: now, updated_at: now }));
      d.outline_nodes.push(...created);
      p.writing_brief = { purpose: text(req.body.brief?.purpose, 3000), audience: text(req.body.brief?.audience, 1000), style: text(req.body.brief?.style, 1500), coverage: text(req.body.brief?.coverage, 4000), constraints: text(req.body.brief?.constraints, 2000) };
      p.updated_at = now; saveDb();
      res.json({ code: 0, data: { nodes: created } });
    } catch (e) { res.status(400).json({ code: 40001, message: e.message }); }
  });
  router.post('/outline/:id/draft', async (req, res) => {
    const found = node(req, res); if (!found) return;
    const { n, p } = found;
    const source = { title: n.title, summary: n.summary };
    const words = Math.max(300, Math.min(4000, Number(req.body?.word_count) || 1200));
    const outline = db().outline_nodes.filter(x => x.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
    const index = outline.findIndex(x => x.id === n.id);
    const previous = index > 0 ? outline[index - 1] : null;
    const previousChapter = previous?.chapter_id ? db().chapters.find(c => c.id === previous.chapter_id && c.project_id === p.id) : null;
    const characters = db().character_cards.filter(c => c.project_id === p.id).slice(0, 12).map(c => ({ name: c.name, role: c.role, description: c.description, arc: c.arc }));
    try {
      const result = await generate([
        { role: 'system', content: EDITOR_RULES + '\n你是文学与非虚构写作助手。只写所选大纲章节的正文，严格落实本章要点、语言、口吻与禁区，保持章节之间连贯。不要输出策划说明、提问、写作稿标签或下章正文。可以使用小标题、清单和例子，但不得照搬其他作品。生活指南兼顾温柔幽默与实用性，每节给出低精力可做的小步骤；叙事作品则写具体场景，避免把大纲直接扩成提要。' },
        { role: 'user', content: writingContext(p) + '\n写作约定：' + JSON.stringify(p.writing_brief || {}) + '\n全书目录：' + JSON.stringify(outline.map(x => ({ title: x.title, summary: (x.summary || '').slice(0, 500) }))) + '\n人物设定：' + JSON.stringify(characters) + '\n前章结尾：' + (previousChapter?.content || '').slice(-2000) + '\n本章：' + JSON.stringify(source) + '\n目标约 ' + words + ' 字。额外要求：' + text(req.body?.instructions, 3000) },
      ], { max_tokens: Math.min(12000, words * 3), temperature: 0.75 });
      if (!text(result, 50000)) throw new Error('AI 未返回正文，请重试');
      res.json({ code: 0, data: { content: text(result, 50000), source, draft_id: uuid() } });
    } catch (e) { res.status(502).json({ code: 50201, message: e.message || '正文生成失败' }); }
  });
  router.post('/outline/:id/draft/adopt', (req, res) => {
    const found = node(req, res); if (!found) return;
    const { n, p } = found, b = req.body || {}, d = db();
    const draftId = text(b.draft_id, 100), content = text(b.content, 50000);
    if (!draftId || !content) return res.status(400).json({ code: 40001, message: '正文和草稿标识不能为空' });
    const existing = d.chapters.find(c => c.project_id === p.id && c.source_draft_id === draftId);
    if (existing) return res.json({ code: 0, data: { chapter: existing, duplicate: true } });
    if (b.source?.title !== n.title || b.source?.summary !== n.summary) return res.status(409).json({ code: 40901, message: '大纲已更改，请按最新大纲重新生成；当前预览已保留' });
    const now = new Date().toISOString();
    const ch = { id: uuid(), project_id: p.id, title: n.title, content, word_count: content.length, order_index: Math.max(-1, ...d.chapters.filter(c => c.project_id === p.id).map(c => c.order_index || 0)) + 1, status: 'draft', source_draft_id: draftId, source_outline_id: n.id, created_at: now, updated_at: now };
    d.chapters.push(ch);
    // Existing associated chapters are kept; the new chapter is always an independent draft.
    if (!n.chapter_id) n.chapter_id = ch.id;
    n.updated_at = now; p.updated_at = now; saveDb(); notifyChapterSaved(ch);
    res.json({ code: 0, data: { chapter: ch } });
  });
  return router;
}
export default createPlanningRouter();
