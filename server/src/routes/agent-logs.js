// 写作 Agent 日志：用户输入 / AI 回复 / 工具调用记录
// 仅管理员可查看（含用户、作品、会话维度过滤）
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  // 校验管理员（复用 admin 登录 token 的 role 判断）
  if (req.user?.role !== 'admin') return res.status(403).json({ code: 40301, message: '仅管理员可查看 Agent 日志' });
  const d = db();
  const { user_id, project_id, tool, limit = 50, page = 1 } = req.query;
  let list = d.agent_logs || [];
  if (user_id) list = list.filter(x => x.user_id === user_id);
  if (project_id) list = list.filter(x => x.project_id === project_id);
  if (tool) list = list.filter(x => x.tool === tool);
  list = list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const total = list.length;
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
  const p = Math.max(1, Number(page) || 1);
  list = list.slice((p - 1) * pageSize, p * pageSize);
  // 附带用户/作品名称便于查看
  const withMeta = list.map(x => {
    const u = d.users.find(uu => uu.id === x.user_id);
    const pr = d.projects.find(pp => pp.id === x.project_id);
    return { ...x, user_name: u?.display_name || u?.email || null, project_title: pr?.title || null };
  });
  res.json({ code: 0, data: { list: withMeta, total, page: p, page_size: pageSize } });
});

export default router;
