import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb } from '../db.js';

const router = Router();
router.use(authRequired);

const TRASH_TTL_MS = 30000;

function purgeExpired() {
  const d = db();
  const now = Date.now();
  const before = d.trash.length;
  d.trash = d.trash.filter(t => now - new Date(t.deleted_at).getTime() < TRASH_TTL_MS);
  if (d.trash.length !== before) saveDb();
}

// 恢复 30 秒内删除的章节 / 作品
router.post('/restore', (req, res) => {
  const d = db();
  const { kind, id } = req.body || {};
  if (kind !== 'chapter' && kind !== 'project') return res.status(400).json({ code: 40001, message: '不支持的恢复类型' });
  purgeExpired();
  const idx = d.trash.findIndex(t => t.kind === kind && t.id === id);
  if (idx < 0) return res.status(404).json({ code: 40401, message: '撤销窗口已过或项目不存在' });
  const item = d.trash[idx];
  if (kind === 'chapter') {
    const ch = item.data.chapter;
    const owner = d.projects.find(p => p.id === ch.project_id && p.user_id === req.user.id);
    if (!owner) return res.status(403).json({ code: 40301, message: '无权限恢复' });
    d.chapters.push(ch);
    d.snapshots.push(...(item.data.snapshots || []));
  } else {
    const snap = item.data;
    if (snap.project.user_id !== req.user.id) return res.status(403).json({ code: 40301, message: '无权限恢复' });
    d.projects.push(snap.project);
    d.chapters.push(...(snap.chapters || []));
    d.snapshots.push(...(snap.snapshots || []));
    d.conversations.push(...(snap.conversations || []));
    d.messages.push(...(snap.messages || []));
    d.outline_nodes.push(...(snap.outline_nodes || []));
    d.character_cards.push(...(snap.character_cards || []));
    d.timeline_events.push(...(snap.timeline_events || []));
    d.idea_notes.push(...(snap.idea_notes || []));
  }
  d.trash.splice(idx, 1);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// 定时清理过期回收站
export function startTrashReaper() {
  const t = setInterval(purgeExpired, 15000);
  t.unref?.();
  return t;
}

export default router;