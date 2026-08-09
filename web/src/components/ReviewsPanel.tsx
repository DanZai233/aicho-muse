// 文评收藏面板：展示收下的文评（内容 / 谁评价的 / 音色信息），可重新朗读或删除
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { speakWithTTS, stopSpeakTTS } from '../lib/speech';

export type SavedReview = {
  id: string; project_id: string; user_id: string;
  style_id: string; style_name: string;
  persona_id: string | null; persona_name: string; persona_avatar?: string; persona_avatar_color?: string;
  voice_id: string | null; voice_name: string;
  score: number; summary: string; paragraphs: string[]; quote: string;
  source?: string; created_at: string;
};

export default function ReviewsPanel({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [reviews, setReviews] = useState<SavedReview[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setReviews((await api.get<{ list: SavedReview[] }>('/projects/' + projectId + '/reviews')).list || []); } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const play = async (r: SavedReview) => {
    if (playingId === r.id || loadingId === r.id) { stopSpeakTTS(); setPlayingId(null); setLoadingId(null); return; }
    const text = [...(r.paragraphs || []), r.quote ? '—— ' + r.quote : ''].join('\n\n');
    setLoadingId(r.id);
    await speakWithTTS(text, {
      voiceId: r.voice_id || undefined,
      onLoading: () => setLoadingId(r.id),
      onStart: () => { setLoadingId(null); setPlayingId(r.id); },
      onEnd: () => { setLoadingId(null); setPlayingId(null); },
    });
    setLoadingId(null);
  };

  const del = async (r: SavedReview) => {
    if (!confirm('删除这条文评？')) return;
    try { await api.del('/reviews/' + r.id); setReviews(prev => prev.filter(x => x.id !== r.id)); onChanged?.(); } catch { /* ignore */ }
  };

  if (reviews.length === 0) {
    return <p className="px-2 py-6 text-center text-xs leading-5 text-ink/35">还没有收下的文评。在顶部点「📜 文评」，写一篇后点「收下」就会留在这里。</p>;
  }

  return (
    <div className="space-y-2.5">
      {reviews.map(r => (
        <div key={r.id} className="rounded-xl border border-ink/8 bg-paper/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-block h-5 w-5 shrink-0 rounded-full font-serif text-[10px] leading-5 text-center text-paper" style={{ background: r.persona_avatar_color || '#8b7d6b' }}>{r.persona_name.slice(0, 1) || '评'}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{r.persona_name || '默认评者'}</span>
                  {r.style_name && <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[9px] text-ink/45">{r.style_name}</span>}
                </div>
                <p className="text-[10px] text-ink/35">{new Date(r.created_at).toLocaleString('zh-CN')} · {r.score} 分{r.voice_name ? ' · 🔊 ' + r.voice_name : ''}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => play(r)} disabled={loadingId === r.id}
                className="rounded-full bg-accentlight/60 px-2.5 py-1 text-[10px] text-ink/70 transition hover:bg-accentlight disabled:opacity-50">
                {loadingId === r.id ? '⏳ 生成中…' : playingId === r.id ? '⏹ 停止' : r.voice_id ? '🔊 朗读' : '▶ 朗读'}
              </button>
              <button onClick={() => del(r)} className="rounded-full px-2 py-1 text-[10px] text-ink/30 transition hover:bg-red-50 hover:text-red-500" title="删除">✕</button>
            </div>
          </div>
          {r.summary && <p className="mt-2 font-serif text-sm font-semibold leading-6 text-ink/80">{r.summary}</p>}
          <div className="mt-1.5 space-y-1.5 whitespace-pre-wrap text-xs leading-6 text-ink/65">
            {(r.paragraphs || []).map((para, i) => <p key={i}>{para}</p>)}
          </div>
          {r.quote && <p className="mt-2 text-xs italic text-ink/45">—— {r.quote}</p>}
        </div>
      ))}
    </div>
  );
}
