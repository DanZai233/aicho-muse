import { useState } from 'react';
import { api, Chapter, Message } from '../lib/api';
import { Button } from './ui';

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function normalize(s: string) {
  return s.replace(/[\s，。！？、；：,.!?;:""''「」『』（）()—…·]/g, '').toLowerCase();
}

function isAlreadyIn(body: string[], seg: string) {
  const key = normalize(seg).slice(0, 12);
  if (key.length < 4) return false;
  return body.some(b => normalize(b).includes(key));
}

// 问答性质的段落不进入正文（短问句、寒暄式追问）
function isQaSegment(seg: string) {
  const t = seg.trim();
  if (!t) return true;
  if (/[？?]s*$/.test(t) && t.length <= 40) return true;
  return /^(你觉得|你怎么看|怎么样|要不要|想试试|试试看|感兴趣吗|想听|要不要我)/.test(t);
}

export default function DiffReview({ message, conversationId, chapter, chapters, onAdopted, onClose }: {
  message: Message; conversationId: string; chapter: Chapter | null;
  chapters: Chapter[]; onAdopted: (adoptedText: string, full: boolean) => void; onClose: () => void;
}) {
  const [chapterId, setChapterId] = useState(chapter?.id || 'new');
  const [adopting, setAdopting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bodyParagraphs = chapter ? splitParagraphs(chapter.content) : [];
  const segments = splitParagraphs(message.content);
  const qaFlags = segments.map(isQaSegment);
  const freshSegments = segments.filter((_, i) => !qaFlags[i] && !isAlreadyIn(bodyParagraphs, segments[i]));
  const hasAdoptable = freshSegments.length > 0;
  const isFull = message.adopted_at != null;

  const adopt = async (seg: string, full: boolean) => {
    if (busy || isFull) return;
    setAdopting(full ? '__all__' : seg.slice(0, 20));
    setBusy(true);
    try {
      await api.post('/conversations/' + conversationId + '/adopt', {
        message_id: message.id,
        chapter_id: chapterId === 'new' ? null : chapterId,
        mode: full ? undefined : 'segment',
        text: full ? undefined : seg,
      });
      onAdopted(seg, full);
    } finally {
      setBusy(false); setAdopting(null);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 animate-fade-up">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-emerald-800">✏️ 建议 diff · 绿色为可采纳的新内容</p>
        <button onClick={onClose} className="text-xs text-ink/35 hover:text-ink">✕</button>
      </div>

      <div className="mb-2">
        <select value={chapterId} onChange={e => setChapterId(e.target.value)}
          className="w-full rounded-lg border border-emerald-200 bg-surface px-2.5 py-1.5 text-xs outline-none">
          <option value="new">＋ 写入新章节</option>
          {chapters.map(c => <option key={c.id} value={c.id}>写入：{c.title}</option>)}
        </select>
      </div>

      {isFull ? (
        <p className="rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-700">✓ 整条回复已采纳到文章</p>
      ) : (
        <>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {segments.map((seg, i) => {
              const existing = isAlreadyIn(bodyParagraphs, seg);
              const qa = qaFlags[i];
              return (
                <div key={i} className={'group rounded-lg border px-3 py-2 text-xs leading-5 transition ' + (existing || qa ? 'border-ink/5 bg-surface/70 text-ink/45' : 'border-emerald-300 bg-surface shadow-soft')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={existing ? 'line-through decoration-ink/20' : ''}>{seg}</p>
                    {qa && <span className="shrink-0 text-[10px] text-ink/35">对话内容 · 不写入正文</span>}
                    {!existing && !qa && (
                      <button onClick={() => adopt(seg, false)} disabled={busy}
                        className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                        {adopting === seg.slice(0, 20) ? '写入中…' : '＋ 采纳此段'}
                      </button>
                    )}
                    {existing && <span className="shrink-0 text-[10px] text-emerald-600">✓ 已含</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            {hasAdoptable ? (
              <Button onClick={() => adopt(freshSegments.join('\n\n'), true)} disabled={busy} className="flex-1 text-xs py-2">
                {adopting === '__all__' ? '写入中…' : '采纳全部建议'}
              </Button>
            ) : (
              <p className="flex-1 rounded-lg bg-ink/5 px-3 py-2 text-center text-xs text-ink/40">这条回复没有可写入正文的建议</p>
            )}
            <Button variant="ghost" onClick={onClose} className="text-xs">忽略</Button>
          </div>
        </>
      )}
    </div>
  );
}
