// 拾卷详情：无需登录阅读分享书籍；登录后可以点赞
import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, ShareInfo, GENRE_LABEL } from '../lib/api';
import BookCover from '../components/BookCover';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/ui';

export default function SharedBook() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [err, setErr] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.get<ShareInfo>('/shares/' + id, false);
        setShare(d); setLiked(!!d.liked_by_me); setLikeCount(d.like_count || 0);
      } catch (e: any) { setErr(e.message || '分享不存在'); }
    })();
  }, [id]);

  const toggleLike = async () => {
    const token = localStorage.getItem('am_token');
    if (!token) { nav('/login?next=/shares/' + id); return; }
    try {
      const d = await api.post<{ liked: boolean; like_count: number }>('/shares/' + id + '/like', {});
      setLiked(d.liked); setLikeCount(d.like_count);
    } catch { /* ignore */ }
  };

  if (err) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
        <div className="text-4xl">📜</div>
        <h1 className="mt-3 font-serif text-xl font-semibold">这一卷已经不在拾卷里了</h1>
        <p className="mt-1 text-sm text-ink/50">{err}</p>
        <Link to="/shares" className="mt-5 rounded-lg bg-accent px-5 py-2 text-sm text-paper">回到拾卷</Link>
      </div>
    );
  }
  if (!share) return <div className="flex min-h-screen items-center justify-center bg-paper text-ink/40">正在翻开这一卷…</div>;

  const chapters = share.chapters || [];
  const active = chapters[activeIdx];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-paper">M</div>
            <span className="font-serif text-lg font-semibold tracking-wide">Aicho Muse</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/shares" className="rounded-lg px-3 py-1.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink">拾卷广场</Link>
            {user ? (
              <>
                <Link to="/workspace" className="rounded-lg px-3 py-1.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink">工作台</Link>
                <Avatar name={user.display_name} size="sm" />
                <button onClick={logout} className="rounded-lg px-2.5 py-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">退出</button>
              </>
            ) : (
              <Link to="/login" className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-paper transition hover:bg-accent/90">开始创作</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <BookCover project={{ title: share.title, cover_color: share.cover_color, genre: share.genre } as any} size="lg" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <span className="text-[11px] text-ink/35">{GENRE_LABEL[share.genre] || share.genre}</span>
              <span className="text-[11px] text-ink/35">· 第 {share.version} 版</span>
              <span className="text-[11px] text-ink/35">· 发布于 {new Date(share.republished_at).toLocaleDateString('zh-CN')}</span>
            </div>
            <h1 className="mt-2 font-serif text-3xl font-semibold">{share.title}</h1>
            {share.subtitle && <p className="mt-1 text-ink/50">{share.subtitle}</p>}
            <p className="mt-2 text-sm text-ink/45">{share.author_name || share.author?.display_name || '匿名作者'} 著</p>
            {share.abstract && <p className="mt-3 rounded-xl bg-surface/60 p-3 text-sm leading-6 text-ink/60">{share.abstract}</p>}
            {share.keywords?.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {share.keywords.map(k => <span key={k} className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-ink/55">{k}</span>)}
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-4 sm:justify-start">
              <button onClick={toggleLike}
                className={'rounded-full px-4 py-1.5 text-sm transition ' + (liked ? 'bg-accent text-paper' : 'bg-accentlight/60 text-ink hover:bg-accentlight')}>
                {liked ? '❤ 已收藏 ' + likeCount : '🤍 收藏 ' + likeCount}
              </button>
              <span className="text-xs text-ink/40">👁 {share.view_count} 次阅读</span>
              <span className="text-xs text-ink/40">📖 {share.chapter_count} 章 · {(share.word_count / 10000).toFixed(1)} 万字</span>
            </div>
          </div>
        </div>

        {chapters.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
            <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-ink/5 bg-surface/60 p-3 lg:sticky lg:top-20">
              <p className="mb-2 px-1 text-xs font-medium text-ink/40">目录</p>
              {chapters.map((c, i) => (
                <button key={i} onClick={() => setActiveIdx(i)}
                  className={'mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ' + (i === activeIdx ? 'bg-accentlight/80 font-medium text-ink' : 'text-ink/55 hover:bg-ink/5')}>
                  <span className="truncate">{i + 1}. {c.title}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-ink/30">{c.content.length} 字</span>
                </button>
              ))}
            </aside>
            <article className="min-w-0 rounded-xl border border-ink/5 bg-surface/80 px-6 py-8 shadow-soft">
              <h2 className="font-serif text-xl font-semibold">{active?.title}</h2>
              <div className="mt-5 whitespace-pre-wrap font-creative text-base leading-8 text-ink/80">{active?.content || '（这一章还是空白，作者把想象留在了这里。）'}</div>
              <div className="mt-8 flex items-center justify-between border-t border-ink/5 pt-4 text-sm">
                <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0}
                  className="rounded-lg px-3 py-1.5 text-ink/50 transition hover:bg-ink/5 disabled:opacity-30">← 上一章</button>
                <span className="text-xs text-ink/35">{activeIdx + 1} / {chapters.length}</span>
                <button onClick={() => setActiveIdx(i => Math.min(chapters.length - 1, i + 1))} disabled={activeIdx === chapters.length - 1}
                  className="rounded-lg px-3 py-1.5 text-ink/50 transition hover:bg-ink/5 disabled:opacity-30">下一章 →</button>
              </div>
            </article>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-ink/15 bg-surface/50 px-6 py-14 text-center text-sm text-ink/40">
            这本书还没有正文。也许作者正在酝酿，稍后再来看看。
          </div>
        )}
        <div className="mt-10 text-center">
          <Link to="/shares" className="text-sm text-accent hover:underline">← 回到拾卷广场</Link>
        </div>
      </main>
    </div>
  );
}
