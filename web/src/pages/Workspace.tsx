import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Project, Chapter, Conversation, Message, Persona, VoiceProfile } from '../lib/api';
import Layout from '../components/Layout';
import { Avatar, Button, Badge, Modal, Input } from '../components/ui';
import { getSpeechRecognition, speak, stopSpeak } from '../lib/speech';

const REPLY_LABEL: Record<string, string> = { question: '提问', feedback: '反馈', suggestion: '建议', encouragement: '鼓励', other: '回复' };

export default function Workspace() {
  const [params] = useSearchParams();
  const projectId = params.get('project') || '';

  const [projects, setProjects] = useState<Project[]>([]);
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

  const msgsRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollBottom = () => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' });

  // ---------- 基础数据 ----------
  const loadProjects = useCallback(async () => {
    try { setProjects((await api.get<{ list: Project[] }>('/projects')).list); } catch { /* ignore */ }
  }, []);
  const loadProject = useCallback(async (id: string) => {
    const d = await api.get<{ project: Project; chapters: Chapter[] }>(`/projects/${id}`);
    setProject(d.project);
    setChapters(d.chapters);
    if (!d.chapters.length) {
      const ch = await api.post<{ chapter: Chapter }>(`/projects/${id}/chapters`, { title: '第一章', content: '' });
      setChapters([ch.chapter]); setChapter(ch.chapter);
    } else {
      setChapter(prev => prev && d.chapters.find(c => c.id === prev.id) ? d.chapters.find(c => c.id === prev.id)! : d.chapters[0]);
    }
  }, []);
  const loadConvs = useCallback(async () => {
    try { setConvs((await api.get<{ list: Conversation[] }>('/conversations')).list); } catch { /* ignore */ }
  }, []);
  const loadPersonas = useCallback(async () => {
    try { setPersonas((await api.get<{ list: Persona[] }>('/personas')).list); } catch { /* ignore */ }
  }, []);
  const loadVoices = useCallback(async () => {
    try { setVoices((await api.get<{ list: VoiceProfile[] }>('/voice-profiles')).list); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadProjects(); loadPersonas(); loadVoices(); loadConvs(); }, []);
  useEffect(() => { if (projectId) loadProject(projectId); }, [projectId]);
  useEffect(() => { if (conv) loadMessages(conv.id); }, [conv?.id]);

  // 切换项目时同步默认会话
  useEffect(() => {
    if (!project) return;
    const match = convs.find(c => c.project_id === project.id);
    setConv(match || null);
  }, [project, convs]);

  const loadMessages = async (cid: string) => {
    try { setMessages((await api.get<{ list: Message[] }>(`/conversations/${cid}/messages?limit=100`)).list); } catch { /* ignore */ }
  };

  const selectConv = async (c: Conversation) => {
    if (streaming) return;
    setConv(c);
    await loadMessages(c.id);
  };

  // ---------- 创建会话 ----------
  const createConv = async () => {
    const d = await api.post<{ conversation: Conversation }>('/conversations', {
      project_id: project?.id || null, persona_id: newPersona, voice_profile_id: newVoice,
    });
    setShowNewConv(false);
    setConv(d.conversation);
    setMessages([]);
    await loadConvs();
  };

  // ---------- 发送消息 + SSE ----------
  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !conv || streaming) return;
    setInput('');
    const userMsg: Message = { id: 'local-' + Date.now(), conversation_id: conv.id, role: 'user', content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamText('');
    abortRef.current = new AbortController();
    try {
      await api.post(`/conversations/${conv.id}/messages`, { content });
      const resp = await fetch(`/api/v1/conversations/${conv.id}/stream`, { headers: { Authorization: `Bearer ${localStorage.getItem('am_token')}` }, signal: abortRef.current.signal });
      if (!resp.ok || !resp.body) throw new Error('流式连接失败');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalText = '';
      let replyType = 'other';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const evt of events) {
          const lines = evt.split('\n');
          const event = lines.find(l => l.startsWith('event:'))?.slice(7).trim();
          const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine);
            if (event === 'text_delta') { setStreamText(prev => prev + data.delta); finalText += data.delta; }
            else if (event === 'text_done') { replyType = data.reply_type || 'other'; }
            else if (event === 'audio_ready' && data.text) {
              const voice = data.voice;
              speak(data.text, { rate: voice?.params?.rate || 1, pitch: (voice?.params?.pitch || 0) / 2 + 1, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
            }
          } catch { /* ignore partial */ }
        }
      }
      if (finalText) {
        setMessages(prev => [...prev, { id: 'sse-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: finalText, reply_type: replyType, created_at: new Date().toISOString() }]);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setMessages(prev => [...prev, { id: 'err-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: `（出错了：${e.message}）`, reply_type: 'other', created_at: new Date().toISOString() }]);
    } finally {
      setStreaming(false);
      setStreamText('');
      await loadConvs();
      if (project) loadProject(project.id);
      scrollBottom();
    }
  };

  const stopStream = () => abortRef.current?.abort();

  // ---------- 语音输入 ----------
  const toggleRecord = () => {
    const rec = getSpeechRecognition();
    if (!rec) { alert('当前浏览器不支持语音输入，请使用 Chrome/Edge'); return; }
    if (recording) { recRef.current?.stop(); return; }
    recRef.current = rec;
    setRecording(true);
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      setInput(finalText + interim);
    };
    rec.onend = () => { setRecording(false); if (finalText.trim()) send(finalText); };
    rec.onerror = () => { setRecording(false); };
    rec.start();
  };

  // ---------- 章节编辑 ----------
  const saveChapter = async (ch: Chapter) => {
    const d = await api.patch<{ chapter: Chapter }>(`/chapters/${ch.id}`, { content: ch.content });
    setChapters(prev => prev.map(c => c.id === d.chapter.id ? d.chapter : c));
    if (project) loadProject(project.id);
  };

  const updateContent = (content: string) => {
    if (!chapter) return;
    const ch = { ...chapter, content, word_count: content.length };
    setChapter(ch);
    setChapters(prev => prev.map(c => c.id === ch.id ? ch : c));
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
    setChapter(fresh);
    setToolResult('');
  };

  // ---------- 导出 ----------
  const exportMd = () => {
    if (!project) return;
    const url = `/api/v1/export/projects/${project.id}/markdown`;
    const a = document.createElement('a');
    a.href = url; a.download = `${project.title}.md`;
    a.click();
  };

  const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };

  return (
    <Layout>
      <div className="mx-auto flex h-[calc(100vh-56px)] max-w-7xl gap-0 overflow-hidden">
        {/* 左侧：项目结构 */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-ink/5 bg-white/60 md:flex">
          <div className="border-b border-ink/5 p-4">
            <h2 className="truncate font-serif text-base font-semibold">{project?.title || '选择作品'}</h2>
            {project && <p className="mt-0.5 text-xs text-ink/40">{GENRE_LABEL[project.genre]} · {project.word_count ?? 0} 字</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-2 text-xs font-medium text-ink/40">章节</p>
            {chapters.map(c => (
              <button key={c.id} onClick={() => setChapter(c)}
                className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${chapter?.id === c.id ? 'bg-accentlight/70 text-ink font-medium' : 'text-ink/60 hover:bg-ink/5'}`}>
                <span className="truncate">{c.title}</span>
                <span className="ml-2 shrink-0 text-xs text-ink/30">{c.word_count}</span>
              </button>
            ))}
            <button onClick={async () => { if (project) { const d = await api.post<{ chapter: Chapter }>(`/projects/${project.id}/chapters`, {}); setChapters(prev => [...prev, d.chapter]); setChapter(d.chapter); } }}
              className="mt-2 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-sm text-ink/40 hover:border-accent hover:text-accent">＋ 新建章节</button>
            <p className="mb-2 mt-6 px-2 text-xs font-medium text-ink/40">会话</p>
            {convs.filter(c => !project || c.project_id === project.id).map(c => (
              <button key={c.id} onClick={() => selectConv(c)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${conv?.id === c.id ? 'bg-accentlight/70 font-medium' : 'text-ink/60 hover:bg-ink/5'}`}>
                <div className="truncate">{c.title}</div>
                <div className="truncate text-xs text-ink/35">{c.persona?.name || '黎文'}{c.last_message ? ' · ' + c.last_message : ''}</div>
              </button>
            ))}
            <button onClick={() => setShowNewConv(true)} className="mt-2 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-sm text-ink/40 hover:border-accent hover:text-accent">＋ 新会话</button>
          </div>
        </aside>

        {/* 中间：对话区 */}
        <section className="flex min-w-0 flex-1 flex-col">
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
              {project && <Button variant="ghost" onClick={() => setShowNewConv(true)}>新会话</Button>}
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
        </section>

        {/* 右侧：作品编辑区 */}
        <aside className="hidden w-96 shrink-0 flex-col border-l border-ink/5 bg-white/60 lg:flex">
          {chapter ? (
            <>
              <div className="flex items-center justify-between border-b border-ink/5 px-4 py-2.5">
                <input value={chapter.title} onChange={e => setChapter({ ...chapter, title: e.target.value })}
                  className="w-48 bg-transparent font-serif text-sm font-semibold outline-none" />
                <div className="flex items-center gap-1 text-xs text-ink/35">
                  <span>{chapter.word_count} 字</span>
                  <Badge>{chapter.status === 'final' ? '已定稿' : chapter.status === 'reviewed' ? '修改中' : '初稿'}</Badge>
                </div>
              </div>
              <textarea value={chapter.content} onChange={e => updateContent(e.target.value)} onBlur={() => saveChapter(chapter)}
                placeholder="在这一章写下你的故事…"
                className="font-creative flex-1 resize-none bg-transparent px-5 py-4 text-[15px] leading-8 outline-none" />
              <div className="border-t border-ink/5 p-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(['polish', 'expand', 'condense', 'continue', 'restyle'] as const).map(m => (
                    <button key={m} onClick={() => runTool(m)} disabled={toolBusy || !chapter.content}
                      className={`rounded-full px-3 py-1 text-xs transition disabled:opacity-40 ${toolMode === m && toolResult ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink hover:bg-accentlight'}`}>
                      {{ polish: '润色', expand: '扩写', condense: '缩写', continue: '续写', restyle: '风格迁移' }[m]}
                    </button>
                  ))}
                </div>
                {toolBusy && <p className="text-xs text-ink/40">正在处理…</p>}
                {toolResult && (
                  <div className="animate-fade-up">
                    <textarea value={toolResult} onChange={e => setToolResult(e.target.value)} rows={6}
                      className="font-creative w-full rounded-lg border border-ink/10 bg-paper/60 px-3 py-2 text-sm leading-6 outline-none" />
                    <div className="mt-2 flex gap-2">
                      <Button variant="subtle" onClick={applyTool} className="flex-1">应用到章节</Button>
                      <Button variant="ghost" onClick={() => setToolResult('')}>放弃</Button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-ink/5 pt-2">
                  <Button variant="ghost" onClick={exportMd} className="text-xs">⬇ 导出 Markdown</Button>
                  <Button variant="ghost" onClick={() => runTool('polish')} className="text-xs">保存</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-ink/40">
              <div className="mb-3 text-4xl">📖</div>
              <p className="text-sm">选择左侧的章节，或新建作品</p>
            </div>
          )}
        </aside>
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
    </Layout>
  );
}
