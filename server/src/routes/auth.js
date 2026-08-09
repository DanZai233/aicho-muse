import { Router } from 'express';
import { registerUser, signToken, checkPassword, authRequired, publicUser, findUserByEmail, findUserById } from '../auth.js';
import { db, saveDb } from '../db.js';
import { checkIpRate, getClientIp } from '../quota.js';

const router = Router();

router.post('/register', (req, res) => {
  try {
    const rate = checkIpRate(getClientIp(req));
    if (!rate.allowed) return res.status(429).set('Retry-After', String(rate.retryAfter)).json({ code: 42901, message: '请求太频繁，请 ' + rate.retryAfter + ' 秒后再试' });
    const user = registerUser(req.body || {});
    res.json({ code: 0, data: { token: signToken(user), user: publicUser(user) } });
  } catch (e) {
    res.status(400).json({ code: 40001, message: e.message });
  }
});

router.post('/login', (req, res) => {
  const rate = checkIpRate(getClientIp(req));
  if (!rate.allowed) return res.status(429).set('Retry-After', String(rate.retryAfter)).json({ code: 42901, message: '登录尝试过于频繁，请 ' + rate.retryAfter + ' 秒后再试' });
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ code: 40101, message: '邮箱或密码错误' });
  }
  if (user.status === 'disabled') return res.status(403).json({ code: 40301, message: '账号已被禁用，请联系管理员' });
  res.json({ code: 0, data: { token: signToken(user), user: publicUser(user) } });
});

router.post('/logout', authRequired, (req, res) => {
  res.json({ code: 0, data: { ok: true } });
});

// 公开站点信息（登录/注册页展示公告、注册开关）
router.get('/site', (req, res) => {
  const s = db().settings.site || {};
  res.json({ code: 0, data: { site: {
    site_name: s.site_name || 'Aicho Muse',
    announcement: s.announcement || '',
    allow_registration: s.allow_registration !== false,
    registration_message: s.registration_message || '',
    default_persona_id: s.default_persona_id || '',
    default_voice_id: s.default_voice_id || '',
  } } });
});

router.get('/me', authRequired, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在' });
  res.json({ code: 0, data: { user: publicUser(user) } });
});

// 用户自助注销：级联清除全部数据（架构文档 §8 完整账号删除与数据清除流程）
router.delete('/me', authRequired, (req, res) => {
  const d = db();
  const u = findUserById(req.user.id);
  if (!u) return res.status(404).json({ code: 40401, message: '用户不存在' });
  d.users = d.users.filter(x => x.id !== u.id);
  const projectIds = d.projects.filter(p => p.user_id === u.id).map(p => p.id);
  const chapterIds = d.chapters.filter(c => projectIds.includes(c.project_id)).map(c => c.id);
  const convIds = d.conversations.filter(c => c.user_id === u.id).map(c => c.id);
  d.projects = d.projects.filter(p => p.user_id !== u.id);
  d.chapters = d.chapters.filter(c => !projectIds.includes(c.project_id));
  d.snapshots = d.snapshots.filter(sn => !chapterIds.includes(sn.chapter_id));
  d.conversations = d.conversations.filter(c => c.user_id !== u.id);
  d.messages = d.messages.filter(m => !convIds.includes(m.conversation_id));
  d.personas = d.personas.filter(p => !p.is_preset && p.user_id !== u.id);
  d.voices = d.voices.filter(v => !v.is_preset && v.user_id !== u.id);
  d.outline_nodes = d.outline_nodes.filter(n => !projectIds.includes(n.project_id));
  d.character_cards = d.character_cards.filter(c => !projectIds.includes(c.project_id));
  d.timeline_events = d.timeline_events.filter(t => !projectIds.includes(t.project_id));
  d.idea_notes = d.idea_notes.filter(i => !projectIds.includes(i.project_id));
  d.memories = d.memories.filter(m => m.user_id !== u.id);
  d.shares = d.shares.filter(s => s.user_id !== u.id);
  const refDocIds = d.reference_docs.filter(r => r.user_id === u.id || projectIds.includes(r.project_id)).map(r => r.id);
  d.reference_docs = d.reference_docs.filter(r => r.user_id !== u.id && !projectIds.includes(r.project_id));
  d.reference_chunks = d.reference_chunks.filter(c => !refDocIds.includes(c.doc_id));
  // 从他人作品的协作者中移除自己
  for (const p of d.projects) {
    if (p.collaborators) p.collaborators = p.collaborators.filter(c => c.user_id !== u.id);
  }
  d.trash = d.trash.filter(t => t.kind === 'project' ? !projectIds.includes(t.id) : !chapterIds.includes(t.id));
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

router.patch('/me', authRequired, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在' });
  if (req.body.display_name) user.display_name = req.body.display_name;
  if (req.body.locale) user.locale = req.body.locale;
  user.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { user: publicUser(user) } });
});


router.get('/me/settings', authRequired, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在' });
  res.json({ code: 0, data: { settings: user.prefs || { assistant_name: '缪斯', my_name: '', tts_rate: 1, tts_pitch: 1, auto_send: false, read_aloud: true } } });
});

router.patch('/me/settings', authRequired, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在' });
  user.prefs = { ...(user.prefs || {}), ...(req.body || {}) };
  user.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { settings: user.prefs } });
});

export default router;
