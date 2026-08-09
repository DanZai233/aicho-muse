// 用户反馈弹窗：提交意见 + 联系方式（可选），可查看自己历史反馈
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type FeedbackItem = { id: string; content: string; contact: string; page: string; status: string; created_at: string };

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<FeedbackItem[]>([]);
  const [showMine, setShowMine] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDone(false); setErr(''); setContent(''); setContact(''); setShowMine(false);
    api.get<{ list: FeedbackItem[] }>('/feedback/mine').then(d => setMine(d.list || [])).catch(() => setMine([]));
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!content.trim()) { setErr('请先写下你的想法'); return; }
    setBusy(true); setErr('');
    try {
      const page = location.pathname + location.search;
      await api.post('/feedback', { content: content.trim(), contact: contact.trim(), page });
      setDone(true);
      const d = await api.get<{ list: FeedbackItem[] }>('/feedback/mine');
      setMine(d.list || []);
    } catch (e: any) { setErr(e.message || '提交失败，请稍后再试'); }
    finally { setBusy(false); }
  };

  const statusLabel: Record<string, string> = { open: '待处理', done: '已处理', ignored: '已忽略' };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-md animate-fade-up" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-accent/20 bg-surface p-6 shadow-lift animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">💌</span>
            <div>
              <h3 className="font-serif text-lg font-semibold">给缪斯写信</h3>
              <p className="text-xs text-ink/45">你的意见会帮助我们做得更好</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>

        {done ? (
          <div className="py-8 text-center animate-fade-up">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accentlight/70 text-2xl">✅</div>
            <p className="font-serif text-base font-semibold">信已寄出，谢谢你。</p>
            <p className="mt-1 text-sm text-ink/50">我们会认真阅读每一条反馈。</p>
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={() => setDone(false)} className="rounded-full bg-ink/5 px-4 py-2 text-xs text-ink/60 hover:bg-ink/10">再写一条</button>
              <button onClick={onClose} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:bg-ink/85">关闭</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} maxLength={4000}
              placeholder="想说的任何话：功能建议、遇到的问题、喜欢的地方…"
              className="w-full resize-y rounded-xl border border-ink/10 bg-paper/50 px-3 py-2.5 text-sm leading-6 text-ink outline-none transition focus:border-accent/50" />
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={200}
              placeholder="联系方式（可选）：邮箱 / 微信，方便我们回访"
              className="w-full rounded-xl border border-ink/10 bg-paper/50 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/50" />
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
            <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-ink py-2.5 text-sm font-medium text-paper transition hover:bg-ink/85 disabled:opacity-50">
              {busy ? '寄出中…' : '✉️ 寄出反馈'}
            </button>
            {mine.length > 0 && (
              <button onClick={() => setShowMine(v => !v)} className="w-full text-center text-xs text-ink/40 hover:text-ink/70">
                {showMine ? '收起我的历史反馈' : `查看我提交过的 ${mine.length} 条反馈`}
              </button>
            )}
            {showMine && mine.length > 0 && (
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl bg-ink/[0.03] p-3 animate-fade-up">
                {mine.map(f => (
                  <div key={f.id} className="rounded-lg bg-paper/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-ink/35">{new Date(f.created_at).toLocaleDateString()}</span>
                      <span className={'rounded-full px-2 py-0.5 text-[10px] ' + (f.status === 'done' ? 'bg-emerald-50 text-emerald-700' : f.status === 'ignored' ? 'bg-ink/5 text-ink/45' : 'bg-amber-50 text-amber-700')}>{statusLabel[f.status] || '待处理'}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink/65">{f.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
