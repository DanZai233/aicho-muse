// 记忆接入面板：通过 @记忆 打开，只显示自己的记忆（按书分组），
// 勾选其他作品的记忆库后，本会话临时接入该书记忆
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type MemoryItem = { id: string; project_id: string | null; scope: string; key: string; content: string; importance: number; created_at: string };
type GroupData = {
  projects: { id: string; title: string; genre: string; cover_color: string; memory_count: number }[];
  user_memories: MemoryItem[];
  user_memory_count: number;
  total: number;
};

export default function MemoryLinkModal({ open, convId, currentProjectId, linked, onClose, onSaved }: {
  open: boolean; convId: string | null; currentProjectId: string | null;
  linked: string[]; onClose: () => void; onSaved: (ids: string[]) => void;
}) {
  const [data, setData] = useState<GroupData | null>(null);
  const [picked, setPicked] = useState<string[]>(linked);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false); setErr(''); setPicked(linked);
    api.get<GroupData>('/memories?grouped=1').then(setData).catch((e: any) => setErr(e.message || '加载失败'));
  }, [open, linked]);

  if (!open) return null;

  const toggle = (pid: string) => {
    if (pid === currentProjectId) return;
    setPicked(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : (prev.length >= 8 ? prev : [...prev, pid]));
  };

  const save = async () => {
    if (!convId) return;
    setBusy(true); setErr('');
    try {
      await api.patch('/conversations/' + convId, { linked_project_ids: picked });
      setSaved(true); onSaved(picked);
      setTimeout(() => onClose(), 800);
    } catch (e: any) { setErr(e.message || '保存失败'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-md animate-fade-up" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-accent/20 bg-surface shadow-lift animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-semibold">🧠 记忆库</h3>
            <p className="text-xs text-ink/45">只看得到你自己的记忆。接入其他书的记忆后，本次会话的助手也能参考它们。</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto px-5 py-4">
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
          {!data ? (
            <p className="py-8 text-center text-sm text-ink/40">加载记忆中…</p>
          ) : (
            <>
              {/* 用户级记忆 */}
              {data.user_memories.length > 0 && (
                <div className="rounded-xl border border-ink/8 bg-paper/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-ink/60">我的通用记忆（{data.user_memories.length} 条）· 一直可用</p>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto">
                    {data.user_memories.slice(0, 12).map(m => (
                      <div key={m.id} className="rounded-lg bg-surface px-2.5 py-1.5 text-xs leading-5 text-ink/65">
                        <span className="mr-1.5 text-ink/30">·</span>{m.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 按书分组的记忆 */}
              <div>
                <p className="mb-2 text-xs font-semibold text-ink/60">我的作品记忆（勾选即可在本会话接入）</p>
                {data.projects.length === 0 && <p className="rounded-lg border border-dashed border-ink/15 px-3 py-2 text-xs text-ink/35">还没有作品记忆，先多写写，缪斯会帮你记住重要的内容。</p>}
                <div className="space-y-2">
                  {data.projects.map(p => {
                    const isCurrent = p.id === currentProjectId;
                    const on = isCurrent || picked.includes(p.id);
                    return (
                      <div key={p.id} className={'rounded-xl border p-3 transition ' + (on ? 'border-accent/40 bg-accentlight/25' : 'border-ink/8 bg-paper/40')}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.cover_color || '#8b7d6b' }} />
                              <span className="truncate text-sm font-medium">{p.title}</span>
                              {isCurrent && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/45">当前作品</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-ink/40">{p.genre ? ({ biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本', paper: '论文' } as any)[p.genre] || p.genre : ''} · {p.memory_count} 条记忆</p>
                          </div>
                          {!isCurrent && (
                            <button onClick={() => toggle(p.id)} disabled={busy}
                              className={'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition ' + (on ? 'border-accent bg-accent text-paper' : 'border-ink/20 text-transparent hover:border-accent')}>
                              ✓
                            </button>
                          )}
                        </div>
                        {p.memory_count === 0 && <p className="mt-1 text-[11px] text-ink/30">这本书还没有记忆</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/5 px-5 py-3.5">
          <p className="text-xs text-ink/45">
            {saved ? '✅ 已保存' : picked.length > 0 ? `已接入 ${picked.length} 本其他作品` : '未接入其他作品'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full bg-ink/5 px-4 py-2 text-xs text-ink/60 hover:bg-ink/10">取消</button>
            <button onClick={save} disabled={busy || !convId} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink/85 disabled:opacity-40">
              {busy ? '保存中…' : '保存接入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
