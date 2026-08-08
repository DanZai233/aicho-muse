import { useState } from 'react';
import { api, Citation } from '../lib/api';
import { Button, Input, Modal } from './ui';

const EMPTY = { raw: '', title: '', authors: '', year: '', source: '', note: '' };

export default function CitationsPanel({ projectId, citations, setCitations, onInsert }: {
  projectId: string;
  citations: Citation[];
  setCitations: (fn: (prev: Citation[]) => Citation[]) => void;
  onInsert: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Citation | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const startAdd = () => { setEditing(null); setDraft({ ...EMPTY }); setOpen(true); setMsg(''); };
  const startEdit = (c: Citation) => {
    setEditing(c);
    setDraft({ raw: c.raw, title: c.title, authors: c.authors, year: c.year, source: c.source, note: c.note });
    setOpen(true); setMsg('');
  };

  const save = async () => {
    if (!draft.raw.trim() && !draft.title.trim()) { setMsg('至少填写「完整条目」或「标题」'); return; }
    setBusy(true); setMsg('');
    try {
      if (editing) {
        const d = await api.patch<{ citation: Citation }>('/citations/' + editing.id, draft);
        setCitations(prev => prev.map(c => c.id === d.citation.id ? d.citation : c));
        setMsg('已保存 ✓');
      } else {
        const d = await api.post<{ citation: Citation }>('/projects/' + projectId + '/citations', draft);
        setCitations(prev => [...prev, d.citation]);
        setMsg('已添加 ✓');
      }
      setTimeout(() => { setOpen(false); setMsg(''); }, 600);
    } catch (e: any) { setMsg(e.message || '保存失败'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除这条参考文献？')) return;
    try {
      await api.del('/citations/' + id);
      setCitations(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  const display = (c: Citation) => c.raw || [c.authors, c.title, c.source, c.year].filter(Boolean).join('. ');

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-xs font-medium text-ink/40">参考文献</p>
        <button onClick={startAdd} className="text-xs text-accent hover:underline">＋ 添加引用</button>
      </div>
      <div className="space-y-1.5">
        {citations.map((c, i) => (
          <div key={c.id} className="group rounded-xl border border-ink/5 bg-surface px-3 py-2.5 shadow-soft">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 text-xs leading-5 text-ink/70">
                <span className="mr-1.5 font-serif font-semibold text-accent">[{i + 1}]</span>
                {display(c)}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => onInsert(i + 1)} title="在正文光标处插入 [n]"
                  className="rounded px-1.5 py-0.5 text-[11px] text-accent opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-accentlight/60">插入</button>
                <button onClick={() => startEdit(c)} title="编辑"
                  className="rounded px-1.5 py-0.5 text-[11px] text-ink/40 opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-ink/5">✎</button>
                <button onClick={() => remove(c.id)} title="删除"
                  className="rounded px-1.5 py-0.5 text-[11px] text-ink/25 opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500">✕</button>
              </div>
            </div>
            {c.note && <p className="mt-1 text-[11px] text-ink/35">{c.note}</p>}
          </div>
        ))}
        {citations.length === 0 && (
          <p className="px-2 py-3 text-center text-xs leading-5 text-ink/30">
            还没有参考文献。添加后可在正文插入 [1]、[2]…，导出时自动生成参考文献列表。
          </p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? '编辑参考文献' : '添加参考文献'}>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          <Input label="完整条目（优先，如：作者. 标题[J]. 期刊, 2024, 12(3): 1-10.）" value={draft.raw} onChange={v => setDraft({ ...draft, raw: v })} textarea rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="标题" value={draft.title} onChange={v => setDraft({ ...draft, title: v })} />
            <Input label="作者" value={draft.authors} onChange={v => setDraft({ ...draft, authors: v })} />
            <Input label="年份" value={draft.year} onChange={v => setDraft({ ...draft, year: v })} />
            <Input label="来源（期刊/出版社/网址）" value={draft.source} onChange={v => setDraft({ ...draft, source: v })} />
          </div>
          <Input label="备注" value={draft.note} onChange={v => setDraft({ ...draft, note: v })} placeholder="选填" />
          {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy} className="flex-1">{busy ? '保存中…' : '保存'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
