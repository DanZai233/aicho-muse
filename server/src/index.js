import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { db, initStorage } from './db.js';
import { signToken } from './auth.js';

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import chapterRoutes from './routes/chapters.js';
import structureRoutes from './routes/structure.js';
import memoryRoutes from './routes/memories.js';
import personaRoutes from './routes/personas.js';
import voiceRoutes from './routes/voices.js';
import conversationRoutes from './routes/conversations.js';
import toolRoutes from './routes/tools.js';
import exportRoutes from './routes/export.js';
import adminRoutes from './routes/admin.js';
import trashRoutes, { startTrashReaper } from './routes/trash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await initStorage();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/v1/health', (req, res) => {
  res.json({ code: 0, data: { ok: true, time: new Date().toISOString(), version: '0.1.0' } });
});

// 管理端登录
app.post('/api/v1/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const a = db().admin_users.find(x => x.username === username);
  if (!a || !bcrypt.compareSync(password || '', a.password_hash)) {
    return res.status(401).json({ code: 40101, message: '管理员账号或密码错误' });
  }
  const token = jwt.sign({ uid: a.id, role: 'admin' }, process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me', { expiresIn: '12h' });
  res.json({ code: 0, data: { token, admin: { id: a.id, username: a.username, role: a.role } } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/personas', personaRoutes);
app.use('/api/v1/voice-profiles', voiceRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/tools', toolRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1', structureRoutes);
app.use('/api/v1/memories', memoryRoutes);
app.use('/api/v1', chapterRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/trash', trashRoutes);

startTrashReaper();

// 前端静态资源（生产构建后）
const webDist = fs.existsSync(path.join(__dirname, '..', 'public'))
  ? path.join(__dirname, '..', 'public')        // Docker 内：public 为前端产物
  : path.join(__dirname, '..', '..', 'web', 'dist'); // 本地开发构建
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Aicho Muse server running at http://localhost:${PORT}`);
});
