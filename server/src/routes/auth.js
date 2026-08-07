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
  res.json({ code: 0, data: { token: signToken(user), user: publicUser(user) } });
});

router.post('/logout', authRequired, (req, res) => {
  res.json({ code: 0, data: { ok: true } });
});

router.get('/me', authRequired, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在' });
  res.json({ code: 0, data: { user: publicUser(user) } });
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
  res.json({ code: 0, data: { settings: user.prefs || { tts_rate: 1, tts_pitch: 1, auto_send: false, read_aloud: true } } });
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
