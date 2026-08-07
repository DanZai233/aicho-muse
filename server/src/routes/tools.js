import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { runWritingTool, consistencyCheck } from '../ai.js';

const router = Router();
router.use(authRequired);

function ownChapter(req, id) {
  const d = db();
  const ch = d.chapters.find(c => c.id === id);
  if (!ch) return null;
  const proj = d.projects.find(p => p.id === ch.project_id && p.user_id === req.user.id);
  return proj ? ch : null;
}

router.post('/rewrite', async (req, res) => {
  const { chapter_id, mode, target, instruction, content } = req.body || {};
  if (!mode || !['polish', 'expand', 'condense', 'continue', 'restyle'].includes(mode)) {
    return res.status(400).json({ code: 40001, message: '不支持的写作工具模式' });
  }
  let text = content || '';
  if (chapter_id) {
    const ch = ownChapter(req, chapter_id);
    if (!ch) return res.status(404).json({ code: 40401, message: '章节不存在' });
    if (target) {
      // 简单定位：按段落匹配
      const paras = (ch.content || '').split(/\n+/);
      const found = paras.find(p => p.includes(target.slice(0, 20)));
      text = found || ch.content;
    } else {
      text = ch.content;
    }
  }
  if (!text || !text.trim()) return res.status(400).json({ code: 40001, message: '没有可处理的文本' });
  try {
    const out = await runWritingTool(mode, text, instruction);
    // 记录工具调用
    if (chapter_id) {
      const ch = ownChapter(req, chapter_id);
      if (ch) {
        const now = new Date().toISOString();
        db().messages.push({ id: uuid(), conversation_id: null, role: 'tool', content: JSON.stringify({ mode, chapter_id }), reply_type: 'other', tool_used: mode, created_at: now });
      }
    }
    saveDb();
    res.json({ code: 0, data: out });
  } catch (e) {
    res.status(500).json({ code: 50001, message: e.message });
  }
});

// 一致性检查：人物 / 时间线 / 重复段落
router.post('/check', (req, res) => {
  const { chapter_id, content } = req.body || {};
  let text = content || '';
  if (chapter_id) {
    const ch = ownChapter(req, chapter_id);
    if (!ch) return res.status(404).json({ code: 40401, message: '章节不存在' });
    text = ch.content || '';
  }
  if (!text || !text.trim()) return res.status(400).json({ code: 40001, message: '没有可检查的文本' });
  const d = db();
  const proj = d.projects.find(p => p.id === (chapter_id ? ownChapter(req, chapter_id)?.project_id : null));
  const characters = proj ? d.character_cards.filter(c => c.project_id === proj.id) : [];
  const timeline = proj ? d.timeline_events.filter(t => t.project_id === proj.id) : [];
  res.json({ code: 0, data: { issues: consistencyCheck(text, characters, timeline) } });
});

router.post('/apply', (req, res) => {
  const { chapter_id, text } = req.body || {};
  const ch = ownChapter(req, chapter_id);
  if (!ch) return res.status(404).json({ code: 40401, message: '章节不存在' });
  const d = db();
  d.snapshots.push({ id: uuid(), chapter_id: ch.id, content: ch.content, note: '写作工具应用前', created_at: new Date().toISOString() });
  d.snapshots = d.snapshots.slice(-50);
  ch.content = text;
  ch.word_count = text.length;
  ch.updated_at = new Date().toISOString();
  const proj = d.projects.find(p => p.id === ch.project_id);
  if (proj) proj.updated_at = ch.updated_at;
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

export default router;
