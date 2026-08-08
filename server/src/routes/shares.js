import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { canView, isOwner } from '../access.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me';

// 公开接口允许匿名访问；带有效 token 时解析出用户（用于点赞状态等）
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.uid, role: payload.role };
  } catch { /* 忽略无效 token，按匿名处理 */ }
  next();
}

function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }

// 生成分享快照：复制作品元信息与全部章节正文（与原文完全解耦）
function snapshotOf(p) {
  const d = db();
  const chapters = d.chapters
    .filter(c => c.project_id === p.id)
    .sort((a, b) => a.order_index - b.order_index)
    .map(c => ({ title: c.title, content: c.content, order_index: c.order_index }));
  return {
    title: p.title, subtitle: p.subtitle || '', author_name: p.author_name || '',
    cover_color: p.cover_color || '#8b7d6b', genre: p.genre || 'fiction',
    language: p.language || 'zh-CN', theme: p.theme || '',
    abstract: p.abstract || '', keywords: Array.isArray(p.keywords) ? p.keywords : [],
    citation_style: p.citation_style || 'gb7714',
    chapters,
    chapter_count: chapters.length,
    word_count: chapters.reduce((s, c) => s + (c.content || '').length, 0),
  };
}

function withAuthor(share) {
  const d = db();
  const u = d.users.find(x => x.id === share.user_id);
  const { chapters, ...meta } = share;
  return {
    ...meta,
    chapter_count: share.chapter_count,
    word_count: share.word_count,
    like_count: (share.likes || []).length,
    author: u ? { display_name: u.display_name, avatar_color: u.avatar_color } : null,
  };
}

// 公开广场列表（无需登录）
router.get('/shares', optionalAuth, (req, res) => {
  const d = db();
  let list = d.shares.filter(s => !s.hidden);
  const q = String(req.query.q || '').trim().toLowerCase();
  const genre = String(req.query.genre || '').trim();
  if (q) list = list.filter(s => (s.title || '').toLowerCase().includes(q) || (s.author_name || '').toLowerCase().includes(q) || (s.abstract || '').toLowerCase().includes(q));
  if (genre) list = list.filter(s => s.genre === genre);
  const sort = req.query.sort === 'likes' ? 'likes' : 'newest';
  if (sort === 'likes') list = list.sort((a, b) => (b.likes || []).length - (a.likes || []).length || b.updated_at.localeCompare(a.updated_at));
  else list = list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size) || 20));
  const total = list.length;
  res.json({ code: 0, data: { list: list.slice((page - 1) * pageSize, page * pageSize).map(withAuthor), total, page, page_size: pageSize } });
});

// 分享详情（无需登录；阅读时累加浏览量）
router.get('/shares/:id', optionalAuth, (req, res) => {
  const d = db();
  const share = d.shares.find(s => s.id === req.params.id && !s.hidden);
  if (!share) return res.status(404).json({ code: 40401, message: '分享不存在或已下架' });
  share.view_count = (share.view_count || 0) + 1;
  saveDb();
  const u = d.users.find(x => x.id === share.user_id);
  res.json({
    code: 0, data: {
      ...withAuthor(share),
      chapters: share.chapters || [],
      liked_by_me: !!(req.user && (share.likes || []).includes(req.user.id)),
      author: u ? { display_name: u.display_name, avatar_color: u.avatar_color } : null,
    },
  });
});

// 我的作品的分享状态（工作台用）
router.get('/shares/by-project/:pid', authRequired, (req, res) => {
  const d = db();
  const p = projectOf(req.params.pid);
  if (!p || !canView(req, p)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const share = d.shares.find(s => s.project_id === p.id) || null;
  res.json({ code: 0, data: { share: share ? withAuthor(share) : null } });
});

// 发布分享：创建当前状态的快照副本（用户无感知，后续修改不影响已发布内容）
router.post('/shares', authRequired, (req, res) => {
  const d = db();
  const p = projectOf(req.body?.project_id);
  if (!p || !isOwner(req, p)) return res.status(404).json({ code: 40401, message: '作品不存在或没有发布权限' });
  const existing = d.shares.find(s => s.project_id === p.id);
  const now = new Date().toISOString();
  if (existing) {
    return res.json({ code: 0, data: { share: withAuthor(existing), already: true } });
  }
  const share = {
    id: uuid(),
    project_id: p.id,
    user_id: p.user_id,
    version: 1,
    ...snapshotOf(p),
    likes: [],
    view_count: 0,
    hidden: false,
    created_at: now,
    updated_at: now,
    republished_at: now,
  };
  d.shares.push(share);
  saveDb();
  res.json({ code: 0, data: { share: withAuthor(share), already: false } });
});

// 再发版：以最新内容刷新快照，版本号 +1（点赞/浏览数保留）
router.post('/shares/:id/republish', authRequired, (req, res) => {
  const d = db();
  const share = d.shares.find(s => s.id === req.params.id);
  if (!share || share.user_id !== req.user.id) return res.status(404).json({ code: 40401, message: '分享不存在' });
  const p = projectOf(share.project_id);
  if (!p) return res.status(404).json({ code: 40401, message: '原作品不存在' });
  const now = new Date().toISOString();
  const snap = snapshotOf(p);
  Object.assign(share, snap, {
    version: (share.version || 1) + 1,
    updated_at: now,
    republished_at: now,
  });
  saveDb();
  res.json({ code: 0, data: { share: { ...withAuthor(share), chapters: share.chapters || [] } } });
});

// 点赞 / 取消点赞（需登录）
router.post('/shares/:id/like', authRequired, (req, res) => {
  const d = db();
  const share = d.shares.find(s => s.id === req.params.id && !s.hidden);
  if (!share) return res.status(404).json({ code: 40401, message: '分享不存在' });
  share.likes = share.likes || [];
  const idx = share.likes.indexOf(req.user.id);
  if (idx >= 0) share.likes.splice(idx, 1);
  else share.likes.push(req.user.id);
  saveDb();
  res.json({ code: 0, data: { liked: idx < 0, like_count: share.likes.length } });
});

// 下架分享（仅创建者）
router.delete('/shares/:id', authRequired, (req, res) => {
  const d = db();
  const share = d.shares.find(s => s.id === req.params.id);
  if (!share || share.user_id !== req.user.id) return res.status(404).json({ code: 40401, message: '分享不存在' });
  d.shares = d.shares.filter(s => s.id !== share.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
