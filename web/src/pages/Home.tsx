import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Project, Conversation } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { Button, EmptyState, Modal, Input } from '../components/ui';
import BookCover from '../components/BookCover';

const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [projPage, setProjPage] = useState(1);
  const [projTotal, setProjTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('am_onboarded') === '1');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('biography');
  const [theme, setTheme] = useState('');
  const [cover, setCover] = useState('#8b7d6b');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await api.get<{ list: Project[]; total: number }>('/projects?page=1&page_size=6');
      setProjects(d.list); setProjTotal(d.total); setProjPage(1);
    } catch { /* 401 handled */ }
    try { setConvs((await api.get<{ list: Conversation[] }>('/conversations')).list); } catch { /* ignore */ }
  };
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api.get<{ list: Project[]; total: number }>('/projects?page=' + (projPage + 1) + '&page_size=6');
      setProjects(prev => [...prev, ...d.list]); setProjTotal(d.total); setProjPage(projPage + 1);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const d = await api.post<{ project: Project }>('/projects', { title, subtitle, author_name: author, genre, theme, cover_color: cover, default_persona_id: 'preset-liwen' });
      setOpen(false); setTitle(''); setSubtitle(''); setAuthor(''); setTheme('');
      nav('/workspace?project=' + d.project.id);
    } finally { setBusy(false); }
  };

  const preview: Project = { id: '', title: title || '未命名作品', subtitle, author_name: author, genre, theme: '', target_audience: '', goal_word_count: 0, status: '', default_persona_id: null, cover_color: cover, chapter_count: 0, word_count: 0 };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {!onboarded && (
          <div className="mb-8 rounded-2xl border border-accent/20 bg-accentlight/30 p-5 animate-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">三步开始你的第一本书</h2>
              <button onClick={() => { localStorage.setItem('am_onboarded', '1'); setOnboarded(true); }} className="text-xs text-ink/40 hover:text-ink">知道了，跳过</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['① 认识你的创作教练', '去「人设」页选一位，或先沿用默认的黎文。', '/personas', '去选人设'],
                ['② 新建一本书', '书名、封面、体裁，一本书从封面开始长出来。', null, '新建作品'],
                ['③ 开口说第一句', '进入作品后点右上「💬 对话」，口述或打字，AI 会提问、反馈、鼓励你。', null, '知道了'],
              ].map(([title, desc, href, btn], i) => (
                <div key={i} className="rounded-xl bg-white/70 p-4">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-ink/55">{desc}</p>
                  {href
                    ? <Link to={href as string} className="mt-2 inline-block text-xs text-accent hover:underline">{btn}</Link>
                    : <button onClick={() => { if (i === 1) setOpen(true); else { localStorage.setItem('am_onboarded', '1'); setOnboarded(true); } }} className="mt-2 inline-block text-xs text-accent hover:underline">{btn}</button>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">你好，{user?.display_name}</h1>
            <p className="mt-1 text-ink/50">今天想写点什么？每一本书都从封面开始慢慢长出来。</p>
          </div>
          <Button onClick={() => setOpen(true)}>＋ 新建作品</Button>
        </div>

        {projects.length === 0 ? (
          <EmptyState icon="✍️" title="还没有作品" desc="从一句话、一段回忆开始，让 Aicho Muse 陪你把它写成一本完整的书。"
            action={<Button onClick={() => setOpen(true)}>创建第一本书</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <Link key={p.id} to={'/workspace?project=' + p.id}
                className="group flex items-start gap-4 rounded-2xl border border-ink/5 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <BookCover project={p} size="md" />
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <BadgeText text={GENRE_LABEL[p.genre] || p.genre} />
                    <span className="text-[10px] text-ink/30">{p.status === 'final' ? '已完成' : p.status === 'reviewed' ? '修改中' : '创作中'}</span>
                  </div>
                  <h3 className="mt-2 font-serif text-lg font-semibold leading-snug group-hover:text-accent">{p.title}</h3>
                  {p.subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-ink/45">{p.subtitle}</p>}
                  {p.author_name && <p className="mt-0.5 text-[11px] text-ink/35">{p.author_name} 著</p>}
                  <div className="mt-3 flex items-center justify-between text-xs text-ink/40">
                    <span>{p.chapter_count ?? 0} 章 · {p.word_count ?? 0} 字</span>
                    <span className="text-accent opacity-0 transition group-hover:opacity-100">继续创作 →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        {projects.length > 0 && projects.length < projTotal && (
          <div className="mt-6 text-center">
            <Button variant="subtle" onClick={loadMore} disabled={loadingMore} className="text-sm">
              {loadingMore ? '加载中…' : '加载更多作品（' + projects.length + ' / ' + projTotal + '）'}
            </Button>
          </div>
        )}

        {convs.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-serif text-xl font-semibold">最近会话</h2>
              <span className="text-xs text-ink/40">继续上次没聊完的创作</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {convs.slice(0, 6).map(c => (
                <Link key={c.id} to={'/workspace?project=' + (c.project_id || '') + '&chat=1&conv=' + c.id}
                  className="group flex items-center gap-3 rounded-2xl border border-ink/5 bg-white/70 px-4 py-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold text-paper"
                    style={{ background: c.persona?.avatar_color || '#8b7d6b' }}>
                    {(c.persona?.name || '黎').slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium group-hover:text-accent">{c.title}</div>
                    <div className="truncate text-xs text-ink/45">{c.persona?.name || '黎文'}{c.last_message ? ' · ' + c.last_message : ''}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink/30">{c.project?.title || '未关联作品'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="新建作品">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <BookCover project={preview} size="md" />
            <div className="flex-1 space-y-2">
              <Input label="书名" value={title} onChange={setTitle} placeholder="例如：我的前半生" />
              <Input label="副标题" value={subtitle} onChange={setSubtitle} placeholder="一句话副标题（可选）" />
              <Input label="作者署名" value={author} onChange={setAuthor} placeholder="你的署名（可选）" />
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">体裁</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GENRE_LABEL).map(([k, v]) => (
                <button key={k} onClick={() => setGenre(k)}
                  className={'rounded-full px-3.5 py-1.5 text-sm transition ' + (genre === k ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{v}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">封面颜色</span>
            <div className="flex flex-wrap gap-2">
              {['#8b7d6b', '#b3543e', '#3d6b5c', '#4a5a8a', '#7b4f8a', '#b08a3e'].map(c => (
                <button key={c} onClick={() => setCover(c)}
                  className={'h-8 w-8 rounded-full ring-2 ring-offset-2 transition ' + (cover === c ? 'ring-ink' : 'ring-transparent')} style={{ background: c }} />
              ))}
            </div>
          </label>
          <Input label="主题（一句话）" value={theme} onChange={setTheme} placeholder="例如：一个江南小镇青年的成长" />
          <Button onClick={create} disabled={!title.trim() || busy} className="w-full">{busy ? '创建中…' : '创建这本书'}</Button>
        </div>
      </Modal>
    </Layout>
  );
}

function BadgeText({ text }: { text: string }) {
  return <span className="inline-flex items-center rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/60">{text}</span>;
}
