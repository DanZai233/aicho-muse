// 文评弹窗：为作品生成风格化文评，可选择助手人设（用 TA 的性格写）与朗读音色
// 仪式感动效 + 逐字浮现 + 语音朗读
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, Persona, VoiceProfile } from '../lib/api';
import { speakWithTTS, stopSpeakTTS } from '../lib/speech';

export type ReviewStyle = { id: string; name: string; icon: string; desc: string };
type Review = { score: number; summary: string; paragraphs: string[]; quote: string };
type ReviewResp = { style?: ReviewStyle; persona?: { id: string; name: string; avatar?: string; avatar_color?: string } | null; review: Review };

const STYLE_FALLBACK: ReviewStyle[] = [
  { id: 'gentle', name: '温柔鼓励', icon: '🌿', desc: '温暖而有洞察' },
  { id: 'oldfriend', name: '老友夜谈', icon: '🍵', desc: '犀利却亲切' },
  { id: 'strict', name: '严厉导师', icon: '🔥', desc: '一针见血' },
  { id: 'editor', name: '编辑审稿', icon: '📝', desc: '专业审稿视角' },
  { id: 'reader', name: '读者来信', icon: '💌', desc: '真诚共情' },
  { id: 'award', name: '文学奖评审', icon: '🏆', desc: '庄重有分量' },
];

function scoreColor(score: number) {
  if (score >= 90) return '#b08a3e';
  if (score >= 80) return '#3d6b5c';
  if (score >= 70) return '#4a5a8a';
  if (score >= 60) return '#b3543e';
  return '#7b4f8a';
}

