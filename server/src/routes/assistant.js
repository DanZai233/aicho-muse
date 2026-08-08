// 统一 AI 助手路由：问答 + 作品摘要
import { Router } from 'express';
import { authRequired } from '../auth.js';
import { askAssistant } from '../assistant/answer.js';
import { summarizeProject } from '../assistant/summarize.js';
import { listUserProjects, projectBrief } from '../assistant/context.js';
import { db } from '../db.js';

const router = Router();
router.use(authRequired);

// 知识库/作品库问答（含导航动作）
router.post('/ask', async (req, res) => {
  const { question, projectId } = req.body || {};
  if (!question || !String(question).trim()) return res.status(400).json({ code: 40001, message: '问题不能为空' });
  try {
    const result = await askAssistant({ userId: req.user.id, question: String(question).trim(), projectId: projectId || null });
    res.json({ code: 0, data: result });
  } catch (e) {
    res.status(500).json({ code: 50001, message: '助手问答失败：' + e.message });
  }
});

// 作品库 + 摘要（含生成状态）
router.get('/projects', (req, res) => {
  const d = db();
  const list = listUserProjects(req.user.id).map(p => {
    const chs = d.chapters.filter(c => c.project_id === p.id);
    return { ...projectBrief(p, chs), has_summary: !!p.summary };
  });
  res.json({ code: 0, data: { list } });
});

// 为指定作品生成/更新摘要
router.post('/projects/:id/summarize', async (req, res) => {
  const r = await summarizeProject(req.user.id, req.params.id);
  if (!r.ok) return res.status(r.reason === 'not-found' ? 404 : 502).json({ code: r.reason === 'not-found' ? 40401 : 50201, message: r.message || '摘要生成失败' });
  res.json({ code: 0, data: { brief: r.brief, generated: r.generated } });
});

export default router;
