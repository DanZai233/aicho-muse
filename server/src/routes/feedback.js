// 用户反馈：用户提交意见 + 联系方式，管理员后台查看/处理/删除
import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

// 提交反馈
router.post('/', (req, res) => {
  const d = db();
  const { content, contact, page } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 40001, message: '反馈内容不能为空' });
  const now = new Date().toISOString();
  const fb = {
    id: uuid(),
    user_id: req.user.id,
    contact: String(contact || '').trim().slice(0, 200),
    content: text.slice(0, 4000),
    page: String(page || '').slice(0, 200),
    status: 'open',
    created_at: now,
    updated_at: now,
  };
  d.feedback.push(fb);
  saveDb();
  res.json({ code: 0, data: { feedback: fb } });
});

// 查看自己提交过的反馈
router.get('/mine', (req, res) => {
  const d = db();
  const list = d.feedback.filter(f => f.user_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ code: 0, data: { list, total: list.length } });
});

export default router;
