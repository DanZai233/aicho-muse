import { db } from './db.js';

// 项目访问控制：owner（创建者）/ editor（可编辑协作者）/ viewer（只读协作者）
// 作品 collaborators: [{ user_id, role: 'editor'|'viewer', invited_by, joined_at }]
export function projectRole(req, p) {
  if (!p) return null;
  if (p.user_id === req.user.id) return 'owner';
  const me = (p.collaborators || []).find(c => c.user_id === req.user.id);
  return me ? me.role : null;
}

export function findProject(req, id) {
  const p = db().projects.find(x => x.id === id);
  const role = projectRole(req, p);
  return role ? { p, role } : null;
}

export function canView(req, p) { return projectRole(req, p) !== null; }
export function canEdit(req, p) { const r = projectRole(req, p); return r === 'owner' || r === 'editor'; }
export function isOwner(req, p) { return projectRole(req, p) === 'owner'; }
