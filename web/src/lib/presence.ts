// 在线协作 Presence 客户端
// 职责：WebSocket 连接管理、章节房间 join/leave、光标节流上报、远端成员事件分发
// 位置上报间隔刻意放宽（默认 4s），减轻服务器负担

export type RemoteUser = { id: string; display_name: string; avatar_color?: string };
export type CursorPayload = { offset: number; selection: { start: number; end: number } | null; scrollTop: number; ts?: number };
export type Peer = { memberId: string; user: RemoteUser; cursor: CursorPayload | null };

export type PresenceEvents = {
  peers: (peers: Peer[]) => void;
  peerJoined: (peer: Peer) => void;
  peerLeft: (memberId: string) => void;
  cursor: (memberId: string, cursor: CursorPayload) => void;
  content: (memberId: string, content: string, rev: number) => void;
  status: (connected: boolean) => void;
};

export type PresenceOptions = {
  projectId: string;
  chapterId: string;
  token: string;
  reportIntervalMs?: number; // 光标上报节流，默认 4000ms
};

export function presenceWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export class PresenceClient {
  private ws: WebSocket | null = null;
  private opts: PresenceOptions;
  private lastSent: { offset: number; scrollTop: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handlers: { [K in keyof PresenceEvents]?: PresenceEvents[K][] } = {} as any;
  private lastReportAt: number | null = null;
  private connected = false;
  private joined = false;

  constructor(opts: PresenceOptions) {
    this.opts = opts;
  }

  connect() {
    if (this.ws) return;
    const url = presenceWsUrl() + '?token=' + encodeURIComponent(this.opts.token);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.emit('status', true);
      this.joinRoom();
      this.startReportLoop();
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'peers': this.emit('peers', msg.peers || []); break;
        case 'peer-joined': this.emit('peerJoined', msg.peer); break;
        case 'peer-left': this.emit('peerLeft', msg.memberId); break;
        case 'cursor': this.emit('cursor', msg.memberId, msg.cursor); break;
        case 'content': this.emit('content', msg.memberId, msg.content, msg.rev || 0); break;
        default: break;
      }
    };
    ws.onclose = () => {
      this.connected = false;
      this.joined = false;
      this.emit('status', false);
      this.ws = null;
      this.stopReportLoop();
      // 简单重连（指数退避，最大 30s）
      const delay = Math.min(30_000, 1000 * Math.pow(1.6, (this.retryCount || 0)));
      this.retryCount = (this.retryCount || 0) + 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => { /* close 统一处理 */ };
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;

  private joinRoom() {
    if (!this.ws || this.joined) return;
    this.ws.send(JSON.stringify({ type: 'join', projectId: this.opts.projectId, chapterId: this.opts.chapterId }));
    this.joined = true;
  }

  // 切换章节时更新房间
  setChapter(chapterId: string) {
    this.opts.chapterId = chapterId;
    this.joined = false;
    if (this.connected && this.ws) {
      this.ws.send(JSON.stringify({ type: 'join', projectId: this.opts.projectId, chapterId }));
    }
  }

  // 上报光标（带节流：位置变化才发，且间隔 >= reportIntervalMs）
  private lastContentRev = 0;
  private lastContentSent = '';

  // 上报正文更新（去重：内容相同不重发；rev 递增用于防旧数据覆盖新数据）
  sendContent(content: string) {
    if (!this.ws || !this.joined || !this.connected) return;
    if (content === this.lastContentSent) return;
    this.lastContentRev += 1;
    this.lastContentSent = content;
    this.ws.send(JSON.stringify({ type: 'content', content, rev: this.lastContentRev }));
  }

  reportCursor(offset: number, selection: { start: number; end: number } | null, scrollTop: number) {
    if (!this.ws || !this.joined || !this.connected) return;
    const now = Date.now();
    if (this.lastSent && this.lastSent.offset === offset && this.lastSent.scrollTop === scrollTop) return;
    if (this.lastReportAt && now - this.lastReportAt < (this.opts.reportIntervalMs ?? 4000)) return;
    this.lastReportAt = now;
    this.lastSent = { offset, scrollTop };
    this.ws.send(JSON.stringify({ type: 'cursor', offset, selection, scrollTop }));
  }

  private startReportLoop() {
    // 兜底：即使没有 selection 事件，也周期性同步一次（用户静止时由 reportCursor 去重）
  }

  private stopReportLoop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopReportLoop();
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ type: 'leave' })); } catch { /* 忽略 */ }
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.joined = false;
  }

  private emit(type: keyof PresenceEvents, ...args: any[]) {
    const list = this.handlers[type];
    if (!list) return;
    for (const fn of list) (fn as (...a: any[]) => void)(...args);
  }

  on<K extends keyof PresenceEvents>(type: K, fn: PresenceEvents[K]) {
    ((this.handlers as any)[type] ||= []).push(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof PresenceEvents>(type: K, fn: PresenceEvents[K]) {
    const list = (this.handlers as any)[type] as PresenceEvents[K][] | undefined;
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
}
