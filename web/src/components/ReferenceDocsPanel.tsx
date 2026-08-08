import { useRef, useState } from 'react';
import { ReferenceDoc } from '../lib/api';

export default function ReferenceDocsPanel({ docs, onUpload, onDelete, onPick, picked }: {
  docs: ReferenceDoc[];
  onUpload: (file: File, title: string) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onPick: (id: string) => void;
  picked: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (f: File) => {
    setBusy(true);
    try { await onUpload(f, title.trim() || f.name.replace(/.[^.]+$/, '')); setTitle(''); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-xs font-medium text-ink/40">参考文章（知识库）</p>
        <button onClick={() => inputRef.current?.click()} className="text-xs text-accent hover:underline">＋ 导入参考文章</button>
        <input ref={inputRef} type="file" accept=".docx,.md,.markdown,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
      <div className="mb-2 rounded-xl border border-ink/10 bg-paper/50 p-2.5">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="参考文章标题（留空取文件名）"
          className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent" />
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-xs text-ink/45 transition hover:border-accent hover:text-accent disabled:opacity-40">
          {busy ? '正在导入分块…' : '📄 选择文件（docx / md / txt，大文本自动分块）'}
        </button>
      </div>
      <p className="mb-1 px-2 text-[11px] leading-4 text-ink/35">
        支持非常大篇幅的文本，导入后自动按段分块。聊天时点「@」选择文章，助手会读取对应内容辅助创作或引用。
      </p>
      <div className="space-y-1.5">
        {docs.map(d => {
          const active = picked.includes(d.id);
          return (
            <div key={d.id} className={'rounded-xl border px-3 py-2.5 transition ' + (active ? 'border-accent/40 bg-accentlight/30' : 'border-ink/5 bg-surface shadow-soft')}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onPick(d.id)} title={active ? '取消 @' : '聊天时 @ 这篇文章'}
                      className={'rounded-full px-2 py-0.5 text-[11px] font-medium transition ' + (active ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink/70 hover:bg-accentlight')}>
                      @ {active ? '已选择' : '选择'}
                    </button>
                    <span className="truncate text-sm font-medium">{d.title}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink/35">
                    {d.source} · {(d.word_count / 1000).toFixed(1)}k 字 · {d.chunk_count} 段
                  </div>
                </div>
                <button onClick={() => onDelete(d.id, d.title)} className="text-xs text-ink/25 transition hover:text-red-500">✕</button>
              </div>
            </div>
          );
        })}
        {docs.length === 0 && <p className="px-2 py-3 text-center text-xs leading-5 text-ink/30">还没有参考文章。导入原著、史料或文献，创作同人、写论文引用都更方便。</p>}
      </div>
    </div>
  );
}
