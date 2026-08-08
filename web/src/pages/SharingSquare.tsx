// 拾卷：分享书籍广场（无需登录即可浏览阅读）
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ShareInfo, GENRE_LABEL } from '../lib/api';
import BookCover from '../components/BookCover';

const SORTS: [string, string][] = [['newest', '最新发布'], ['likes', '最多点赞']];

export default function SharingSquare() {
  const [list, setList] = useState<ShareInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('newest');
  const [busy, setBusy] = useState(false);

  const load = async (pg = 1, qq = q, gg = genre, ss = sort) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(pg), page_size: '24', sort: ss });
      if (qq.trim()) params.set('q', qq.trim());
      if (gg) params.set('genre', gg);
      const d = await api.get<{ list: ShareInfo[]; total: number }>('/shares?' + params.toString(), false);
      setList(pg === 1 ? d.list : prev => [...prev, ...d.list]);
      setTotal(d.total);
      setPage(pg);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-paper">M</div>
            <span className="font-serif text-lg font-semibold tracking-wide">Aicho Muse</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/shares" className="rounded-lg px-3 py-1.5 font-medium text-accent">拾卷</Link>
            <Link to="/login" className="rounded-lg px-3 py-1.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink">登录</Link>
            <Link to="/login" className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-paper transition hover:bg-accent/90">开始创作</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.35em] text-accent">拾 卷</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">拾起一卷，读一个未完的故事</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/50">
            作者们把作品最鲜活的一刻分享在这里。翻一翻、读一读，给喜欢的故事点个赞。
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, q, genre, sort)}
            placeholder="搜索书名、作者、摘要…" className="w-64 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
          <div className="flex gap-2">
            {SORTS.map(([k, v]) => (
              <button key={k} onClick={() => { setSort(k); load(1, q, genre, k); }}
                className={'rounded-full px-3 py-1.5 text-xs transition ' + (sort === k ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{v}</button>
            ))}
          </div>
          <select value={genre} onChange={e => { setGenre(e.target.value); load(1, q, e.target.value, sort); }}
            className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-xs text-ink/70 outline-none">
            <option value="">全部体裁</option>
            {Object.entries(GENRE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="ml-auto text-xs text-ink/40">{total} 卷</span>
        </div>

        {list.length === 0 && !busy && (
          <div className="rounded-2xl border border-dashed border-ink/15 bg-surface/50 px-6 py-16 text-center text-sm text-ink/40">
            还没有人分享作品。成为第一个把书放进拾卷的人吧。
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(s => (
            <Link key={s.id} to={'/shares/' + s.id}
              className="group flex gap-4 rounded-2xl border border-ink/5 bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
              <BookCover project={{ title: s.title, cover_color: s.cover_color, genre: s.genre } as any} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink/35">{GENRE_LABEL[s.genre] || s.genre} · v{s.version}</span>
                  <span className="text-[10px] text-ink/30">{(s.word_count / 10000).toFixed(1)} 万字</span>
                </div>
                <h3 className="mt-1 truncate font-serif text-lg font-semibold group-hover:text-accent">{s.title}</h3>
                {s.subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-ink/45">{s.subtitle}</p>}
                <p className="mt-0.5 text-[11px] text-ink/35">{s.author_name || s.author?.display_name || '匿名作者'}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-ink/40">
                  <span>👍 {s.like_count}</span>
                  <span>👁 {s.view_count}</span>
                  <span>{s.chapter_count} 章</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {list.length < total && (
          <div className="mt-8 text-center">
            <button onClick={() => load(page + 1)} disabled={busy}
              className="rounded-full bg-accentlight/60 px-5 py-2 text-sm text-ink transition hover:bg-accentlight disabled:opacity-40">
              {busy ? '加载中…' : '再拾几卷（' + list.length + ' / ' + total + '）'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
