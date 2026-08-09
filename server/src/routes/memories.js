import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb } from '../db.js';

const router = Router();
router.use(authRequired);

// 我的创作记忆（长期记忆，M3 简化版）
// ?project_id=xxx 只看某本书；?grouped=1 按书分组返回（用于「@记忆」接入面板）
router.get('/', (req, res) => {
  const d = db();
  const projectId = req.query.project_id ? String(req.query.project_id) : null;
  let list = (d.memories || []).filter(m => m.user_id === req.user.id);
  if (projectId) list = list.filter(m => m.project_id === projectId || (!m.project_id && m.scope === 'user'));
  list = [...list].sort((a, b) => (b.importance || 0) - (a.importance || 0));

  if (req.query.grouped === '1') {
    // 只统计/展示自己拥有的书（记忆库接入的候选）
    const projects = d.projects
      .filter(p => p.user_id === req.user.id)
      .sort((a, b) => b.updated_at?.localeCompare(a.updated_at || '') || 0)
      .map(p => ({
        id: p.id,
        title: p.title,
        genre: p.genre,
        cover_color: p.cover_color,
        memory_count: list.filter(m => m.project_id === p.id).length,
      }));
    const userLevel = list.filter(m => m.scope === 'user' || !m.project_id);
    return res.json({
      code: 0,
      data: {
        projects,
        user_memories: userLevel,
        user_memory_count: userLevel.length,
        total: list.length,
      },
    });
  }

  res.json({ code: 0, data: { list, total: list.length } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const m = (d.memories || []).find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!m) return res.status(404).json({ code: 40401, message: '记忆不存在' });
  d.memories = d.memories.filter(x => x.id !== m.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
