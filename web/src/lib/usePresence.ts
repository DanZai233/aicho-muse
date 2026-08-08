// 实时光标 hook：管理 PresenceClient 生命周期，暴露远端成员/光标与上报方法
// 章节切换时 join 新房间；组件卸载时断开
import { useEffect, useRef, useState, useCallback } from 'react';
import { PresenceClient, type Peer, type CursorPayload, type RemoteUser } from './presence';

export type RemoteCursorEntry = { memberId: string; user: RemoteUser; cursor: CursorPayload };

export function usePresence(projectId: string, chapterId: string, token: string | null) {
  const clientRef = useRef<PresenceClient | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursorEntry>>({});
  const [online, setOnline] = useState(false);

  // 创建/销毁客户端
  useEffect(() => {
    if (!token || !projectId) return;
    const client = new PresenceClient({ projectId, chapterId, token, reportIntervalMs: 4000 });
    clientRef.current = client;

    const offs = [
      client.on('peers', (list) => {
        setPeers(list);
        const next: Record<string, RemoteCursorEntry> = {};
        for (const p of list) if (p.cursor) next[p.memberId] = { memberId: p.memberId, user: p.user, cursor: p.cursor };
        setCursors(next);
      }),
      client.on('peerJoined', (peer) => setPeers(prev => [...prev.filter(p => p.memberId !== peer.memberId), peer])),
      client.on('peerLeft', (memberId) => {
        setPeers(prev => prev.filter(p => p.memberId !== memberId));
        setCursors(prev => { const n = { ...prev }; delete n[memberId]; return n; });
      }),
      client.on('cursor', (memberId, cursor) => {
        setCursors(prev => {
          const existing = prev[memberId];
          if (!existing) return prev;
          return { ...prev, [memberId]: { ...existing, cursor } };
        });
      }),
      client.on('status', (connected) => setOnline(connected)),
    ];

    client.connect();
    return () => {
      offs.forEach(off => off());
      client.disconnect();
      clientRef.current = null;
    };
    // chapterId 变化时重建客户端太重，交给 setChapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  // 章节切换
  useEffect(() => {
    const c = clientRef.current;
    if (!c) return;
    if (!chapterId) { c.disconnect(); return; }
    c.setChapter(chapterId);
    setPeers([]);
    setCursors({});
  }, [chapterId]);

  const reportCursor = useCallback((offset: number, selection: { start: number; end: number } | null, scrollTop: number) => {
    clientRef.current?.reportCursor(offset, selection, scrollTop);
  }, []);

  return { peers, cursors, online, reportCursor };
}