export default function ReviewModal({ projectId, projectTitle, open, onClose, defaultPersonaId }: {
  projectId: string; projectTitle: string; open: boolean; onClose: () => void; defaultPersonaId?: string | null;
}) {
  const [styles, setStyles] = useState<ReviewStyle[]>(STYLE_FALLBACK);
  const [styleId, setStyleId] = useState('gentle');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<string>('');
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [voiceId, setVoiceId] = useState<string>('');
  const [phase, setPhase] = useState<'pick' | 'loading' | 'reveal'>('pick');
  const [review, setReview] = useState<Review | null>(null);
  const [reviewPersona, setReviewPersona] = useState<ReviewResp['persona']>(null);
  const [err, setErr] = useState('');
  const [visibleChars, setVisibleChars] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<any>(null);
  const fullText = useMemo(() => review ? [...(review.paragraphs || []), review.quote ? '—— ' + review.quote : ''].join('\n\n') : '', [review]);
  const selectedVoice = voices.find(v => v.voice_id === voiceId) || null;

  // 打开时加载人设 / 音色，并按作品默认人设预选
  useEffect(() => {
    if (!open) return;
    api.get<{ list: Persona[] }>('/personas?page_size=60').then(d => {
      setPersonas(d.list || []);
      const pid = defaultPersonaId && d.list.some(p => p.id === defaultPersonaId) ? defaultPersonaId : '';
      setPersonaId(pid);
    }).catch(() => {});
    api.get<{ list: VoiceProfile[] }>('/voices?page_size=60').then(d => setVoices(d.list || [])).catch(() => {});
  }, [open, defaultPersonaId]);

  // 选中人设后自动带上 TA 绑定的音色（人设/音色各自异步加载，用 effect 兜底顺序）
  useEffect(() => {
    if (!personaId || !voices.length || !personas.length) return;
    const bind = personas.find(p => p.id === personaId);
    if (!bind?.voice_profile_id) return;
    const vp = voices.find(v => v.id === bind.voice_profile_id);
    if (vp?.voice_id) setVoiceId(vp.voice_id);
  }, [personaId, voices, personas]);

  // 切换人设时自动带上 TA 绑定的音色
  const pickPersona = (pid: string) => {
    setPersonaId(pid);
    const bind = personas.find(p => p.id === pid);
    if (bind?.voice_profile_id) {
      const vp = voices.find(v => v.id === bind.voice_profile_id);
      if (vp?.voice_id) { setVoiceId(vp.voice_id); return; }
    }
    if (!pid) setVoiceId('');
  };

  // 关闭时清理
  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      stopSpeakTTS();
      setPhase('pick'); setReview(null); setReviewPersona(null); setVisibleChars(0); setPlaying(false); setErr('');
    }
  }, [open]);

  useEffect(() => { api.get<{ styles: ReviewStyle[] }>('/review/styles', false).then(d => setStyles(d.styles)).catch(() => {}); }, []);

  const run = async () => {
    setPhase('loading'); setErr('');
    try {
      const d = await api.post<ReviewResp>('/projects/' + projectId + '/review', { style: styleId, persona_id: personaId || undefined });
      setReview(d.review);
      setReviewPersona(d.persona || null);
      setVisibleChars(0);
      setPhase('reveal');
      // 逐字浮现：按 ~45ms/字 分批
      const total = d.review.paragraphs.join('').length + (d.review.quote || '').length + 8;
      const step = Math.max(1, Math.ceil(total / 80));
      timerRef.current = setInterval(() => {
        setVisibleChars(v => {
          const next = v + step;
          if (next >= total) { clearInterval(timerRef.current); return total; }
          return next;
        });
      }, 45);
    } catch (e: any) {
      setErr(e.message || '文评生成失败');
      setPhase('pick');
    }
  };

  const togglePlay = async () => {
    if (playing) { stopSpeakTTS(); setPlaying(false); return; }
    if (!review || !fullText) return;
    const ok = await speakWithTTS(fullText, { onEnd: () => setPlaying(false), onStart: () => setPlaying(true), voiceId: voiceId || undefined });
    if (!ok) setPlaying(true);
  };

  const previewVoice = async () => {
    if (!voiceId) return;
    stopSpeakTTS();
    await speakWithTTS('这是文评的朗读音色试听，愿你笔下的故事，被温柔地读出来。', { voiceId });
  };

  const visibleText = review ? (review.paragraphs.join('\n\n') + (review.quote ? '\n\n—— ' + review.quote : '')).slice(0, visibleChars) : '';

  if (!open) return null;

  const personaLabel = reviewPersona?.name || personas.find(p => p.id === personaId)?.name || '';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-md animate-fade-up" onClick={() => phase !== 'loading' && onClose()}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-accent/20 bg-surface shadow-[0_20px_70px_rgba(0,0,0,0.35)] animate-fade-up" onClick={e => e.stopPropagation()}>
        {/* 顶部装饰光带 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative max-h-[85vh] overflow-y-auto p-6">
          {/* 头部 */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{styles.find(s => s.id === styleId)?.icon || '📜'}</span>
              <div>
                <h3 className="font-serif text-lg font-semibold">文评 · 《{projectTitle}》</h3>
                <p className="text-xs text-ink/45">为你的作品，留下一段认真的话</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink" disabled={phase === 'loading'}>✕</button>
          </div>

          {phase === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-ink/60">选一位「评者」，让 TA 用 TA 的方式读你的作品：</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {styles.map(st => (
                  <button key={st.id} onClick={() => setStyleId(st.id)}
                    className={'flex items-start gap-2.5 rounded-xl border p-3 text-left transition ' + (styleId === st.id ? 'border-accent/50 bg-accentlight/40 shadow-sm' : 'border-ink/10 bg-paper/40 hover:border-accent/30')}>
                    <span className="text-xl">{st.icon}</span>
                    <span>
                      <span className="block text-sm font-medium">{st.name}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-ink/45">{st.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              {/* 评者人设：用助手性格写文评 */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink/60">🎭 评者人设（可选，用 TA 的性格来写）</p>
                {personas.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ink/15 px-3 py-2 text-xs text-ink/35">还没有自定义人设，可用「默认」+ 上方风格直接生成</p>
                ) : (
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    <button onClick={() => pickPersona('')}
                      className={'rounded-full px-3 py-1.5 text-xs transition ' + (!personaId ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/55 hover:bg-ink/10')}>
                      默认（纯风格）
                    </button>
                    {personas.map(p => (
                      <button key={p.id} onClick={() => pickPersona(p.id)}
                        className={'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ' + (personaId === p.id ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/55 hover:bg-ink/10')}>
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.avatar_color || '#8b7d6b' }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 朗读音色 */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink/60">🔊 朗读音色（可选，文评朗读用）</p>
                <div className="flex items-center gap-2">
                  <select value={voiceId} onChange={e => setVoiceId(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-paper/50 px-3 py-2 text-sm text-ink outline-none focus:border-accent/50">
                    <option value="">默认音色</option>
                    {voices.map(v => <option key={v.id} value={v.voice_id}>{v.display_name}{v.is_preset ? '（官方）' : ''}</option>)}
                  </select>
                  {voiceId && (
                    <button onClick={previewVoice} className="shrink-0 rounded-xl bg-accentlight/70 px-3 py-2 text-xs text-ink transition hover:bg-accentlight" title="试听音色">
                      ▶ 试听
                    </button>
                  )}
                </div>
              </div>

              {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
              <button onClick={run} className="w-full rounded-xl bg-ink py-2.5 text-sm font-medium text-paper transition hover:bg-ink/85">
                ✨ 请 TA 写一篇文评
              </button>
            </div>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl text-paper">📜</div>
              </div>
              <p className="mt-4 text-sm text-ink/55">正在细读你的作品…</p>
              <p className="mt-1 text-xs text-ink/35">这一篇，值得慢慢写。</p>
            </div>
          )}

          {phase === 'reveal' && review && (
            <div className="animate-fade-up">
              {/* 评分 + 总评 */}
              <div className="mb-4 flex items-center gap-4 rounded-2xl bg-paper/50 p-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `conic-gradient(${scoreColor(review.score)} ${review.score * 3.6}deg, rgb(var(--ink) / 0.08) 0deg)` }}>
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-surface">
                    <span className="font-serif text-base font-bold" style={{ color: scoreColor(review.score) }}>{review.score}</span>
                    <span className="text-[8px] text-ink/40">分</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-serif text-base font-semibold">{review.summary}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {review.score >= 85 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">很有灵气</span>}
                    {review.score >= 75 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">值得期待</span>}
                    {review.score < 75 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">尚需打磨</span>}
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/45">{styles.find(s => s.id === styleId)?.name}{personaLabel ? ' · ' + personaLabel : ''}</span>
                  </div>
                </div>
              </div>

              {/* 逐字浮现正文 */}
              <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap font-creative text-sm leading-7 text-ink/75">
                {visibleText}
                {visibleChars < (review.paragraphs.join('\n\n').length + (review.quote ? review.quote.length + 3 : 0)) && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-accent/70 align-middle" />}
              </div>

              {/* 操作 */}
              <div className="mt-5 flex items-center gap-2">
                <button onClick={togglePlay}
                  className={'flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition ' + (playing ? 'bg-ink text-paper' : 'bg-accentlight/70 text-ink hover:bg-accentlight')}>
                  {playing ? '⏹ 停止朗读' : '🔊 朗读文评'}
                </button>
                <button onClick={run} className="rounded-full bg-ink/5 px-4 py-2 text-xs text-ink/60 transition hover:bg-ink/10">
                  ↻ 换一种风格
                </button>
                <button onClick={onClose} className="ml-auto rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink/85">收下这篇文评</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
