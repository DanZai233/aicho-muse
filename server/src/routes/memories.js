import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb } from '../db.js';

const router = Router();
router.use(authRequired);

// 我的创作记忆（长期记忆，M3 简化版）
router.get('/', (req, res) => {
  const d = db();
  const list = (d.memories || []).filter(m => m.user_id === req.user.id)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0));
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
