// 统一 AI 助手：右下角浮动入口
// 支持：页面/功能导航、作品库与摘要问答、知识库问答
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { askAssistant, listProjectBriefs, summarizeProject, type AskResult, type ProjectBrief } from '../../lib/assistant';

type Msg = { role: 'user' | 'assistant'; content: string; actions?: AskResult['actions']; busy?: boolean };

const QUICK_NAV = [
  { label: '📚 我的书', to: '/' },
  { label: '✍ 创作空间', to: '/workspace' },
  { label: '🧑‍🎨 人设', to: '/personas' },
  { label: '🎙 音色', to: '/voices' },
  { label: '⚙ 设置', to: '/settings' },
];

export default function MuseAssistant() {
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'books'>('chat');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [briefs, setBriefs] = useState<ProjectBrief[] | null>(null);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时加载作品摘要列表
  useEffect(() => {
    if (!open || briefs !== null) return;
    listProjectBriefs().then(setBriefs).catch(() => setBriefs([]));
  }, [open, briefs]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const go = (to: string) => {
    nav(to);
    setOpen(false);
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: q };
    const thinking: Msg = { role: 'assistant', content: '正在思考…', busy: true };
    setMsgs(prev => [...prev, userMsg, thinking]);
    setBusy(true);
    try {
      // 若当前在创作空间，把当前作品带过去做问答上下文
      const projectId = loc.pathname === '/workspace' ? new URLSearchParams(loc.search).get('project') || undefined : undefined;
      const r = await askAssistant(q, projectId);
      setMsgs(prev => prev.map(m => m.busy ? { role: 'assistant', content: r.answer, actions: r.actions } : m));
    } catch (e: any) {
      setMsgs(prev => prev.map(m => m.busy ? { role: 'assistant', content: '出错了：' + (e.message || '请稍后再试'), actions: [] } : m));
    } finally {
      setBusy(false);
    }
  };

  const genSummary = async (id: string) => {
    setSummarizing(id);
    try {
      await summarizeProject(id);
      setBriefs(prev => prev ? prev.map(b => b.id === id ? { ...b, has_summary: true } : b) : prev);
    } catch { /* 忽略 */ }
    finally { setSummarizing(null); }
  };

  return (
    <>
      {/* 浮动入口按钮 */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Muse 助手"
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-paper shadow-lift transition hover:scale-105 hover:shadow-2xl"
        style={{ boxShadow: '0 8px 28px rgba(139,125,107,0.4)' }}
      >
        {open ? '✕' : '✨'}
      </button>

      {/* 面板 */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[60] flex h-[560px] max-h-[75vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-2xl animate-fade-up">
          {/* 头部 */}
          <div className="flex items-center gap-2 border-b border-ink/5 bg-accentlight/40 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-serif text-base font-bold text-paper">M</div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-sm font-semibold">Muse 助手</p>
              <p className="text-[10px] text-ink/45">导航 · 知识库 · 作品摘要问答</p>
            </div>
            <div className="flex rounded-lg bg-ink/5 p-0.5 text-xs">
              <button onClick={() => setTab('chat')} className={'rounded-md px-2.5 py-1 transition ' + (tab === 'chat' ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink/50')}>问答</button>
              <button onClick={() => setTab('books')} className={'rounded-md px-2.5 py-1 transition ' + (tab === 'books' ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink/50')}>作品</button>
            </div>
          </div>

          {/* 快捷导航 */}
          <div className="flex flex-wrap gap-1 border-b border-ink/5 px-3 py-2">
            {QUICK_NAV.map(n => (
              <button key={n.to} onClick={() => go(n.to)}
                className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink/60 transition hover:bg-accentlight hover:text-ink">
                {n.label}
              </button>
            ))}
          </div>

          {/* 内容区 */}
          {tab === 'chat' ? (
            <>
              <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {msgs.length === 0 && (
                  <p className="py-8 text-center text-xs leading-5 text-ink/40">
                    问 Muse 任何关于创作的问题，比如：<br />「我最近在写什么？」「这本书讲了什么？」<br />「怎么去人设页面？」「帮我找找创作记忆」
                  </p>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-5 ' + (m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-ink/5 bg-paper/60 shadow-soft')}>
                      {m.content}
                      {m.actions && m.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.actions.map((a, j) => (
                            <button key={j} onClick={() => go(a.to)}
                              className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-paper transition hover:bg-accent/90">
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-ink/5 p-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-paper/60 px-3 py-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') send(); }}
                    placeholder="问 Muse 一个问题…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/30"
                  />
                  <button onClick={send} disabled={busy || !input.trim()}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper transition hover:bg-accent/90 disabled:opacity-40">
                    {busy ? '…' : '发送'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {briefs === null && <p className="py-8 text-center text-xs text-ink/40">加载中…</p>}
              {briefs && briefs.length === 0 && <p className="py-8 text-center text-xs text-ink/40">还没有作品，去创建第一本书吧</p>}
              {briefs && briefs.map(b => (
                <div key={b.id} className="mb-2 rounded-xl border border-ink/8 bg-paper/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-serif text-sm font-semibold">《{b.title}》</p>
                    <span className="shrink-0 text-[10px] text-ink/40">{b.genre} · {b.word_count} 字</span>
                  </div>
                  {b.summary ? (
                    <p className="mt-1.5 text-xs leading-5 text-ink/60">{b.summary}</p>
                  ) : (
                    <button onClick={() => genSummary(b.id)} disabled={summarizing === b.id}
                      className="mt-1.5 rounded-full bg-accentlight/60 px-2.5 py-1 text-[10px] text-ink/60 transition hover:bg-accentlight disabled:opacity-40">
                      {summarizing === b.id ? '生成中…' : '✨ 生成摘要'}
                    </button>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => go('/workspace?project=' + b.id)} className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/55 hover:bg-ink/10">打开</button>
                    <button onClick={() => { setTab('chat'); setInput('《' + b.title + '》讲了什么？'); }} className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/55 hover:bg-ink/10">问内容</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
