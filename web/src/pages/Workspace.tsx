import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, Project, Chapter, Conversation, Message, Persona, VoiceProfile } from '../lib/api';
import Layout from '../components/Layout';
import { Avatar, Button, Badge, Modal, Input } from '../components/ui';
import MarkdownEditor from '../components/MarkdownEditor';
import { getSpeechRecognition, speak, stopSpeak } from '../lib/speech';

const REPLY_LABEL: Record<string, string> = { question: '提问', feedback: '反馈', suggestion: '建议', encouragement: '鼓励', other: '回复' };
const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };
const TOOL_LABEL: Record<string, string> = { polish: '润色', expand: '扩写', condense: '缩写', continue: '续写', restyle: '风格迁移' };

type StructItem = { id: string; [k: string]: any };

function StructurePanel({ kind, items, setItems, title, addLabel, fields, projectId, onChanged }: {
  kind: 'outline' | 'characters' | 'timeline' | 'ideas';
  items: StructItem[]; setItems: (fn: (prev: StructItem[]) => StructItem[]) => void;
  title: string; addLabel: string;
  fields: { key: string; label: string; placeholder: string; textarea?: boolean }[];
  projectId: string; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const d = await api.post<{ [k: string]: StructItem }>(`/projects/${projectId}/${kind}`, { ...draft });
      const key = { outline: 'node', characters: 'card', timeline: 'event', ideas: 'note' }[kind];
      setItems(prev => [...prev, d[key]]);
      setDraft({}); setOpen(false); onChanged();
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await api.del(`/${kind}/${id}`);
    setItems(prev => prev.filter(i => i.id !== id)); onChanged();
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-xs font-medium text-ink/40">{title}</p>
        <button onClick={() => setOpen(!open)} className="text-xs text-accent hover:underline">{addLabel}</button>
      </div>
      {open && (
        <div className="mb-2 space-y-2 rounded-xl border border-ink/10 bg-paper/70 p-2.5 animate-fade-up">
          {fields.map(f => f.textarea
            ? <Input key={f.key} label={f.label} value={draft[f.key] || ''} onChange={v => setDraft({ ...draft, [f.key]: v })} textarea rows={2} placeholder={f.placeholder} />
            : <Input key={f.key} label={f.label} value={draft[f.key] || ''} onChange={v => setDraft({ ...draft, [f.key]: v })} placeholder={f.placeholder} />)}
          <div className="flex gap-2">
            <Button variant="subtle" onClick={add} disabled={busy || !Object.values(draft).some(v => v)} className="flex-1 text-xs">添加</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-xs">取消</Button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {items.map(i => (
          <div key={i.id} className="group rounded-xl border border-ink/5 bg-white px-3 py-2.5 shadow-soft">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="text-sm font-medium">{i.title || i.name || i.event || i.content?.slice(0, 24)}</div>
                {i.summary && <div className="text-xs text-ink/45 line-clamp-2">{i.summary}</div>}
                {i.description && <div className="text-xs text-ink/45 line-clamp-2">{i.description}</div>}
                {i.role && <Badge color="accent">{i.role}</Badge>}
                {i.when && <div className="mt-0.5 text-xs text-ink/40">⏱ {i.when}</div>}
                {i.tags?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{i.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}</div>}
              </div>
              <button onClick={() => remove(i.id)} className="shrink-0 text-xs text-ink/25 opacity-0 transition group-hover:opacity-100 hover:text-red-500">✕</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="px-2 py-3 text-center text-xs text-ink/30">还没有内容</p>}
      </div>
    </div>
  );
}

export default function Workspace() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const projectId = params.get('project') || '';
  const viewParam = params.get('view') || 'article';

  const [view, setView] = useState<'article' | 'chat'>(viewParam === 'chat' ? 'chat' : 'article');
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [newPersona, setNewPersona] = useState('preset-liwen');
  const [newVoice, setNewVoice] = useState('preset-voice-warm');

  const [leftTab, setLeftTab] = useState<'chapters' | 'outline' | 'characters' | 'timeline' | 'ideas'>('chapters');
  const [outline, setOutline] = useState<StructItem[]>([]);
  const [characters, setCharacters] = useState<StructItem[]>([]);
  const [timeline, setTimeline] = useState<StructItem[]>([]);
  const [ideas, setIdeas] = useState<StructItem[]>([]);
  const [checkIssues, setCheckIssues] = useState<any[]>([]);
  const [checkBusy, setCheckBusy] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const msgsRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollBottom = () => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' });
  const switchView = (v: 'article' | 'chat') => {
    setView(v);
    nav(`/workspace?project=${projectId || ''}&view=${v}`, { replace: true });
  };

  // ---------- 数据加载 ----------
  const loadStructure = useCallback(async (pid: string) => {
    try {
      setOutline((await api.get<{ list: StructItem[] }>(`/projects/${pid}/outline`)).list);
      setCharacters((await api.get<{ list: StructItem[] }>(`/projects/${pid}/characters`)).list);
      setTimeline((await api.get<{ list: StructItem[] }>(`/projects/${pid}/timeline`)).list);
      setIdeas((await api.get<{ list: StructItem[] }>(`/projects/${pid}/ideas`)).list);
    } catch { /* ignore */ }
  }, []);
  const loadProject = useCallback(async (id: string) => {
    const d = await api.get<{ project: Project; chapters: Chapter[] }>(`/projects/${id}`);
    setProject(d.project);
    setChapters(d.chapters);
    loadStructure(id);
    if (!d.chapters.length) {
      const ch = await api.post<{ chapter: Chapter }>(`/projects/${id}/chapters`, { title: '第一章', content: '' });
      setChapters([ch.chapter]); setChapter(ch.chapter);
    } else {
      setChapter(prev => prev && d.chapters.find(c => c.id === prev.id) ? d.chapters.find(c => c.id === prev.id)! : d.chapters[0]);
    }
  }, [loadStructure]);
  const loadConvs = useCallback(async () => {
    try { setConvs((await api.get<{ list: Conversation[] }>('/conversations')).list); } catch { /* ignore */ }
  }, []);
  const loadPersonas = useCallback(async () => {
    try { setPersonas((await api.get<{ list: Persona[] }>('/personas')).list); } catch { /* ignore */ }
  }, []);
  const loadVoices = useCallback(async () => {
    try { setVoices((await api.get<{ list: VoiceProfile[] }>('/voice-profiles')).list); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPersonas(); loadVoices(); loadConvs(); }, []);
  useEffect(() => { if (projectId) loadProject(projectId); }, [projectId, loadProject]);
  useEffect(() => { if (conv) loadMessages(conv.id); }, [conv?.id]);
  useEffect(() => {
    if (!project) return;
    const match = convs.find(c => c.project_id === project.id);
    setConv(prev => prev && convs.find(c => c.id === prev.id) ? prev : (match || null));
  }, [project, convs]);

  const loadMessages = async (cid: string) => {
    try { setMessages((await api.get<{ list: Message[] }>(`/conversations/${cid}/messages?limit=100`)).list); } catch { /* ignore */ }
  };
  const selectConv = async (c: Conversation) => {
    if (streaming) return;
    setConv(c); await loadMessages(c.id);
  };

  // ---------- 会话 ----------
  const createConv = async () => {
    const d = await api.post<{ conversation: Conversation }>('/conversations', {
      project_id: project?.id || null, persona_id: newPersona, voice_profile_id: newVoice,
    });
    setShowNewConv(false); setConv(d.conversation); setMessages([]);
    await loadConvs();
  };

  // ---------- 发送消息 + SSE ----------
  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !conv || streaming) return;
    setInput('');
    setMessages(prev => [...prev, { id: 'local-' + Date.now(), conversation_id: conv.id, role: 'user', content, created_at: new Date().toISOString() }]);
    setStreaming(true); setStreamText('');
    abortRef.current = new AbortController();
    try {
      await api.post(`/conversations/${conv.id}/messages`, { content });
      const resp = await fetch(`/api/v1/conversations/${conv.id}/stream`, { headers: { Authorization: `Bearer ${localStorage.getItem('am_token')}` }, signal: abortRef.current.signal });
      if (!resp.ok || !resp.body) throw new Error('流式连接失败');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = ''; let finalText = ''; let replyType = 'other';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n'); buf = events.pop() || '';
        for (const evt of events) {
          const lines = evt.split('\n');
          const event = lines.find(l => l.startsWith('event:'))?.slice(7).trim();
          const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine);
            if (event === 'text_delta') { setStreamText(p => p + data.delta); finalText += data.delta; }
            else if (event === 'text_done') replyType = data.reply_type || 'other';
            else if (event === 'audio_ready' && data.text) {
              speak(data.text, { rate: data.voice?.params?.rate || 1, pitch: (data.voice?.params?.pitch || 0) / 2 + 1, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
            }
          } catch { /* ignore */ }
        }
      }
      if (finalText) setMessages(prev => [...prev, { id: 'sse-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: finalText, reply_type: replyType, created_at: new Date().toISOString() }]);
    } catch (e: any) {
      if (e.name !== 'AbortError') setMessages(prev => [...prev, { id: 'err-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: `（出错了：${e.message}）`, reply_type: 'other', created_at: new Date().toISOString() }]);
    } finally {
      setStreaming(false); setStreamText('');
      await loadConvs(); if (project) loadProject(project.id);
      scrollBottom();
    }
  };
  const stopStream = () => abortRef.current?.abort();

  // ---------- 语音 ----------
  const toggleRecord = () => {
    const rec = getSpeechRecognition();
    if (!rec) { alert('当前浏览器不支持语音输入，请使用 Chrome/Edge'); return; }
    if (recording) { recRef.current?.stop(); return; }
    stopSpeak(); setSpeaking(false);
    recRef.current = rec; setRecording(true);
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
      setInput(finalText + interim);
    };
    rec.onend = () => { setRecording(false); if (finalText.trim()) send(finalText); };
    rec.onerror = () => setRecording(false);
    rec.start();
  };

  // ---------- 章节 ----------
  const saveChapter = async (ch: Chapter) => {
    const d = await api.patch<{ chapter: Chapter }>(`/chapters/${ch.id}`, { content: ch.content, note: '编辑器自动保存' });
    setChapters(prev => prev.map(c => c.id === d.chapter.id ? d.chapter : c));
    if (project) loadProject(project.id);
  };
  const updateContent = (content: string) => {
    if (!chapter) return;
    const ch = { ...chapter, content, word_count: content.length };
    setChapter(ch); setChapters(prev => prev.map(c => c.id === ch.id ? ch : c));
  };
  const addChapter = async () => {
    if (!project) return;
    const d = await api.post<{ chapter: Chapter }>(`/projects/${project.id}/chapters`, {});
    setChapters(prev => [...prev, d.chapter]); setChapter(d.chapter);
  };
  const deleteChapter = async () => {
    if (!chapter) return;
    if (!confirm(`删除章节「${chapter.title}」？`)) return;
    await api.del(`/chapters/${chapter.id}`);
    const rest = chapters.filter(c => c.id !== chapter.id);
    setChapters(rest); setChapter(rest[0] || null);
    if (project) loadProject(project.id);
  };
  const loadVersions = async () => {
    if (!chapter) return;
    try { setVersions((await api.get<{ list: any[] }>(`/chapters/${chapter.id}/versions`)).list); setShowVersions(true); } catch { /* ignore */ }
  };
  const restoreVersion = async (vid: string) => {
    if (!confirm('恢复到该版本？当前内容会保留为一条新记录。')) return;
    await api.post(`/chapters/${chapter!.id}/restore`, { version_id: vid });
    setShowVersions(false);
    const fresh = (await api.get<{ chapter: Chapter }>(`/chapters/${chapter!.id}`)).chapter;
    setChapter(fresh); setChapters(prev => prev.map(c => c.id === fresh.id ? fresh : c));
  };

  // ---------- 写作工具 ----------
  const [toolMode, setToolMode] = useState<'polish' | 'expand' | 'condense' | 'continue' | 'restyle'>('polish');
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState('');
  const runTool = async (mode: typeof toolMode) => {
    if (!chapter) return;
    setToolMode(mode); setToolBusy(true); setToolResult('');
    try {
      const d = await api.post<{ result: string }>('/tools/rewrite', { chapter_id: chapter.id, mode });
      setToolResult(d.result);
    } catch (e: any) { setToolResult(`出错了：${e.message}`); }
    finally { setToolBusy(false); }
  };
  const applyTool = async () => {
    if (!chapter || !toolResult) return;
    await api.post('/tools/apply', { chapter_id: chapter.id, text: toolResult });
    await loadProject(project!.id);
    const fresh = (await api.get<{ chapter: Chapter }>(`/chapters/${chapter.id}`)).chapter;
    setChapter(fresh); setToolResult('');
  };
  const runCheck = async () => {
    if (!chapter) return;
    setCheckBusy(true); setCheckIssues([]);
    try {
      const d = await api.post<{ issues: any[] }>('/tools/check', { chapter_id: chapter.id });
      setCheckIssues(d.issues);
    } catch (e: any) { setCheckIssues([{ level: 'warn', message: '检查失败：' + e.message }]); }
    finally { setCheckBusy(false); }
  };

  const exportMd = () => {
    if (!project) return;
    const a = document.createElement('a');
    a.href = `/api/v1/export/projects/${project.id}/markdown`; a.download = `${project.title}.md`; a.click();
  };

  return (
    <Layout>
      <div className="mx-auto flex h-[calc(100vh-56px)] max-w-[1400px] overflow-hidden">
        {/* 左栏：项目结构 */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ink/5 bg-white/60 md:flex">
          <div className="border-b border-ink/5 p-4">
            <h2 className="truncate font-serif text-base font-semibold">{project?.title || '选择作品'}</h2>
            {project && <p className="mt-0.5 text-xs text-ink/40">{GENRE_LABEL[project.genre]} · {project.word_count ?? 0} 字</p>}
          </div>
          <div className="flex gap-0.5 border-b border-ink/5 px-2 py-2 text-xs">
            {([['chapters', '章节'], ['outline', '大纲'], ['characters', '人物'], ['timeline', '时间线'], ['ideas', '灵感']] as const).map(([k, v]) => (
              <button key={k} onClick={() => setLeftTab(k)}
                className={`flex-1 rounded-md px-1 py-1.5 transition ${leftTab === k ? 'bg-accentlight/80 font-medium text-ink' : 'text-ink/45 hover:text-ink'}`}>{v}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'chapters' && (
              <>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-xs font-medium text-ink/40">章节</p>
                  <button onClick={addChapter} className="text-xs text-accent hover:underline">＋ 新建</button>
                </div>
                {chapters.map(c => (
                  <button key={c.id} onClick={() => setChapter(c)}
                    className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${chapter?.id === c.id ? 'bg-accentlight/70 text-ink font-medium' : 'text-ink/60 hover:bg-ink/5'}`}>
                    <span className="truncate">{c.title}</span>
                    <span className="ml-2 shrink-0 text-xs text-ink/30">{c.word_count}</span>
                  </button>
                ))}
                <p className="mb-2 mt-6 px-2 text-xs font-medium text-ink/40">会话</p>
                {convs.filter(c => !project || c.project_id === project.id).map(c => (
                  <button key={c.id} onClick={() => { selectConv(c); switchView('chat'); }}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${conv?.id === c.id && view === 'chat' ? 'bg-accentlight/70 font-medium' : 'text-ink/60 hover:bg-ink/5'}`}>
                    <div className="truncate">{c.title}</div>
                    <div className="truncate text-xs text-ink/35">{c.persona?.name || '黎文'}{c.last_message ? ' · ' + c.last_message : ''}</div>
                  </button>
                ))}
                <button onClick={() => setShowNewConv(true)} className="mt-2 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-sm text-ink/40 hover:border-accent hover:text-accent">＋ 新会话</button>
              </>
            )}
            {leftTab === 'outline' && project && (
              <StructurePanel kind="outline" items={outline} setItems={setOutline} title="大纲节点" addLabel="＋ 添加大纲节点"
                fields={[{ key: 'title', label: '标题', placeholder: '例如：离家前夜' }, { key: 'summary', label: '内容概述', placeholder: '这一节发生什么…' }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} />
            )}
            {leftTab === 'characters' && project && (
              <StructurePanel kind="characters" items={characters} setItems={setCharacters} title="人物卡" addLabel="＋ 添加人物"
                fields={[{ key: 'name', label: '姓名', placeholder: '主角名' }, { key: 'role', label: '身份', placeholder: '主角/配角/反派' }, { key: 'description', label: '描述', placeholder: '外貌、性格、背景…', textarea: true }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} />
            )}
            {leftTab === 'timeline' && project && (
              <StructurePanel kind="timeline" items={timeline} setItems={setTimeline} title="时间线" addLabel="＋ 添加事件"
                fields={[{ key: 'when', label: '时间', placeholder: '1987 年夏 / 第三章前' }, { key: 'event', label: '事件', placeholder: '发生了什么…' }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} />
            )}
            {leftTab === 'ideas' && project && (
              <StructurePanel kind="ideas" items={ideas} setItems={setIdeas} title="灵感箱" addLabel="＋ 记录灵感"
                fields={[{ key: 'content', label: '灵感', placeholder: '一句话灵感…', textarea: true }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} />
            )}
          </div>
        </aside>

        {/* 右侧主区：文章 / 对话 独立视图 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* 视图切换 */}
          <div className="flex items-center justify-between border-b border-ink/5 bg-white/70 px-4 py-2">
            <div className="flex rounded-lg bg-ink/5 p-0.5 text-sm">
              <button onClick={() => switchView('article')}
                className={`rounded-md px-4 py-1.5 transition ${view === 'article' ? 'bg-white text-ink shadow-sm font-medium' : 'text-ink/50 hover:text-ink'}`}>📄 文章</button>
              <button onClick={() => switchView('chat')}
                className={`rounded-md px-4 py-1.5 transition ${view === 'chat' ? 'bg-white text-ink shadow-sm font-medium' : 'text-ink/50 hover:text-ink'}`}>💬 对话</button>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink/45">
              {project && <button onClick={exportMd} className="rounded-md px-2.5 py-1 hover:bg-ink/5">⬇ 导出</button>}
              {view === 'article' && chapter && (
                <>
                  <button onClick={loadVersions} className="rounded-md px-2.5 py-1 hover:bg-ink/5">🕘 版本历史</button>
                  <button onClick={() => setShowNewConv(true)} className="rounded-md px-2.5 py-1 hover:bg-ink/5">💬 去对话</button>
                </>
              )}
            </div>
          </div>

          {view === 'article' ? (
            /* ===== 文章视图：全宽 Markdown 编辑器 ===== */
            <div className="flex min-h-0 flex-1">
              {chapter ? (
                <div className="flex min-h-0 flex-1 flex-col bg-white/40">
                  <div className="flex items-center gap-2 border-b border-ink/5 px-5 py-2">
                    <input value={chapter.title} onChange={e => setChapter({ ...chapter, title: e.target.value })}
                      className="w-1/3 min-w-40 bg-transparent font-serif text-base font-semibold outline-none" />
                    <span className="text-xs text-ink/35">{chapter.word_count} 字</span>
                    <Badge>{chapter.status === 'final' ? '已定稿' : chapter.status === 'reviewed' ? '修改中' : '初稿'}</Badge>
                    <button onClick={deleteChapter} className="ml-auto text-xs text-ink/30 hover:text-red-500">删除章节</button>
                  </div>
                  <MarkdownEditor value={chapter.content} onChange={updateContent} onSave={() => saveChapter(chapter)} placeholder="在这一章写下你的故事…（支持 Markdown）" />

                  {/* 底部写作工具条 */}
                  <div className="border-t border-ink/5 bg-white/70 px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-ink/40">AI 工具：</span>
                      {Object.entries(TOOL_LABEL).map(([k, v]) => (
                        <button key={k} onClick={() => runTool(k as any)} disabled={toolBusy || !chapter.content}
                          className={`rounded-full px-3 py-1 text-xs transition disabled:opacity-40 ${toolMode === k && toolResult ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink hover:bg-accentlight'}`}>{v}</button>
                      ))}
                      <button onClick={runCheck} disabled={checkBusy || !chapter.content}
                        className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 transition hover:bg-amber-100 disabled:opacity-40">✓ 一致性检查</button>
                    </div>
                    {checkBusy && <p className="mt-1 text-xs text-ink/40">正在检查…</p>}
                    {checkIssues.length > 0 && (
                      <div className="mt-2 space-y-1 rounded-xl border border-ink/10 bg-paper/60 p-2.5 animate-fade-up">
                        {checkIssues.map((iss, idx) => (
                          <p key={idx} className={`text-xs leading-5 ${iss.level === 'ok' ? 'text-emerald-600' : iss.level === 'warn' ? 'text-amber-700' : 'text-ink/55'}`}>
                            {iss.level === 'ok' ? '✓' : iss.level === 'warn' ? '⚠' : 'ℹ'} {iss.message}
                          </p>
                        ))}
                        <Button variant="ghost" onClick={() => setCheckIssues([])} className="text-xs">关闭</Button>
                      </div>
                    )}
                    {toolResult && (
                      <div className="mt-2 animate-fade-up">
                        <textarea value={toolResult} onChange={e => setToolResult(e.target.value)} rows={5}
                          className="font-creative w-full rounded-lg border border-ink/10 bg-paper/60 px-3 py-2 text-sm leading-6 outline-none" />
                        <div className="mt-1.5 flex gap-2">
                          <Button variant="subtle" onClick={applyTool} className="flex-1 text-xs">应用到章节</Button>
                          <Button variant="ghost" onClick={() => setToolResult('')} className="text-xs">放弃</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-ink/40">
                  <div className="mb-3 text-5xl">📖</div>
                  <p className="text-sm">在左侧新建一个章节开始写作</p>
                </div>
              )}
            </div>
          ) : (
            /* ===== 对话视图：独立全宽聊天 ===== */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-ink/5 bg-white/50 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  {conv?.persona ? <Avatar name={conv.persona.name} color={conv.persona.avatar_color} size="sm" /> : <Avatar name="黎文" size="sm" />}
                  <div>
                    <div className="text-sm font-medium">{conv?.persona?.name || '黎文'}</div>
                    <div className="text-xs text-ink/40">{conv?.persona?.tagline || '安静的倾听者'}{conv?.voice ? ' · ' + conv.voice.display_name : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {speaking && <Button variant="subtle" onClick={() => { stopSpeak(); setSpeaking(false); }}>■ 停止朗读</Button>}
                  {streaming && <Button variant="subtle" onClick={stopStream}>停止生成</Button>}
                  <Button variant="ghost" onClick={() => setShowNewConv(true)}>新会话</Button>
                  {project && <Button variant="ghost" onClick={() => switchView('article')}>回到文章</Button>}
                </div>
              </div>

              <div ref={msgsRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
                {messages.length === 0 && !streaming && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Avatar name={conv?.persona?.name || '黎文'} color={conv?.persona?.avatar_color} size="lg" />
                    <h3 className="mt-4 font-serif text-xl font-semibold">{conv?.persona?.tagline || '今天想讲点什么？我在听。'}</h3>
                    <p className="mt-1 max-w-sm text-sm text-ink/40">口述或输入一段回忆、一个故事想法，我会陪你把它展开。</p>
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-ink/5 bg-white shadow-soft'}`}>
                      {m.role === 'assistant' && m.reply_type && (
                        <div className="mb-1.5 flex items-center gap-2">
                          <Badge color={m.reply_type === 'encouragement' ? 'green' : m.reply_type === 'question' ? 'accent' : m.reply_type === 'feedback' ? 'amber' : 'default'}>{REPLY_LABEL[m.reply_type] || '回复'}</Badge>
                          {m.source === 'rules' && <span className="text-[10px] text-ink/30">内置教练</span>}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.role === 'assistant' && (
                        <div className="mt-2">
                          <button onClick={() => speak(m.content, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })} className="text-xs text-accent hover:underline">🔊 朗读</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {streaming && (
                  <div className="flex justify-start animate-fade-up">
                    <div className="max-w-[78%] rounded-2xl rounded-bl-md border border-ink/5 bg-white px-4 py-3 shadow-soft">
                      {streamText ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamText}</div>
                        : <div className="flex gap-1 py-1"><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /></div>}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-ink/5 bg-white/50 p-3">
                <div className="flex items-end gap-2">
                  <button onClick={toggleRecord} title={recording ? '停止录音' : '语音输入'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${recording ? 'bg-red-500 text-white animate-pulse' : 'bg-accentlight text-ink hover:bg-accent/20'}`}>
                    {recording ? '⏹' : '🎤'}
                  </button>
                  <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1}
                    placeholder={recording ? '正在聆听…' : '说点什么，或输入文字…（Enter 发送）'}
                    className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
                  <button onClick={() => send()} disabled={!input.trim() || streaming || !conv}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition hover:bg-ink/85 disabled:opacity-40">↑</button>
                </div>
                {!conv && <p className="mt-2 text-center text-xs text-ink/40">先创建一个会话，开始与你的创作教练对话</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 新会话弹窗 */}
      <Modal open={showNewConv} onClose={() => setShowNewConv(false)} title="新的创作会话">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">选择人设</span>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {personas.map(p => (
                <button key={p.id} onClick={() => setNewPersona(p.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${newPersona === p.id ? 'bg-accentlight/70' : 'hover:bg-ink/5'}`}>
                  <Avatar name={p.name} color={p.avatar_color} size="sm" />
                  <div><div className="font-medium">{p.name}</div><div className="text-xs text-ink/40">{p.tagline}</div></div>
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">选择声色</span>
            <div className="flex flex-wrap gap-2">
              {voices.map(v => (
                <button key={v.id} onClick={() => setNewVoice(v.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition ${newVoice === v.id ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}>{v.display_name}</button>
              ))}
            </div>
          </label>
          <Button onClick={createConv} className="w-full">开始对话</Button>
        </div>
      </Modal>

      {/* 版本历史弹窗 */}
      <Modal open={showVersions} onClose={() => setShowVersions(false)} title={`版本历史 · ${chapter?.title || ''}`} wide>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {versions.length === 0 && <p className="py-6 text-center text-sm text-ink/40">还没有历史版本，编辑章节后自动生成</p>}
          {versions.map(v => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border border-ink/5 bg-paper/50 px-4 py-2.5">
              <div>
                <div className="text-sm font-medium">{v.note || '编辑'}</div>
                <div className="text-xs text-ink/40">{new Date(v.created_at).toLocaleString()} · {v.content?.length || 0} 字</div>
              </div>
              <Button variant="subtle" onClick={() => restoreVersion(v.id)} className="text-xs">恢复</Button>
            </div>
          ))}
        </div>
      </Modal>
    </Layout>
  );
}
