// 断网草稿：章节内容本地暂存，联网后自动同步
const KEY = 'am_drafts';
type Draft = { id: string; title: string; content: string; saved_at: string };

function read(): Record<string, Draft> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(map: Record<string, Draft>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* 存储已满则忽略 */ }
}

export function saveDraft(id: string, content: string, title: string) {
  const map = read();
  map[id] = { id, title, content, saved_at: new Date().toISOString() };
  write(map);
}

export function getDraft(id: string): Draft | null {
  return read()[id] || null;
}

export function clearDraft(id: string) {
  const map = read();
  delete map[id];
  write(map);
}

export function listPending(): Draft[] {
  return Object.values(read());
}