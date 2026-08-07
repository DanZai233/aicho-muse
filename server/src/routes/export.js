import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authRequired);

function mdEscape(s = '') {
  return s.replace(/\r\n/g, '\n').trim();
}

router.get('/projects/:id/markdown', (req, res) => {
  const d = db();
  const p = d.projects.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!p) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const chapters = d.chapters.filter(c => c.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
  const parts = [];
  parts.push(`# ${p.title}\n`);
  parts.push(`> 体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}\n`);
  if (p.target_audience) parts.push(`> 目标读者：${p.target_audience}\n`);
  parts.push('');
  for (const ch of chapters) {
    parts.push(`## ${ch.title}\n`);
    if (ch.content) parts.push(mdEscape(ch.content));
    parts.push('');
  }
  const md = parts.join('\n');
  const filename = `${p.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(md);
});

export default router;
