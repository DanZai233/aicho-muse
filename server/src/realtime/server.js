// WebSocket 接入层：处理 /ws 连接、JWT 鉴权、消息路由
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { getRoom, removeRoomIfEmpty, checkProjectAccess, CURSOR_STALE_MS } from './rooms.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me';

// 从 query 里取 token，解码出用户
function authUser(url) {
  try {
    const u = new URL(url, 'http://localhost');
    const token = u.searchParams.get('token');
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db().users.find(x => x.id === payload.uid);
    return user || null;
  } catch {
    return null;
  }
}

function publicUser(u) {
  return { id: u.id, display_name: u.display_name || u.email?.split('@')[0] || '用户', avatar_color: u.avatar_color || '#8b7d6b' };
}

// 心跳：定期 ping 空连接，清理僵死连接
function heartbeat(ws, state) {
  state.isAlive = true;
  ws.on('pong', () => { state.isAlive = true; });
}

export function attachPresenceServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const user = authUser(req.url);
    const state = { isAlive: true, memberId: null, room: null };
    ws._state = state; // 供周期清理读取
    heartbeat(ws, state);

    if (!user) {
      ws.close(4001, 'unauthorized');
      return;
    }

    const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // 心跳
      if (msg.type === 'ping') { state.isAlive = true; send({ type: 'pong' }); return; }

      // 加入/切换章节房间
      if (msg.type === 'join') {
        const { projectId, chapterId } = msg;
        if (!projectId || !chapterId) return;
        const acc = checkProjectAccess(user.id, projectId);
        if (!acc.ok) { send({ type: 'error', code: acc.reason }); return; }

        // 离开旧房间
        if (state.room) {
          state.room.remove(state.memberId);
          state.room.broadcast({ type: 'peer-left', memberId: state.memberId }, state.memberId);
          removeRoomIfEmpty(state.room.projectId, state.room.chapterId);
        }

        const room = getRoom(projectId, chapterId);
        const memberId = user.id;
        room.add(memberId, ws, user);
        state.room = room;
        state.memberId = memberId;

        // 告知新加入者当前活跃成员
        send({
          type: 'peers',
          peers: room.activeMembers()
            .filter(m => m.ws.readyState === 1)
            .map(m => ({ memberId: m.user.id, user: publicUser(m.user), cursor: m.cursor })),
        });
        // 广播有新成员
        room.broadcast({ type: 'peer-joined', peer: { memberId: user.id, user: publicUser(user), cursor: null } }, memberId);
        return;
      }

      // 光标位置上报（前端已节流）
      if (msg.type === 'cursor' && state.room) {
        const { offset = 0, selection = null, scrollTop = 0 } = msg;
        const cursor = { offset: Math.max(0, Math.floor(Number(offset) || 0)), selection, scrollTop: Math.max(0, Math.floor(Number(scrollTop) || 0)), ts: Date.now() };
        // 与上次相同则跳过广播（服务端二次去重，减轻负担）
        const prev = state.room.members.get(state.memberId)?.cursor;
        if (prev && prev.offset === cursor.offset && prev.scrollTop === cursor.scrollTop) return;
        state.room.updateCursor(state.memberId, cursor);
        state.room.broadcast({
          type: 'cursor',
          memberId: state.memberId,
          cursor,
        }, state.memberId);
        return;
      }

      // 显式离开当前章节
      if (msg.type === 'leave' && state.room) {
        state.room.remove(state.memberId);
        state.room.broadcast({ type: 'peer-left', memberId: state.memberId }, state.memberId);
        removeRoomIfEmpty(state.room.projectId, state.room.chapterId);
        state.room = null;
        state.memberId = null;
      }
    });

    ws.on('close', () => {
      if (state.room) {
        state.room.remove(state.memberId);
        state.room.broadcast({ type: 'peer-left', memberId: state.memberId }, state.memberId);
        removeRoomIfEmpty(state.room.projectId, state.room.chapterId);
      }
    });

    ws.on('error', () => { /* 连接层错误交给 close 清理 */ });
  });

  // 周期清理僵死连接与过期光标
  const timer = setInterval(() => {
    for (const client of wss.clients) {
      const s = client._state;
      if (!s) continue;
      if (!s.isAlive) { client.terminate(); continue; }
      s.isAlive = false;
      try { client.ping(); } catch { /* 忽略 */ }
    }
  }, 30_000);
  timer.unref?.();

  return wss;
}

export { CURSOR_STALE_MS };
