import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid, pushChapterSnapshot, latestSnapshotOf } from '../db.js';
import { projectRole, findProject, canView, canEdit } from '../access.js';

const router = Router();
router.use(authRequired);

function projectOf(ch) { return ch ? db().projects.find(p => p.id === ch.project_id) : null; }
function findChapter(req, id) {
  const ch = db().chapters.find(c => c.id === id);
  if (!ch) return null;
  const role = projectRole(req, projectOf(ch));
  return role ? { ch, role } : null;
}

router.post('/projects/:pid/chapters', (req, res) => {
  const d = db();
  const proj0 = db().projects.find(p => p.id === req.params.pid);
  if (!canView(req, proj0)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  if (!canEdit(req, proj0)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const { title, content, order_index } = req.body || {};
  const now = new Date().toISOString();
  const maxOrder = d.chapters.filter(c => c.project_id === req.params.pid).reduce((m, c) => Math.max(m, c.order_index), -1);
  const ch = {
    id: uuid(),
    project_id: req.params.pid,
    title: title || `第 ${maxOrder + 2} 章`,
    content: content || '',
    order_index: order_index ?? maxOrder + 1,
    status: 'draft',
    word_count: (content || '').length,
    created_at: now,
    updated_at: now,
  };
  d.chapters.push(ch);
  const proj = d.projects.find(p => p.id === req.params.pid);
  if (proj) proj.updated_at = now;
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.get('/projects/:pid/chapters', (req, res) => {
  const d = db();
  const proj0 = d.projects.find(p => p.id === req.params.pid);
  if (!canView(req, proj0)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const list = d.chapters.filter(c => c.project_id === req.params.pid).sort((a, b) => a.order_index - b.order_index);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.get('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  res.json({ code: 0, data: { chapter: ch } });
});

router.patch('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const oldContent = ch.content;
  const changed = (req.body.content !== undefined && req.body.content !== oldContent);
  for (const k of ['title', 'content', 'status', 'order_index']) {
    if (req.body[k] !== undefined) ch[k] = req.body[k];
  }
  ch.word_count = (ch.content || '').length;
  ch.updated_at = new Date().toISOString();
  if (changed) {
    pushChapterSnapshot(d, ch.id, oldContent, req.body.note || '手动编辑');
  }
  const proj = d.projects.find(p => p.id === ch.project_id);
  if (proj) proj.updated_at = ch.updated_at;
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.get('/chapters/:id/versions', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  const list = d.snapshots.filter(s => s.chapter_id === ch.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ code: 0, data: { list, total: list.length } });
});

// 手动保存历史版本：保存前校验与最新版本是否有差异，无差异则不保存
router.post('/chapters/:id/save-version', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const latest = latestSnapshotOf(d, ch.id);
  const unchanged = !!(latest && latest.content === ch.content);
  const r = pushChapterSnapshot(d, ch.id, ch.content, req.body?.note || '手动保存');
  if (r.pushed) saveDb();
  res.json({ code: 0, data: { ok: true, pushed: r.pushed, unchanged: unchanged || r.unchanged } });
});

router.post('/chapters/:id/restore', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const snap = d.snapshots.find(s => s.id === req.body?.version_id);
  if (!snap || snap.chapter_id !== ch.id) return res.status(400).json({ code: 40001, message: '版本不存在' });
  // 回滚前把当前内容留档（与最新版本无差异则跳过）
  pushChapterSnapshot(d, ch.id, ch.content, '回滚到历史版本');
  ch.content = snap.content;
  ch.word_count = snap.content.length;
  ch.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { chapter: ch } });
});

router.delete('/chapters/:id', (req, res) => {
  const d = db();
  const ch = d.chapters.find(c => c.id === req.params.id);
  if (!ch || !canView(req, projectOf(ch))) return res.status(404).json({ code: 40401, message: '章节不存在' });
  if (!canEdit(req, projectOf(ch))) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
  const snapshots = d.snapshots.filter(s => s.chapter_id === ch.id);
  d.chapters = d.chapters.filter(c => c.id !== ch.id);
  d.snapshots = d.snapshots.filter(s => s.chapter_id !== ch.id);
  d.trash.push({
    id: ch.id,
    kind: 'chapter',
    deleted_at: new Date().toISOString(),
    data: { chapter: ch, snapshots },
  });
  const proj = d.projects.find(p => p.id === ch.project_id);
  if (proj) proj.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true, undo_until: Date.now() + 30000 } });
});

// 每小时自动保存：所有有内容的章节，保存前校验与最新版本差异，无差异跳过
let autoSaveTimer = null;
export function startAutoSaveSnapshot() {
  if (autoSaveTimer) return;
  autoSaveTimer = setInterval(() => {
    try {
      const d = db();
      let pushed = 0;
      for (const ch of d.chapters) {
        if (!ch.content || !ch.content.trim()) continue;
        const r = pushChapterSnapshot(d, ch.id, ch.content, '每小时自动保存');
        if (r.pushed) pushed++;
      }
      if (pushed > 0) saveDb();
      console.log('[AutoSave] 每小时自动保存完成，新增版本 ' + pushed + ' 个');
    } catch (e) {
      console.error('[AutoSave] 自动保存失败:', e.message);
    }
  }, 60 * 60 * 1000);
  autoSaveTimer.unref?.();
}

export default router;
