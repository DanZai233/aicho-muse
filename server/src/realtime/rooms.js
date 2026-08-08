// 在线协作房间：按 projectId:chapterId 分组，维护成员与光标
// 纯逻辑模块，不依赖 WebSocket 实现，方便测试与复用
import { db } from '../db.js';

// 光标超过该秒数未更新则视为已离开（前端每 4s 上报一次，阈值放宽）
export const CURSOR_STALE_MS = 15_000;

export class PresenceRoom {
  constructor(projectId, chapterId) {
    this.projectId = projectId;
    this.chapterId = chapterId;
    this.members = new Map(); // memberId -> { ws, user, cursor, lastSeen }
  }

  get size() { return this.members.size; }

  add(memberId, ws, user) {
    const prev = this.members.get(memberId);
    if (prev) {
      // 同一用户重复连接（多标签页）：替换连接，保留光标
      try { prev.ws.close(); } catch { /* 忽略 */ }
    }
    this.members.set(memberId, { ws, user, cursor: prev?.cursor || null, lastSeen: Date.now() });
  }

  remove(memberId) {
    return this.members.delete(memberId);
  }

  updateCursor(memberId, cursor) {
    const m = this.members.get(memberId);
    if (!m) return;
    m.cursor = cursor;
    m.lastSeen = Date.now();
  }

  touch(memberId) {
    const m = this.members.get(memberId);
    if (m) m.lastSeen = Date.now();
  }

  // 活跃成员（最近还在的）
  activeMembers() {
    const now = Date.now();
    return [...this.members.values()].filter(m => now - m.lastSeen < CURSOR_STALE_MS);
  }

  // 发送给房间内除指定 memberId 外的所有人
  broadcast(message, exceptId = null) {
    const raw = JSON.stringify(message);
    for (const [id, m] of this.members) {
      if (id === exceptId) continue;
      if (m.ws.readyState === 1) { // WebSocket.OPEN
        try { m.ws.send(raw); } catch { /* 忽略单条发送失败 */ }
      }
    }
  }
}

// 全局房间表 + 项目权限缓存（避免每次连接都全表扫）
const rooms = new Map();
export function getRoom(projectId, chapterId) {
  const key = projectId + ':' + chapterId;
  let r = rooms.get(key);
  if (!r) {
    r = new PresenceRoom(projectId, chapterId);
    rooms.set(key, r);
  }
  return r;
}

export function removeRoomIfEmpty(projectId, chapterId) {
  const key = projectId + ':' + chapterId;
  const r = rooms.get(key);
  if (r && r.size === 0) rooms.delete(key);
}

// 项目参与者（owner + 协作者）ID 集合
export function projectMemberIds(project) {
  const ids = new Set([project.user_id]);
  for (const c of project.collaborators || []) ids.add(c.user_id);
  return ids;
}

// 校验用户是否为项目参与者；返回 { ok, project } 或 { ok:false }
export function checkProjectAccess(userId, projectId) {
  const p = db().projects.find(x => x.id === projectId);
  if (!p) return { ok: false, reason: 'project-not-found' };
  const ids = projectMemberIds(p);
  if (!ids.has(userId)) return { ok: false, reason: 'forbidden' };
  return { ok: true, project: p };
}
