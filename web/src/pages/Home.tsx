import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Project, Conversation, LANGUAGES, LANGUAGE_LABEL } from '../lib/api';
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
  const [convVisible, setConvVisible] = useState(6);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('am_onboarded') === '1');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('biography');
  const [language, setLanguage] = useState('zh-CN');
  const [theme, setTheme] = useState('');
  const [cover, setCover] = useState('#8b7d6b');
  const [busy, setBusy] = useState(false);
  const [undoInfo, setUndoInfo] = useState<{ kind: string; id: string; label: string } | null>(null);
  const [assistantName, setAssistantName] = useState('缪斯');

  const load = async () => {
    try {
      const d = await api.get<{ list: Project[]; total: number }>('/projects?page=1&page_size=6');
      setProjects(d.list); setProjTotal(d.total); setProjPage(1);
    } catch { /* 401 handled */ }
    try { setConvs((await api.get<{ list: Conversation[] }>('/conversations')).list); } catch { /* ignore */ }
    try { const st = await api.get<{ settings: { assistant_name?: string } }>('/auth/me/settings'); if (st.settings?.assistant_name) setAssistantName(st.settings.assistant_name); } catch { /* ignore */ }
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
      const d = await api.post<{ project: Project }>('/projects', { title, subtitle, author_name: author, genre, language, theme, cover_color: cover, default_persona_id: 'preset-liwen' });
      setOpen(false); setTitle(''); setSubtitle(''); setAuthor(''); setTheme(''); setLanguage('zh-CN');
      nav('/workspace?project=' + d.project.id);
    } finally { setBusy(false); }
  };

  const deleteProject = async (p: Project) => {
    if (!confirm('删除《' + p.title + '》？30 秒内可撤销。')) return;
    try {
      await api.del('/projects/' + p.id);
      setProjects(prev => prev.filter(x => x.id !== p.id)); setProjTotal(t => t - 1);
      setUndoInfo({ kind: 'project', id: p.id, label: p.title });
      setTimeout(() => setUndoInfo(prev => prev && prev.id === p.id ? null : prev), 30000);
    } catch { /* ignore */ }
  };
  const undoDelete = async () => {
    if (!undoInfo) return;
    try {
      await api.post('/trash/restore', { kind: undoInfo.kind, id: undoInfo.id });
      setUndoInfo(null); load();
    } catch { /* ignore */ }
  };

  const cycleStatus = async (p: Project) => {
    const next = p.status === 'final' ? 'drafting' : p.status === 'reviewed' ? 'final' : 'reviewed';
    try {
      await api.patch('/projects/' + p.id, { status: next });
      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
    } catch { /* ignore */ }
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
                ['① 认识你的' + assistantName, '去「人设」页选一位，或先沿用默认的黎文。', '/personas', '去选人设'],
                ['② 新建一本书', '书名、封面、体裁，一本书从封面开始长出来。', null, '新建作品'],
                ['③ 开口说第一句', '进入作品后点右上「💬 对话」，口述或打字，' + assistantName + ' 会提问、反馈、鼓励你。', null, '知道了'],
              ].map(([title, desc, href, btn], i) => (
                <div key={i} className="rounded-xl bg-surface/70 p-4">
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
              <div key={p.id} className="group relative rounded-2xl border border-ink/5 bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteProject(p); }}
                  className="absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[11px] text-ink/25 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">删除</button>
                <Link to={'/workspace?project=' + p.id} className="flex items-start gap-4">
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
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); cycleStatus(p); }}
                  className="mt-2 text-[11px] text-ink/35 transition hover:text-accent" title="点击推进作品状态：初稿 → 修改中 → 已定稿">
                  {p.status === 'final' ? '✓ 已定稿（点击回到初稿）' : p.status === 'reviewed' ? '● 修改中（点击定稿）' : '○ 初稿（点击进入修改中）'}
                </button>
              </div>
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

        {undoInfo && (
          <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lift animate-fade-up">
            <span>已删除《{undoInfo.label}》</span>
            <button onClick={undoDelete} className="font-medium text-accentlight hover:underline">撤销</button>
            <span className="text-xs text-paper/50">30s</span>
          </div>
        )}

        {convs.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-serif text-xl font-semibold">最近会话</h2>
              <span className="text-xs text-ink/40">继续上次没聊完的创作</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {convs.slice(0, convVisible).map(c => (
                <Link key={c.id} to={'/workspace?project=' + (c.project_id || '') + '&chat=1&conv=' + c.id}
                  className="group flex items-center gap-3 rounded-2xl border border-ink/5 bg-surface/70 px-4 py-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
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
            {convs.length > convVisible && (
              <div className="mt-5 text-center">
                <Button variant="subtle" onClick={() => setConvVisible(v => v + 6)} className="text-sm">加载更多会话（{convs.length - convVisible} 条未显示）</Button>
              </div>
            )}
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
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">作品语言</span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(l => (
                <button key={l} onClick={() => setLanguage(l)}
                  className={'rounded-full px-3 py-1 text-sm transition ' + (language === l ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{LANGUAGE_LABEL[l] || l}</button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-ink/40">AI 将使用该语言与你交流并给出写作建议</span>
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
