import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { Button, EmptyState, Modal, Input, Badge } from '../components/ui';

const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('biography');
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setProjects((await api.get<{ list: Project[] }>('/projects')).list); } catch { /* 401 handled */ }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const d = await api.post<{ project: Project }>('/projects', { title, genre, theme, default_persona_id: 'preset-liwen' });
      setOpen(false); setTitle(''); setTheme('');
      nav(`/workspace?project=${d.project.id}`);
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">你好，{user?.display_name}</h1>
            <p className="mt-1 text-ink/50">今天想写点什么？</p>
          </div>
          <Button onClick={() => setOpen(true)}>＋ 新建作品</Button>
        </div>

        {projects.length === 0 ? (
          <EmptyState icon="✍️" title="还没有作品" desc="从一句话、一段回忆开始，让 Aicho Muse 陪你把它写成作品。"
            action={<Button onClick={() => setOpen(true)}>创建第一个作品</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <Link key={p.id} to={`/workspace?project=${p.id}`}
                className="group rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-4 flex items-start justify-between">
                  <div className="h-12 w-12 rounded-xl" style={{ background: p.cover_color || '#8b7d6b' }} />
                  <Badge>{GENRE_LABEL[p.genre] || p.genre}</Badge>
                </div>
                <h3 className="font-serif text-lg font-semibold group-hover:text-accent">{p.title}</h3>
                {p.theme && <p className="mt-1 line-clamp-2 text-sm text-ink/50">{p.theme}</p>}
                <div className="mt-4 flex items-center justify-between text-xs text-ink/40">
                  <span>{p.chapter_count ?? 0} 章 · {p.word_count ?? 0} 字</span>
                  <span className="text-accent opacity-0 transition group-hover:opacity-100">继续创作 →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="新建作品">
        <div className="space-y-4">
          <Input label="作品标题" value={title} onChange={setTitle} placeholder="例如：我的前半生" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">体裁</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GENRE_LABEL).map(([k, v]) => (
                <button key={k} onClick={() => setGenre(k)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition ${genre === k ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}>{v}</button>
              ))}
            </div>
          </label>
          <Input label="主题（一句话）" value={theme} onChange={setTheme} placeholder="例如：一个江南小镇青年的成长" />
          <Button onClick={create} disabled={!title.trim() || busy} className="w-full">{busy ? '创建中…' : '创建并开始创作'}</Button>
        </div>
      </Modal>
    </Layout>
  );
}
