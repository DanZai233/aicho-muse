import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, uuid, saveDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me';
const TOKEN_TTL = '30d';

export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role || 'user' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
export function checkPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ code: 40101, message: '未登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.uid, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ code: 40101, message: '登录已过期' });
  }
}

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    const u = db().admin_users.find(x => x.id === req.user.id);
    if (!u) return res.status(403).json({ code: 40301, message: '需要管理员权限' });
    req.admin = u;
    next();
  });
}

export function registerUser({ email, password, display_name }) {
  const d = db();
  if (!email || !password) throw new Error('邮箱和密码必填');
  if (password.length < 6) throw new Error('密码至少 6 位');
  if (d.users.some(u => u.email === email)) throw new Error('该邮箱已注册');
  const now = new Date().toISOString();
  const user = {
    id: uuid(),
    email,
    password_hash: hashPassword(password),
    display_name: display_name || email.split('@')[0],
    locale: 'zh-CN',
    role: 'user',
    created_at: now,
    updated_at: now,
  };
  d.users.push(user);
  saveDb();
  return user;
}

export function findUserByEmail(email) {
  return db().users.find(u => u.email === email);
}

export function findUserById(id) {
  return db().users.find(u => u.id === id);
}

export function publicUser(u) {
  return { id: u.id, email: u.email, display_name: u.display_name, locale: u.locale, created_at: u.created_at };
}
