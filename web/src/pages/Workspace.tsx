import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, Project, Chapter, Conversation, Message, Persona, VoiceProfile, Citation, ReferenceDoc, ShareInfo, LANGUAGES, LANGUAGE_LABEL } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { Avatar, Button, Badge, Modal, Input, Spinner } from '../components/ui';
import MarkdownEditor from '../components/MarkdownEditor';
import BookCover from '../components/BookCover';
import DiffReview from '../components/DiffReview';
import RemoteCursors, { colorForMember } from '../components/presence/RemoteCursors';
import OnlineAvatars from '../components/presence/OnlineAvatars';
import { usePresence } from '../lib/usePresence';
import { measureCaret } from '../lib/caret';
import { getSpeechRecognition, startQuietRecording, speak, stopSpeak, stopSpeakTTS, speakWithTTS, interruptSpeech } from '../lib/speech';
import { saveDraft, getDraft, clearDraft, listPending } from '../lib/drafts';
import CitationsPanel from '../components/CitationsPanel';
import PaperInfoPanel from '../components/PaperInfoPanel';
import ReferenceDocsPanel from '../components/ReferenceDocsPanel';
import RelationshipGraph from '../components/RelationshipGraph';
import ReviewModal from '../components/ReviewModal';
import MemoryLinkModal from '../components/MemoryLinkModal';
import ReviewsPanel from '../components/ReviewsPanel';

const REPLY_LABEL: Record<string, string> = { question: '提问', feedback: '反馈', suggestion: '建议', encouragement: '鼓励', guide: '引导', writing: '写作稿', other: '回复' };
const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本', paper: '论文' };
const TOOL_LABEL: Record<string, string> = { polish: '润色', expand: '扩写', condense: '缩写', continue: '续写', restyle: '风格迁移' };
// 只有带正文建议的回复可进入 diff 与采纳（提问/鼓励/其他不写入文章）
const ADOPTABLE_TYPES = new Set(['suggestion', 'feedback', 'writing']);
const isAdoptable = (t?: string) => !!t && ADOPTABLE_TYPES.has(t);

type StructItem = { id: string; [k: string]: any };

function StructurePanel({ kind, items, setItems, title, addLabel, fields, projectId, onChanged, onAI, onSuggest, emptyHint = '还没有内容', chapters }: {
  kind: 'outline' | 'characters' | 'timeline' | 'ideas';
  items: StructItem[]; setItems: (fn: (prev: StructItem[]) => StructItem[]) => void;
  title: string; addLabel: string;
  fields: { key: string; label: string; placeholder: string; textarea?: boolean }[];
  projectId: string; onChanged: () => void; emptyHint?: string; chapters?: { id: string; title: string; order_index: number }[];
  onAI?: (kind: 'outline' | 'characters', id: string, item: StructItem) => void;
  onSuggest?: (kind: 'outline' | 'characters' | 'timeline') => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const d = await api.post<{ [k: string]: StructItem }>('/projects/' + projectId + '/' + kind, { ...draft, chapter_id: draft.chapter_id || null });
      const key = { outline: 'node', characters: 'card', timeline: 'event', ideas: 'note' }[kind];
      setItems(prev => [...prev, d[key]]);
      setDraft({}); setOpen(false); onChanged();
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await api.del('/' + kind + '/' + id);
    setItems(prev => prev.filter(i => i.id !== id)); onChanged();
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-xs font-medium text-ink/40">{title}</p>
        <div className="flex items-center gap-2">
          {onSuggest && kind !== 'ideas' && (
            <button onClick={() => onSuggest(kind)} title="让 AI 给出创作建议"
              className="text-xs text-accent/80 hover:text-accent hover:underline">✨ AI 建议</button>
          )}
          <button onClick={() => setOpen(!open)} className="text-xs text-accent hover:underline">{addLabel}</button>
        </div>
      </div>
      {open && (
        <div className="mb-2 space-y-2 rounded-xl border border-ink/10 bg-paper/70 p-2.5 animate-fade-up">
          {fields.map(f => f.textarea
            ? <Input key={f.key} label={f.label} value={draft[f.key] || ''} onChange={v => setDraft({ ...draft, [f.key]: v })} textarea rows={2} placeholder={f.placeholder} />
            : <Input key={f.key} label={f.label} value={draft[f.key] || ''} onChange={v => setDraft({ ...draft, [f.key]: v })} placeholder={f.placeholder} />)}
          {kind === 'outline' && chapters && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink/60">关联章节（可选）</span>
              <select value={draft.chapter_id || ''} onChange={e => setDraft({ ...draft, chapter_id: e.target.value })} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none">
                <option value="">暂不关联</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="subtle" onClick={add} disabled={busy || !Object.values(draft).some(v => v)} className="flex-1 text-xs">添加</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-xs">取消</Button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {items.map(i => (
          <div key={i.id} className="group rounded-xl border border-ink/5 bg-surface px-3 py-2.5 shadow-soft">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="text-sm font-medium">{i.title || i.name || i.event || i.content?.slice(0, 24)}</div>
                {i.summary && <div className="text-xs text-ink/45 line-clamp-2">{i.summary}</div>}
                {i.description && <div className="text-xs text-ink/45 line-clamp-2">{i.description}</div>}
                {i.role && <Badge color="accent">{i.role}</Badge>}
                {i.when && <div className="mt-0.5 text-xs text-ink/40">⏱ {i.when}</div>}
                {i.tags?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{i.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(kind === 'outline' || kind === 'characters') && onAI && (
                  <button onClick={() => onAI(kind, i.id, i)} title="AI 生成 / 润色"
                    className="text-xs text-accent/70 opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-accent">✨</button>
                )}
                <button onClick={() => remove(i.id)} className="text-xs text-ink/25 opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500">✕</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="px-2 py-3 text-center text-xs leading-5 text-ink/30">{emptyHint}</p>}
      </div>
    </div>
  );
}

export default function Workspace() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const projectId = params.get('project') || '';
  const convParam = params.get('conv') || '';
  const [redirecting, setRedirecting] = useState(false);


  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const { token, user: me } = useAuth();
  // 协作内容同步：本地输入防抖后广播；远端内容在本地未输入时应用（避免覆盖正在写的内容）
  const localEditAtRef = useRef(0);
  const chapterIdRef = useRef('');
  chapterIdRef.current = chapter?.id || '';
  const contentSendTimer = useRef<any>(null);
  const handleRemoteContent = useCallback((_memberId: string, content: string) => {
    if (Date.now() - localEditAtRef.current < 1200) return; // 本地正在输入，跳过远端覆盖
    const cid = chapterIdRef.current;
    if (!cid) return;
    setChapter(prev => (prev && prev.id === cid) ? { ...prev, content, word_count: content.length } : prev);
    setChapters(prev => prev.map(c => c.id === cid ? { ...c, content, word_count: content.length } : c));
  }, []);
  const { peers, cursors, reportCursor, sendContent } = usePresence(projectId, chapter?.id || '', token || '', handleRemoteContent);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingTrans, setPendingTrans] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<{ assistant_name?: string; tts_rate: number; tts_pitch: number; auto_send: boolean; read_aloud: boolean } | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [newPersona, setNewPersona] = useState('');
  const [newVoice, setNewVoice] = useState('');

  const [chatOpen, setChatOpen] = useState(params.get('chat') === '1');
  const [bookView, setBookView] = useState<'write' | 'preview'>('write');
  const [diffMsg, setDiffMsg] = useState<Message | null>(null);
  const [showCover, setShowCover] = useState(false);
  const [coverDraft, setCoverDraft] = useState({ title: '', subtitle: '', author_name: '', cover_color: '#8b7d6b' });
  const [showProjSettings, setShowProjSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [invite, setInvite] = useState<{ active?: boolean; code?: string; role?: string; expires?: string; note?: string } | null>(null);
  const [collabs, setCollabs] = useState<{ user_id: string; role: string; display_name: string; email?: string }[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [collabMsg, setCollabMsg] = useState('');
  const [projDraft, setProjDraft] = useState({ genre: 'biography', language: 'zh-CN', theme: '', target_audience: '', goal_word_count: 0, team_persona_ids: [] as string[] });

  const [aiItem, setAiItem] = useState<{ kind: 'outline' | 'characters'; id: string; item: StructItem } | null>(null);
  const [aiMode, setAiMode] = useState<'generate' | 'polish'>('generate');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [suggestKind, setSuggestKind] = useState<'outline' | 'characters' | 'timeline' | null>(null);
  const [suggestList, setSuggestList] = useState<any[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestErr, setSuggestErr] = useState('');
  const [suggestMsg, setSuggestMsg] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [leftTab, setLeftTab] = useState<'book' | 'outline' | 'characters' | 'timeline' | 'ideas' | 'citations' | 'refs' | 'reviews'>('book');
  const [outline, setOutline] = useState<StructItem[]>([]);
  const [characters, setCharacters] = useState<StructItem[]>([]);
  const [timeline, setTimeline] = useState<StructItem[]>([]);
  const [ideas, setIdeas] = useState<StructItem[]>([]);
  const [checkIssues, setCheckIssues] = useState<any[]>([]);
  const [checkBusy, setCheckBusy] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [saveVerBusy, setSaveVerBusy] = useState(false);
  const [saveVerMsg, setSaveVerMsg] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [adoptDone, setAdoptDone] = useState<string | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ kind: string; id: string; label: string } | null>(null);
  const [draftRestored, setDraftRestored] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPersonaCard, setShowPersonaCard] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [showPaperInfo, setShowPaperInfo] = useState(false);
  const [paperInfoKey, setPaperInfoKey] = useState(0);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [linkedMems, setLinkedMems] = useState<string[]>([]);
  const [refDocs, setRefDocs] = useState<ReferenceDoc[]>([]);
  const [refUploadBusy, setRefUploadBusy] = useState(false);
  const [refMsg, setRefMsg] = useState('');
  const [pickedRefs, setPickedRefs] = useState<string[]>([]);
  const [showRefPicker, setShowRefPicker] = useState(false);

  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoPlayedRef = useRef(false);

  const scrollBottom = () => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' });

  const loadStructure = useCallback(async (pid: string) => {
    try {
      setOutline((await api.get<{ list: StructItem[] }>('/projects/' + pid + '/outline')).list);
      setCharacters((await api.get<{ list: StructItem[] }>('/projects/' + pid + '/characters')).list);
      setTimeline((await api.get<{ list: StructItem[] }>('/projects/' + pid + '/timeline')).list);
      setIdeas((await api.get<{ list: StructItem[] }>('/projects/' + pid + '/ideas')).list);
    } catch { /* ignore */ }
  }, []);
  const loadProject = useCallback(async (id: string) => {
    const d = await api.get<{ project: Project; chapters: Chapter[] }>('/projects/' + id);
    setProject(d.project);
    setChapters(d.chapters);
    loadStructure(id);
    setPaperInfoKey(k => k + 1);
    try {
      const sd = await api.get<{ share: ShareInfo | null }>('/shares/by-project/' + id);
      setShareInfo(sd.share);
      const rd = await api.get<{ list: ReferenceDoc[] }>('/projects/' + id + '/reference-docs');
      setRefDocs(rd.list);
    } catch { /* ignore */ }
    if (d.project.genre === 'paper') {
      try { setCitations((await api.get<{ list: Citation[] }>('/projects/' + id + '/citations')).list); } catch { /* ignore */ }
    }
    if (!d.chapters.length) {
      const ch = await api.post<{ chapter: Chapter }>('/projects/' + id + '/chapters', { title: d.project.genre === 'paper' ? '引言' : '第一章', content: '' });
      setChapters([ch.chapter]); setChapter(ch.chapter);
    } else {
      setChapter(prev => {
        const ch = prev && d.chapters.find(c => c.id === prev.id) ? d.chapters.find(c => c.id === prev.id)! : d.chapters[0];
        const pending = getDraft(ch.id);
        if (pending && (pending.content !== ch.content || pending.title !== ch.title)) {
          queueMicrotask(() => {
            setDraftRestored('已恢复「' + pending.title + '」的离线草稿');
            setTimeout(() => setDraftRestored(null), 4000);
          });
          return { ...ch, content: pending.content, title: pending.title, word_count: pending.content.length };
        }
        return ch;
      });
    }
  }, [loadStructure]);
  const loadConvs = useCallback(async () => {
    try { setConvs((await api.get<{ list: Conversation[] }>('/conversations')).list); } catch { /* ignore */ }
  }, []);
  const loadPersonas = useCallback(async () => {
    try {
      const list = (await api.get<{ list: Persona[] }>('/personas')).list;
      setPersonas(list);
      const elysia = list.find(p => p.name.includes('爱莉希雅'));
      setNewPersona(prev => prev || elysia?.id || list.find(p => p.is_preset)?.id || list[0]?.id || '');
    } catch { /* ignore */ }
  }, []);
  const loadVoices = useCallback(async () => {
    try {
      const list = (await api.get<{ list: VoiceProfile[] }>('/voice-profiles')).list;
      setVoices(list);
      const elysia = list.find(v => v.display_name.includes('爱莉希雅'));
      setNewVoice(prev => prev || elysia?.id || list.find(v => v.is_preset)?.id || list[0]?.id || '');
    } catch { /* ignore */ }
  }, []);
  const loadPrefs = useCallback(async () => {
    try { setPrefs((await api.get<{ settings: { assistant_name?: string; tts_rate: number; tts_pitch: number; auto_send: boolean; read_aloud: boolean } }>('/auth/me/settings')).settings); } catch { setPrefs({ assistant_name: '缪斯', tts_rate: 1, tts_pitch: 1, auto_send: false, read_aloud: true }); }
  }, []);

  useEffect(() => { loadPersonas(); loadVoices(); loadConvs(); loadPrefs(); }, []);
  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
      return;
    }
    if (redirecting) return;
    setRedirecting(true);
    (async () => {
      try {
        const d = await api.get<{ list: Project[] }>('/projects?page=1&page_size=20');
        const list = d.list || [];
        if (list.length > 0) {
          nav('/workspace?project=' + list[0].id, { replace: true });
        } else {
          nav('/', { replace: true });
        }
      } catch {
        nav('/', { replace: true });
      }
    })();
  }, [projectId, loadProject, nav, redirecting]);
  useEffect(() => { if (conv) loadMessages(conv.id); }, [conv?.id]);
  useEffect(() => {
    const flush = async () => {
      for (const d of listPending()) {
        try {
          await api.patch('/chapters/' + d.id, { content: d.content, note: '离线草稿同步' });
          clearDraft(d.id);
        } catch { /* 仍离线则保留 */ }
      }
    };
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);
  useEffect(() => {
    if (!project) return;
    const match = convs.find(c => c.project_id === project.id);
    setConv(prev => {
      if (prev && convs.find(c => c.id === prev.id)) {
        if (prev.linked_project_ids) setLinkedMems(prev.linked_project_ids);
        return prev;
      }
      const target = convParam ? convs.find(c => c.id === convParam) : null;
      const next = target || match || null;
      if (next?.linked_project_ids) setLinkedMems(next.linked_project_ids);
      return next;
    });
  }, [project, convs, convParam]);

  const loadMessages = async (cid: string) => {
    try { setMessages((await api.get<{ list: Message[] }>('/conversations/' + cid + '/messages?limit=100')).list); } catch { /* ignore */ }
  };
  const selectConv = async (c: Conversation) => {
    if (streaming) return;
    setConv(c); await loadMessages(c.id); setDiffMsg(null); setChatOpen(true);
  };

  const openConvPicker = () => {
    if (conv) {
      setNewPersona(conv.persona_id || '');
      setNewVoice(conv.voice_profile_id || conv.effective_voice?.id || '');
    } else {
      setNewPersona(''); setNewVoice('');
    }
    setShowNewConv(true);
  };

  const createConv = async () => {
    if (conv) {
      // 当前已有会话：应用新选择（人设/音色）到本会话，保留消息
      const d = await api.patch<{ conversation: Conversation }>('/conversations/' + conv.id, {
        persona_id: newPersona || undefined,
        voice_profile_id: newVoice || null,
      });
      setConv(d.conversation);
      setShowNewConv(false);
      await loadConvs();
      return;
    }
    const d = await api.post<{ conversation: Conversation }>('/conversations', {
      project_id: project?.id || null, persona_id: newPersona, voice_profile_id: newVoice,
    });
    setShowNewConv(false); setConv(d.conversation); setMessages([]); setChatOpen(true);
    await loadConvs();
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !conv || streaming) return;
    interruptSpeech(); setSpeaking(false);
    setInput(''); setPendingTrans(null);
    setMessages(prev => [...prev, { id: 'local-' + Date.now(), conversation_id: conv.id, role: 'user', content, created_at: new Date().toISOString() }]);
    setStreaming(true); setStreamText('');
    abortRef.current = new AbortController();
    try {
      await api.post('/conversations/' + conv.id + '/messages', { content, reference_doc_ids: pickedRefs });
      const resp = await fetch('/api/v1/conversations/' + conv.id + '/stream', { headers: { Authorization: 'Bearer ' + localStorage.getItem('am_token') }, signal: abortRef.current.signal });
      if (!resp.ok || !resp.body) throw new Error('流式连接失败');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = ''; let finalText = ''; let replyType = 'other'; let finalMsgId = '';
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
            else if (event === 'text_done') { replyType = data.reply_type || 'other'; finalMsgId = data.message_id || ''; }
            else if (event === 'audio_ready' && data.text) {
              autoPlayedRef.current = true;
              autoSpeak(data.text, finalMsgId, { rate: data.voice?.params?.rate ?? prefs?.tts_rate ?? 1, pitch: (data.voice?.params?.pitch ?? 0) / 2 + (prefs?.tts_pitch ?? 1) });
            }
          } catch { /* ignore */ }
        }
      }
      if (finalText) {
        setMessages(prev => [...prev, { id: finalMsgId || 'sse-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: finalText, reply_type: replyType, created_at: new Date().toISOString() }]);
        if (prefs?.read_aloud && !autoPlayedRef.current) autoSpeak(finalText, finalMsgId || 'sse-' + Date.now());
      }
      autoPlayedRef.current = false;
    } catch (e: any) {
      if (e.name !== 'AbortError') setMessages(prev => [...prev, { id: 'err-' + Date.now(), conversation_id: conv.id, role: 'assistant', content: '（出错了：' + e.message + '）', reply_type: 'other', created_at: new Date().toISOString() }]);
    } finally {
      setStreaming(false); setStreamText('');
      await loadConvs(); if (project) loadProject(project.id);
      scrollBottom();
    }
  };
  const stopStream = () => abortRef.current?.abort();

  // 播放一条助手回复：TTS 生成期间置 loading（禁用播放按钮），生成完成自动播放
  const speakMessage = (m: { id: string; content: string }) => {
    if (ttsLoadingId) return;
    const voiceId = conv?.effective_voice?.voice_id || conv?.voice?.voice_id || undefined;
    setTtsLoadingId(m.id);
    speakWithTTS(m.content, {
      rate: prefs?.tts_rate ?? 1,
      pitch: prefs?.tts_pitch ?? 1,
      voiceId,
      onLoading: () => setTtsLoadingId(m.id),
      onStart: () => { setTtsLoadingId(null); setSpeaking(true); setSpeakingId(m.id); },
      onEnd: () => { setSpeaking(false); setSpeakingId(null); },
    }).finally(() => setTtsLoadingId(cur => cur === m.id ? null : cur));
  };

  // 自动播放（audio_ready / read_aloud），避免重复生成
  const autoSpeak = (text: string, msgId: string, opts?: { rate?: number; pitch?: number }) => {
    const voiceId = conv?.effective_voice?.voice_id || conv?.voice?.voice_id || undefined;
    setTtsLoadingId(msgId);
    speakWithTTS(text, {
      rate: opts?.rate ?? prefs?.tts_rate ?? 1,
      pitch: opts?.pitch ?? prefs?.tts_pitch ?? 1,
      voiceId,
      onLoading: () => setTtsLoadingId(msgId),
      onStart: () => { setTtsLoadingId(null); setSpeaking(true); setSpeakingId(msgId); },
      onEnd: () => { setSpeaking(false); setSpeakingId(null); },
    }).finally(() => setTtsLoadingId(cur => cur === msgId ? null : cur));
  };

  const toggleRecord = () => {
    if (recording) { recRef.current?.stop(); return; }
    if (!navigator.onLine) {
      setNotice('当前处于离线状态，语音功能暂不可用，可以继续打字写作');
      setTimeout(() => setNotice(null), 4000);
      return;
    }
    interruptSpeech(); setSpeaking(false);
    const rec = startQuietRecording(
      (t) => setInput(t),
      (final) => {
        setRecording(false); setInput('');
        if (final) {
          if (prefs?.auto_send) send(final);
          else setPendingTrans(final);
        }
      },
      { quietMs: 2000 }
    );
    if (!rec) { alert('当前浏览器不支持语音输入，请使用 Chrome/Edge'); return; }
    recRef.current = rec; setRecording(true);
  };
  const confirmTrans = (go: boolean) => {
    const t = pendingTrans;
    setPendingTrans(null);
    if (go && t) send(t);
  };

  const saveChapter = async (ch: Chapter) => {
    try {
      const d = await api.patch<{ chapter: Chapter }>('/chapters/' + ch.id, { content: ch.content, note: '编辑器自动保存' });
      clearDraft(ch.id);
      setChapters(prev => prev.map(c => c.id === d.chapter.id ? d.chapter : c));
    } catch {
      saveDraft(ch.id, ch.content, ch.title);
      setDraftRestored('当前处于离线状态，内容已保存在本地，联网后自动同步');
      setTimeout(() => setDraftRestored(null), 4000);
    }
    if (project) loadProject(project.id);
  };
  const updateContent = (content: string) => {
    if (!chapter) return;
    localEditAtRef.current = Date.now();
    const ch = { ...chapter, content, word_count: content.length };
    setChapter(ch); setChapters(prev => prev.map(c => c.id === ch.id ? ch : c));
    if (contentSendTimer.current) clearTimeout(contentSendTimer.current);
    contentSendTimer.current = setTimeout(() => sendContent(content), 500);
  };

  // 论文模式：在正文光标处插入引用标记 [n]
  const insertCitationMark = (idx: number) => {
    if (!chapter) return;
    const mark = '[' + idx + ']';
    const ta = editorRef.current;
    if (!ta) { updateContent((chapter.content ? chapter.content + ' ' : '') + mark); return; }
    const start = ta.selectionStart ?? chapter.content.length;
    const end = ta.selectionEnd ?? start;
    updateContent(chapter.content.slice(0, start) + mark + chapter.content.slice(end));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + mark.length, start + mark.length); });
  };

  // 实时光标：本地选择变化 → 节流上报 offset + scrollTop
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const handleEditorSelection = useCallback(() => {
    const ta = editorRef.current;
    if (!ta) return;
    const offset = ta.selectionStart;
    const selection = ta.selectionStart !== ta.selectionEnd
      ? { start: ta.selectionStart, end: ta.selectionEnd }
      : null;
    reportCursor(offset, selection, ta.scrollTop);
  }, [reportCursor]);

  // 远端光标坐标：基于本地 textarea 与远端 offset 计算
  const measureRemoteCursor = useCallback((memberId: string) => {
    const ta = editorRef.current;
    const cur = cursors[memberId];
    if (!ta || !cur) return null;
    try {
      return measureCaret(ta, cur.cursor.offset);
    } catch {
      return null;
    }
  }, [cursors]);

  const remoteCursors = useMemo(
    () => (
      <RemoteCursors
        cursors={Object.values(cursors)}
        measure={measureRemoteCursor}
      />
    ),
    // 本地文档内容变化时远端光标的 offset 需要按新文档重新计算坐标
    [cursors, measureRemoteCursor, chapter?.content],
  );
  const addChapter = async () => {
    if (!project) return;
    const d = await api.post<{ chapter: Chapter }>('/projects/' + project.id + '/chapters', {});
    setChapters(prev => [...prev, d.chapter]); setChapter(d.chapter);
  };

  // 分享到拾卷：创建当前状态快照（发布后原作品修改不影响已分享内容）
  const publishShare = async () => {
    if (!project) return;
    setShareBusy(true); setShareMsg('');
    try {
      const d = await api.post<{ share: ShareInfo; already?: boolean }>('/shares', { project_id: project.id });
      setShareInfo(d.share);
      setShareMsg(d.already ? '这本书已经在拾卷里了 ✓' : '已分享到拾卷 v1 ✓');
      setTimeout(() => setShareMsg(''), 4000);
    } catch (e: any) { setShareMsg(e.message || '发布失败'); setTimeout(() => setShareMsg(''), 5000); }
    finally { setShareBusy(false); }
  };
  const republishShare = async () => {
    if (!shareInfo) return;
    setShareBusy(true); setShareMsg('');
    try {
      const d = await api.post<{ share: ShareInfo }>('/shares/' + shareInfo.id + '/republish', {});
      setShareInfo(d.share);
      setShareMsg('已再发版 v' + d.share.version + ' ✓');
      setTimeout(() => setShareMsg(''), 4000);
    } catch (e: any) { setShareMsg(e.message || '再发版失败'); setTimeout(() => setShareMsg(''), 5000); }
    finally { setShareBusy(false); }
  };
  const unshare = async () => {
    if (!shareInfo || !confirm('确定把这本书从拾卷下架？')) return;
    try {
      await api.del('/shares/' + shareInfo.id);
      setShareInfo(null); setShareMsg('已从拾卷下架');
      setTimeout(() => setShareMsg(''), 4000);
    } catch { /* ignore */ }
  };

  // 参考文章：上传大文本自动分块入知识库
  const uploadRef = async (file: File, title: string) => {
    if (!project) return;
    setRefUploadBusy(true); setRefMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      const d = await api.upload<{ doc: ReferenceDoc; chunk_count: number }>('/projects/' + project.id + '/reference-docs', fd);
      setRefDocs(prev => [d.doc, ...prev]);
      setRefMsg('已导入《' + d.doc.title + '》（' + d.chunk_count + ' 段）✓');
      setTimeout(() => setRefMsg(''), 5000);
    } catch (e: any) { setRefMsg(e.message || '导入失败'); setTimeout(() => setRefMsg(''), 6000); }
    finally { setRefUploadBusy(false); }
  };
  const deleteRef = async (id: string, title: string) => {
    if (!confirm('删除参考文章《' + title + '》？')) return;
    try {
      await api.del('/reference-docs/' + id);
      setRefDocs(prev => prev.filter(x => x.id !== id));
      setPickedRefs(prev => prev.filter(x => x !== id));
    } catch { /* ignore */ }
  };
  const cycleChapterStatus = async () => {
    if (!chapter) return;
    const next = chapter.status === 'final' ? 'draft' : chapter.status === 'reviewed' ? 'final' : 'reviewed';
    try {
      const d = await api.patch<{ chapter: Chapter }>('/chapters/' + chapter.id, { status: next });
      setChapter(d.chapter); setChapters(prev => prev.map(c => c.id === d.chapter.id ? d.chapter : c));
    } catch { /* ignore */ }
  };

  const deleteConv = async (cid: string, label: string) => {
    if (!confirm('删除会话「' + label + '」？会话消息将一并删除，章节内容不受影响。')) return;
    try {
      await api.del('/conversations/' + cid);
      setConvs(prev => prev.filter(x => x.id !== cid));
      if (conv?.id === cid) { setConv(null); setMessages([]); }
    } catch { /* ignore */ }
  };

  const deleteChapter = async () => {
    if (!chapter) return;
    if (!confirm('删除章节「' + chapter.title + '」？30 秒内可撤销。')) return;
    const removed = chapter;
    await api.del('/chapters/' + chapter.id);
    const rest = chapters.filter(c => c.id !== chapter.id);
    setChapters(rest); setChapter(rest[0] || null);
    if (project) loadProject(project.id);
    setUndoInfo({ kind: 'chapter', id: removed.id, label: removed.title });
    setTimeout(() => setUndoInfo(prev => prev && prev.id === removed.id ? null : prev), 30000);
  };
  const undoDelete = async () => {
    if (!undoInfo) return;
    try {
      await api.post('/trash/restore', { kind: undoInfo.kind, id: undoInfo.id });
      setUndoInfo(null);
      if (project) loadProject(project.id);
    } catch { /* ignore */ }
  };
  const loadVersions = async () => {
    if (!chapter) return;
    try { setVersions((await api.get<{ list: any[] }>('/chapters/' + chapter.id + '/versions')).list); setShowVersions(true); } catch { /* ignore */ }
  };
  const restoreVersion = async (vid: string) => {
    if (!confirm('恢复到该版本？当前内容会保留为一条新记录。')) return;
    await api.post('/chapters/' + chapter!.id + '/restore', { version_id: vid });
    setShowVersions(false);
    const fresh = (await api.get<{ chapter: Chapter }>('/chapters/' + chapter!.id)).chapter;
    setChapter(fresh); setChapters(prev => prev.map(c => c.id === fresh.id ? fresh : c));
  };
  const saveVersion = async () => {
    if (!chapter) return;
    setSaveVerBusy(true); setSaveVerMsg('');
    try {
      const d = await api.post<{ pushed: boolean; unchanged: boolean }>('/chapters/' + chapter.id + '/save-version', { note: '手动保存' });
      setSaveVerMsg(d.pushed ? '✅ 已保存一个新版本' : 'ℹ️ 内容与上一版本相同，未重复保存');
      setTimeout(() => setSaveVerMsg(''), 3000);
    } catch (e: any) {
      setSaveVerMsg('⚠️ ' + (e.message || '保存失败'));
      setTimeout(() => setSaveVerMsg(''), 3000);
    } finally {
      setSaveVerBusy(false);
    }
  };

  const [toolMode, setToolMode] = useState<'polish' | 'expand' | 'condense' | 'continue' | 'restyle'>('polish');
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState('');
  const [toolDiff, setToolDiff] = useState<{ type: string; old?: string; new?: string }[]>([]);
  const runTool = async (mode: typeof toolMode) => {
    if (!chapter) return;
    setToolMode(mode); setToolBusy(true); setToolResult(''); setToolDiff([]);
    try {
      const d = await api.post<{ result: string; diff?: { type: string; old?: string; new?: string }[] }>('/tools/rewrite', { chapter_id: chapter.id, mode });
      setToolResult(d.result); setToolDiff(d.diff || []);
    } catch (e: any) { setToolResult('出错了：' + e.message); }
    finally { setToolBusy(false); }
  };
  const applyTool = async () => {
    if (!chapter || !toolResult) return;
    await api.post('/tools/apply', { chapter_id: chapter.id, text: toolResult });
    await loadProject(project!.id);
    const fresh = (await api.get<{ chapter: Chapter }>('/chapters/' + chapter.id)).chapter;
    setChapter(fresh); setToolResult(''); setToolDiff([]);
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

  const handleAdopted = async (adoptedText: string, full: boolean) => {
    if (!diffMsg) return;
    setMessages(prev => prev.map(m => m.id === diffMsg.id ? { ...m, adopted_at: new Date().toISOString() } : m));
    setDiffMsg(null);
    setAdoptDone(full ? '✓ 已采纳全部到文章' : '✓ 已采纳一段到文章');
    setTimeout(() => setAdoptDone(null), 3000);
    if (project) loadProject(project.id);
    await loadConvs();
  };

  const openCover = () => {
    if (!project) return;
    setCoverDraft({ title: project.title, subtitle: project.subtitle || '', author_name: project.author_name || '', cover_color: project.cover_color });
    setShowCover(true);
  };
  const saveCover = async () => {
    if (!project || !coverDraft.title.trim()) return;
    const d = await api.patch<{ project: Project }>('/projects/' + project.id, { ...coverDraft });
    setProject(d.project); setShowCover(false);
    if (project) loadProject(project.id);
  };

  const openProjSettings = () => {
    if (!project) return;
    setProjDraft({ genre: project.genre, language: project.language || 'zh-CN', theme: project.theme || '', target_audience: project.target_audience || '', goal_word_count: project.goal_word_count || 0, team_persona_ids: project.team_persona_ids || [] });
    setShowProjSettings(true);
    setInvite(null); setCollabs([]); loadInvite();
  };
  const openShare = () => {
    if (!project) return;
    setInvite(null); setCollabs([]); setCollabMsg(''); loadInvite();
    setShowShare(true);
  };
  const loadInvite = async () => {
    if (!project) return;
    try {
      const d = await api.get<{ active?: boolean; code?: string; role?: string; expires?: string; note?: string }>('/projects/' + project.id + '/invite');
      setInvite(d);
    } catch { setInvite(null); }
    try {
      const c = await api.get<{ list: { user_id: string; role: string; display_name: string; email?: string }[] }>('/projects/' + project.id + '/collaborators');
      setCollabs(c.list);
    } catch { /* viewer 无权查看 */ }
  };
  const genInvite = async (role?: string) => {
    if (!project) return;
    setInviteBusy(true); setCollabMsg('');
    try {
      const d = await api.post<{ code: string; role: string; expires: string; note?: string }>('/projects/' + project.id + '/invite', { role: role || invite?.role || 'editor' });
      setInvite({ active: true, ...d });
      setCollabMsg('邀请码已生成，7 天内有效');
    } catch (e: any) { setCollabMsg(e.message || '生成失败'); }
    finally { setInviteBusy(false); }
  };
  const copyInvite = async () => {
    if (!invite?.code) return;
    try { await navigator.clipboard.writeText(invite.code); setCollabMsg('邀请码已复制'); } catch { setCollabMsg('请手动复制邀请码：' + invite.code); }
  };
  const changeCollab = async (uid: string, role?: string, remove?: boolean) => {
    if (!project) return;
    try {
      await api.patch('/projects/' + project.id + '/collaborators/' + uid, { role, remove });
      loadInvite();
    } catch (e: any) { setCollabMsg(e.message || '操作失败'); }
  };

  const runAI = async () => {
    if (!aiItem || !project) return;
    setAiBusy(true); setAiErr('');
    try {
      const d = await api.post<{ result: string }>('/' + aiItem.kind + '/' + aiItem.id + '/ai/' + aiMode, { prompt: aiPrompt });
      setAiResult(d.result);
    } catch (e: any) { setAiErr(e.message || 'AI 处理失败'); }
    finally { setAiBusy(false); }
  };
  const applyAI = async () => {
    if (!aiItem || !project || !aiResult.trim()) return;
    try {
      const lines = aiResult.split(/\n+/).map(x => x.trim()).filter(Boolean);
      if (aiItem.kind === 'outline') {
        if (aiMode === 'generate') {
          // 生成：每一行按「标题：摘要」解析为一条新大纲节点
          const created: StructItem[] = [];
          for (const line of lines) {
            const ci = Math.max(line.indexOf('：'), line.indexOf(':'));
            const title = ci > 0 ? line.slice(0, ci).trim() : (line || '新节点');
            const summary = ci > 0 ? line.slice(ci + 1).trim() : '';
            const d = await api.post<{ node: StructItem }>('/projects/' + project.id + '/outline', { title: title || '新节点', summary });
            created.push(d.node);
          }
          if (created.length) setOutline(prev => [...prev, ...created]);
        } else {
          // 润色：AI 只返回摘要正文，整体作为新摘要
          await api.patch('/outline/' + aiItem.id, { summary: lines.join('\n') || aiResult });
          loadStructure(project.id);
        }
      } else {
        if (aiMode === 'generate') {
          // 生成：每一行按「姓名（角色）：描述」解析为一张新人物卡
          const created: StructItem[] = [];
          for (const line of lines) {
            const m = line.match(/^(.+?)[（(]([^）)]+)[)）]\s*[:：]?\s*([\s\S]*)$/);
            const name = (m && m[1].trim()) || line.slice(0, 12) || '新角色';
            const role = (m && m[2].trim()) || '配角';
            const description = (m && m[3].trim()) || line;
            const d = await api.post<{ card: StructItem }>('/projects/' + project.id + '/characters', { name, role, description });
            created.push(d.card);
          }
          if (created.length) setCharacters(prev => [...prev, ...created]);
        } else {
          // 润色：AI 只返回人物描述，整体作为新描述
          await api.patch('/characters/' + aiItem.id, { description: lines.join('\n') || aiResult });
          loadStructure(project.id);
        }
      }
      setAiItem(null); setAiResult(''); setAiPrompt(''); loadStructure(project.id);
    } catch (e: any) { setAiErr(e.message || '应用失败'); }
  };

  // AI 建议：打开面板并拉取建议
  const openSuggest = async (kind: 'outline' | 'characters' | 'timeline') => {
    if (!project) return;
    setSuggestKind(kind); setSuggestList([]); setSuggestErr(''); setSuggestMsg(''); setSuggestBusy(true);
    try {
      const d = await api.post<{ list: any[] }>('/projects/' + project.id + '/ai-suggest', { kind });
      setSuggestList(d.list || []);
    } catch (e: any) { setSuggestErr(e.message || 'AI 建议生成失败'); }
    finally { setSuggestBusy(false); }
  };

  // 保留一条建议：type=add 创建新项；update 更新对应项；note 作为灵感箱记录
  const applySuggestion = async (sg: any) => {
    if (!project) return;
    try {
      if (suggestKind === 'outline') {
        if (sg.type === 'add') {
          const d = await api.post<{ node: StructItem }>('/projects/' + project.id + '/outline', { title: sg.title || '新节点', summary: sg.summary || '' });
          setOutline(prev => [...prev, d.node]);
        } else if (sg.type === 'update') {
          await api.patch('/outline/' + (sg.id || ''), { summary: sg.summary || '' });
          loadStructure(project.id);
        } else {
          await api.post<{ note: StructItem }>('/projects/' + project.id + '/ideas', { content: (sg.title || '') + (sg.summary ? '：' + sg.summary : '') });
          loadStructure(project.id);
        }
      } else if (suggestKind === 'characters') {
        if (sg.type === 'add') {
          const d = await api.post<{ card: StructItem }>('/projects/' + project.id + '/characters', { name: sg.name || '新角色', role: sg.role || '配角', description: sg.description || '' });
          setCharacters(prev => [...prev, d.card]);
        } else if (sg.type === 'update') {
          await api.patch('/characters/' + (sg.id || ''), { description: sg.description || '' });
          loadStructure(project.id);
        } else {
          await api.post<{ note: StructItem }>('/projects/' + project.id + '/ideas', { content: (sg.name || '') + (sg.description ? '：' + sg.description : '') });
          loadStructure(project.id);
        }
      } else if (suggestKind === 'timeline') {
        if (sg.type === 'add') {
          const d = await api.post<{ event: StructItem }>('/projects/' + project.id + '/timeline', { when: sg.when || '', event: sg.event || '' });
          setTimeline(prev => [...prev, d.event]);
        } else if (sg.type === 'update') {
          await api.patch('/timeline/' + (sg.id || ''), { event: sg.event || '' });
          loadStructure(project.id);
        } else {
          await api.post<{ note: StructItem }>('/projects/' + project.id + '/ideas', { content: (sg.when ? sg.when + '：' : '') + (sg.event || '') });
          loadStructure(project.id);
        }
      }
      setSuggestMsg('已保留 ✓');
      setSuggestList(prev => prev.filter(x => x !== sg));
    } catch (e: any) { setSuggestMsg(e.message || '保留失败'); }
  };

  const saveProjSettings = async () => {
    if (!project) return;
    const d = await api.patch<{ project: Project }>('/projects/' + project.id, { ...projDraft, goal_word_count: Number(projDraft.goal_word_count) || 0 });
    setProject(d.project); setShowProjSettings(false);
    if (project) loadProject(project.id);
  };

  const exportMd = () => {
    if (!project) return;
    const a = document.createElement('a');
    a.href = '/api/v1/export/projects/' + project.id + '/markdown'; a.download = project.title + '.md'; a.click();
  };
  const exportPdf = () => {
    if (!project) return;
    const a = document.createElement('a');
    a.href = '/api/v1/export/projects/' + project.id + '/pdf'; a.download = project.title + '.pdf'; a.click();
  };
  const exportDocx = () => {
    if (!project) return;
    const a = document.createElement('a');
    a.href = '/api/v1/export/projects/' + project.id + '/docx'; a.download = project.title + '.docx'; a.click();
  };

  const coverPreview: Project = { ...(project || { id: '', title: '未命名', genre: 'biography', theme: '', target_audience: '', goal_word_count: 0, status: '', default_persona_id: null, cover_color: '#8b7d6b' }), title: coverDraft.title || '未命名', subtitle: coverDraft.subtitle, author_name: coverDraft.author_name, cover_color: coverDraft.cover_color };

  const collabSection = (
    <div className="rounded-xl border border-ink/10 bg-paper/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">团队协作</span>
        {project?.my_role === 'owner' && (
          <div className="flex gap-1.5">
            <button onClick={() => genInvite('editor')} disabled={inviteBusy} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink/70 transition hover:bg-ink/10 disabled:opacity-40">可编辑码</button>
            <button onClick={() => genInvite('viewer')} disabled={inviteBusy} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink/70 transition hover:bg-ink/10 disabled:opacity-40">只读码</button>
          </div>
        )}
      </div>
      {invite?.active && invite.code ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/25 bg-accentlight/30 px-3 py-2">
          <span className="font-mono text-lg font-semibold tracking-widest">{invite.code}</span>
          <span className="text-xs text-ink/45">{invite.role === 'viewer' ? '只读' : '可编辑'} · 7 天</span>
          <button onClick={copyInvite} className="ml-auto shrink-0 rounded-md bg-ink px-2 py-1 text-xs text-paper">复制</button>
        </div>
      ) : project?.my_role === 'owner' ? (
        <p className="mb-2 text-xs text-ink/40">生成邀请码后发给朋友，他们可加入共同创作。</p>
      ) : (
        <p className="mb-2 text-xs text-ink/40">邀请码由创建者生成。</p>
      )}
      {collabs.length > 0 && (
        <div className="space-y-1.5">
          {collabs.map(cb => (
            <div key={cb.user_id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-sm">
              <Avatar name={cb.display_name || '协作者'} size="sm" />
              <span className="truncate">{cb.display_name}{cb.email ? ' · ' + cb.email : ''}</span>
              {project?.my_role === 'owner' ? (
                <span className="ml-auto flex items-center gap-1">
                  <select value={cb.role} onChange={e => changeCollab(cb.user_id, e.target.value)}
                    className="rounded border border-ink/10 bg-surface px-1.5 py-0.5 text-xs outline-none">
                    <option value="editor">可编辑</option>
                    <option value="viewer">只读</option>
                  </select>
                  <button onClick={() => { if (confirm('移除该协作者？')) changeCollab(cb.user_id, undefined, true); }}
                    className="text-xs text-ink/30 hover:text-red-500">移除</button>
                </span>
              ) : (
                <span className="ml-auto text-xs text-ink/40">{cb.role === 'viewer' ? '只读' : '可编辑'}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {collabMsg && <p className="mt-1.5 text-xs text-ink/50">{collabMsg}</p>}
    </div>
  );

  return (
    <Layout>
      <div className="mx-auto flex h-app-minus-header max-w-[1700px] overflow-hidden">
        <aside className={"fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-ink/5 bg-surface shadow-lift transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:shadow-none " + (showSidebar ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center gap-3 border-b border-ink/5 p-3">
            {project && <BookCover project={project} size="sm" showMeta={false} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <h2 className="truncate font-serif text-sm font-semibold">{project?.title || '选择作品'}</h2>
                <button onClick={() => setShowSidebar(false)} className="text-ink/40 hover:text-ink md:hidden">✕</button>
              </div>
              {project && <p className="mt-0.5 text-xs text-ink/40">{GENRE_LABEL[project.genre]} · {project.chapter_count ?? 0} 章 · {project.word_count ?? 0} 字</p>}
              {project && project.goal_word_count > 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <span className="block h-full rounded-full bg-accent" style={{ width: Math.min(100, Math.round(((project.word_count || 0) / project.goal_word_count) * 100)) + '%' }} />
                  </span>
                  <span className="text-[10px] text-ink/40">{Math.min(100, Math.round(((project.word_count || 0) / project.goal_word_count) * 100))}%</span>
                </div>
              )}
              <div className="mt-1 flex gap-2">
                {project && <button onClick={openCover} className="text-xs text-accent hover:underline">🖌 封面</button>}
                {project && <button onClick={openProjSettings} className="text-xs text-accent hover:underline">⚙ 作品设置</button>}
              </div>
            </div>
          </div>
          <div className="flex gap-0.5 border-b border-ink/5 px-2 py-2 text-xs">
            {([['book', '书'], ['outline', '大纲'], ['characters', '人物'], ['timeline', '时间线'], ['ideas', '灵感'], ...(project?.genre === 'paper' ? [['citations', '文献'] as const] : []), ['refs', '参考'], ['reviews', '文评']] as const).map(([k, v]) => (
              <button key={k} onClick={() => setLeftTab(k as typeof leftTab)}
                className={"flex-1 rounded-md px-1 py-1.5 transition " + (leftTab === k ? 'bg-accentlight/80 font-medium text-ink' : 'text-ink/45 hover:text-ink')}>{v}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'book' && (
              <>
                <button onClick={() => { setBookView('preview'); setShowSidebar(false); }}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg border border-ink/8 bg-paper/50 px-3 py-2 text-left text-sm text-ink/70 transition hover:border-accent/30 hover:text-accent">
                  📖 书的预览
                </button>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-xs font-medium text-ink/40">目录</p>
                  <button onClick={addChapter} className="text-xs text-accent hover:underline">＋ 新建章节</button>
                </div>
                {chapters.map((c, idx) => (
                  <button key={c.id} onClick={() => { setChapter(c); setBookView('write'); setShowSidebar(false); }}
                    className={"mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition " + (chapter?.id === c.id && bookView === 'write' ? 'bg-accentlight/70 text-ink font-medium' : 'text-ink/60 hover:bg-ink/5')}>
                    <span className="truncate">{idx + 1}. {c.title}</span>
                    <span className="ml-2 shrink-0 text-xs text-ink/30">{c.word_count}</span>
                  </button>
                ))}
                <p className="mb-2 mt-6 px-2 text-xs font-medium text-ink/40">{(prefs?.assistant_name || '缪斯')}</p>
                {convs.filter(c => !project || c.project_id === project.id).map(c => (
                  <div key={c.id} className="group relative mb-1">
                  <button onClick={() => selectConv(c)}
                    className={"mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition " + (conv?.id === c.id ? 'bg-accentlight/70 font-medium' : 'text-ink/60 hover:bg-ink/5')}>
                      <div className="truncate">{c.title}</div>
                      <div className="truncate text-xs text-ink/35">{c.persona?.name || '黎文'}{c.last_message ? ' · ' + c.last_message : ''}</div>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id, c.title); }}
                      className="absolute right-1 top-1.5 z-10 rounded-full px-1.5 text-[10px] text-ink/25 opacity-100 transition group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-50 hover:text-red-500" title="删除会话">✕</button>
                  </div>
                ))}
                <button onClick={() => setShowNewConv(true)} className="mt-2 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-sm text-ink/40 hover:border-accent hover:text-accent">＋ 新会话</button>
              </>
            )}
            {leftTab === 'outline' && project && (
              <StructurePanel kind="outline" items={outline} setItems={setOutline} title="大纲节点" addLabel="＋ 添加大纲节点"
                fields={[{ key: 'title', label: '标题', placeholder: '例如：离家前夜' }, { key: 'summary', label: '内容概述', placeholder: '这一节发生什么…' }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} emptyHint="还没有大纲，先搭好章节骨架，故事就有了方向" chapters={chapters}
                onAI={(kind, id, item) => { setAiItem({ kind, id, item }); setAiMode('polish'); setAiPrompt(''); setAiResult(''); setAiErr(''); }}
                onSuggest={openSuggest} />
            )}
            {leftTab === 'characters' && project && (
              <>
              <StructurePanel kind="characters" items={characters} setItems={setCharacters} title="人物卡" addLabel="＋ 添加人物"
                fields={[{ key: 'name', label: '姓名', placeholder: '主角名' }, { key: 'role', label: '身份', placeholder: '主角/配角/反派' }, { key: 'description', label: '描述', placeholder: '外貌、性格、背景…', textarea: true }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} emptyHint="还没有人物卡，为关键角色写一张设定卡"
                onAI={(kind, id, item) => { setAiItem({ kind, id, item }); setAiMode('polish'); setAiPrompt(''); setAiResult(''); setAiErr(''); }}
                onSuggest={openSuggest} />
                <RelationshipGraph projectId={project.id} characters={characters} onChanged={() => loadStructure(project.id)} />
              </>
            )}
            {leftTab === 'timeline' && project && (
              <StructurePanel kind="timeline" items={timeline} setItems={setTimeline} title="时间线" addLabel="＋ 添加事件"
                fields={[{ key: 'when', label: '时间', placeholder: '1987 年夏 / 第三章前' }, { key: 'event', label: '事件', placeholder: '发生了什么…' }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} emptyHint="还没有时间线事件，把重要时刻记下来"
                onSuggest={openSuggest} />
            )}
            {leftTab === 'ideas' && project && (
              <StructurePanel kind="ideas" items={ideas} setItems={setIdeas} title="灵感箱" addLabel="＋ 记录灵感"
                fields={[{ key: 'content', label: '灵感', placeholder: '一句话灵感…', textarea: true }]}
                projectId={project.id} onChanged={() => loadStructure(project.id)} emptyHint="随手一句话也可能成为故事的核心。" />
            )}
            {leftTab === 'citations' && project && (
              <CitationsPanel projectId={project.id} citations={citations} setCitations={setCitations} onInsert={insertCitationMark} />
            )}
            {leftTab === 'refs' && (
              <ReferenceDocsPanel docs={refDocs} onUpload={uploadRef} onDelete={deleteRef}
                onPick={id => setPickedRefs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])} picked={pickedRefs} />
            )}
            {leftTab === 'reviews' && project && (
              <ReviewsPanel projectId={project.id} />
            )}
            {refMsg && <p className="mt-2 px-2 text-xs text-ink/55">{refMsg}</p>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {showSidebar && <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => setShowSidebar(false)} />}

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-ink/5 bg-surface/70 px-3 py-2 lg:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button onClick={() => setShowSidebar(true)} aria-label="打开侧栏" className="rounded-lg px-2 py-1.5 text-sm text-ink/60 hover:bg-ink/5 md:hidden">☰</button>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-serif text-sm font-semibold">{project?.title || '作品'}</span>
                {chapter && <span className="hidden truncate text-xs text-ink/40 sm:inline">· {chapter.title}</span>}
              </div>
              <div className="ml-1 flex shrink-0 rounded-lg bg-ink/5 p-0.5 text-xs">
                <button onClick={() => setBookView('write')}
                  className={"rounded-md px-2.5 py-1.5 transition sm:px-3 " + (bookView === 'write' ? 'bg-surface text-ink shadow-sm font-medium' : 'text-ink/50 hover:text-ink')}>✍ 写作</button>
                <button onClick={() => setBookView('preview')}
                  className={"rounded-md px-2.5 py-1.5 transition sm:px-3 " + (bookView === 'preview' ? 'bg-surface text-ink shadow-sm font-medium' : 'text-ink/50 hover:text-ink')}>📖 书</button>
              </div>
            </div>
            <div className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-ink/45 lg:basis-auto lg:justify-end">
              {project && (
                <button onClick={openShare} className="rounded-md bg-accentlight/70 px-2.5 py-1 font-medium text-ink transition hover:bg-accentlight" title="邀请协作者共同创作">🔗 协作者</button>
              )}
              {project && (
                <button onClick={() => setShowSharePanel(true)} disabled={shareBusy} title={shareInfo ? '已分享到拾卷' : '把当前状态快照发布到拾卷'}
                  className={"rounded-md px-2.5 py-1 font-medium transition disabled:opacity-40 " + (shareInfo ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-accentlight/70 text-ink hover:bg-accentlight')}>
                  {shareBusy ? '…' : (shareInfo ? '📤 v' + shareInfo.version : '📤 拾卷')}
                </button>
              )}
              {shareInfo && (
                <a href={'/shares/' + shareInfo.id} target="_blank" rel="noreferrer"
                  className="rounded-md px-2 py-1 text-accent hover:underline" title="查看已分享的版本">公开页 ↗</a>
              )}
              {project && (
                <span className="flex items-center gap-0.5">
                  <button onClick={() => setShowReview(true)} title="请一位评者为这部作品写文评"
                    className="rounded-md bg-accentlight/70 px-2.5 py-1 font-medium text-ink transition hover:bg-accentlight">📜 文评</button>
                  <button onClick={exportMd} className="rounded-md px-2 py-1 hover:bg-ink/5" title="Markdown">MD</button>
                  <button onClick={exportPdf} className="rounded-md px-2 py-1 hover:bg-ink/5" title="PDF">PDF</button>
                  <button onClick={exportDocx} className="rounded-md px-2 py-1 hover:bg-ink/5" title="Word">DOCX</button>
                </span>
              )}
              {bookView === 'write' && chapter && (
                <>
                  <button onClick={saveVersion} disabled={saveVerBusy} className="rounded-md px-2.5 py-1 hover:bg-ink/5 disabled:opacity-40" title="手动保存一个新版本（与上一版本相同则不保存）">
                    {saveVerBusy ? '保存中…' : '💾 保存版本'}
                  </button>
                  <button onClick={loadVersions} className="rounded-md px-2.5 py-1 hover:bg-ink/5">🕘 版本历史</button>
                  <button onClick={() => setShowNewConv(true)} className="rounded-md px-2.5 py-1 hover:bg-ink/5">💬 {(prefs?.assistant_name || '缪斯')}</button>
                </>
              )}
              {saveVerMsg && <span className="ml-1 text-xs text-ink/60">{saveVerMsg}</span>}
              <button onClick={() => setChatOpen(!chatOpen)}
                className={"ml-1 rounded-full px-3 py-1.5 transition " + (chatOpen ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink hover:bg-accentlight')}>
                {chatOpen ? '✕ 收起' : '💬 对话'}
              </button>
            </div>
          </div>

          {bookView === 'preview' ? (
            <div className="flex-1 overflow-y-auto bg-ink/[0.03]">
              <div className="mx-auto max-w-3xl px-6 py-8">
                <div className="flex flex-col items-center">
                  {project && <BookCover project={project} size="lg" />}
                  <h2 className="mt-5 font-serif text-2xl font-semibold">{project?.title}</h2>
                  {project?.subtitle && <p className="mt-1 font-creative text-ink/55">{project.subtitle}</p>}
                  {project?.author_name && <p className="mt-1 text-sm text-ink/45">{project.author_name} 著</p>}
                  <p className="mt-2 text-xs text-ink/40">{project?.chapter_count ?? 0} 章 · {project?.word_count ?? 0} 字 · {GENRE_LABEL[project?.genre || ''] || project?.genre}</p>
                  <button onClick={openCover} className="mt-2 text-xs text-accent hover:underline">编辑封面信息</button>
                </div>

                <div className="mt-8 space-y-5">
                  {chapters.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-ink/15 bg-surface/60 px-6 py-12 text-center text-sm text-ink/40">
                      这本书还是空的。试着口述一个你最想讲的故事片段，让它成为第一章的开端。
                    </div>
                  )}
                  {chapters.map((c, idx) => (
                    <div key={c.id} onClick={() => { setChapter(c); setBookView('write'); }}
                      className="group cursor-pointer rounded-r-xl rounded-l-md bg-surface px-6 py-5 shadow-soft ring-1 ring-ink/5 transition hover:-translate-y-0.5 hover:shadow-lift">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs tracking-[0.2em] text-accent">第 {idx + 1} 章</span>
                        <span className="text-xs text-ink/35">{c.word_count} 字</span>
                      </div>
                      <h3 className="font-serif text-lg font-semibold group-hover:text-accent">{c.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap font-creative text-sm leading-7 text-ink/60 line-clamp-4 indent-8">{c.content || '试着口述一个你最想讲的故事片段。'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {chapter ? (
                <div className="flex min-h-0 flex-1 flex-col bg-paper">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-ink/10 bg-surface/80 px-4 py-2 sm:px-5">
                    <span className="text-xs text-ink/35">第 {chapters.findIndex(c => c.id === chapter.id) + 1} 章</span>
                    <input value={chapter.title} onChange={e => setChapter({ ...chapter, title: e.target.value })}
                      className="min-w-0 flex-1 bg-transparent font-serif text-base font-semibold outline-none" />
                    <span className="text-xs text-ink/35">{chapter.word_count} 字</span>
                    {project?.genre === 'paper' && (
                      <>
                        <button onClick={() => setShowPaperInfo(v => !v)} title="摘要 / 关键词 / 引用格式"
                          className={"rounded-full px-2 py-0.5 text-xs font-medium transition " + (showPaperInfo ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink/70 hover:bg-accentlight')}>📋 论文信息</button>
                        <button onClick={() => setLeftTab('citations')} title="管理参考文献并插入 [n] 标注"
                          className="rounded-full bg-accentlight/60 px-2 py-0.5 text-xs font-medium text-ink/70 transition hover:bg-accentlight">📚 引用</button>
                      </>
                    )}
                    <OnlineAvatars peers={peers} currentUserId={me?.id} />
                    <button onClick={cycleChapterStatus} title="点击推进章节状态：初稿 → 修改中 → 已定稿" className={"rounded-full px-2 py-0.5 text-xs font-medium transition " + (chapter.status === 'final' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : chapter.status === 'reviewed' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>
                      {chapter.status === 'final' ? '✓ 已定稿' : chapter.status === 'reviewed' ? '● 修改中' : '○ 初稿'}
                    </button>
                    <button onClick={deleteChapter} className="ml-auto text-xs text-ink/30 hover:text-red-500">删除章节</button>
                  </div>
                  {showPaperInfo && project?.genre === 'paper' && (
                    <PaperInfoPanel key={paperInfoKey} project={project} onSaved={p => setProject(p)} />
                  )}
                  <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-8">
                    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col rounded-lg bg-surface shadow-soft ring-1 ring-ink/10 dark:bg-paper dark:shadow-none dark:ring-0">
                      <MarkdownEditor
                        value={chapter.content}
                        onChange={updateContent}
                        onSave={() => saveChapter(chapter)}
                        placeholder="在这一页写下你的故事…（支持 Markdown）"
                        taRef={editorRef}
                        onActivity={handleEditorSelection}
                        remoteCursors={remoteCursors}
                      />
                    </div>
                  </div>

                  <div className="border-t border-ink/10 bg-surface/80 px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-ink/40">AI 工具：</span>
                      {Object.entries(TOOL_LABEL).map(([k, v]) => (
                        <button key={k} onClick={() => runTool(k as any)} disabled={toolBusy || !chapter.content}
                          className={"rounded-full px-3 py-1 text-xs transition disabled:opacity-40 " + (toolMode === k && toolResult ? 'bg-ink text-paper' : 'bg-accentlight/60 text-ink hover:bg-accentlight')}>{v}</button>
                      ))}
                      <button onClick={runCheck} disabled={checkBusy || !chapter.content}
                        className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 transition hover:bg-amber-100 disabled:opacity-40">✓ 一致性检查</button>
                    </div>
                    {checkBusy && <p className="mt-1 text-xs text-ink/40">正在检查…</p>}
                    {checkIssues.length > 0 && (
                      <div className="mt-2 space-y-1 rounded-xl border border-ink/10 bg-paper/60 p-2.5 animate-fade-up">
                        {checkIssues.map((iss, idx) => (
                          <p key={idx} className={"text-xs leading-5 " + (iss.level === 'ok' ? 'text-emerald-600' : iss.level === 'warn' ? 'text-amber-700' : 'text-ink/55')}>
                            {iss.level === 'ok' ? '✓' : iss.level === 'warn' ? '⚠' : 'ℹ'} {iss.message}
                          </p>
                        ))}
                        <Button variant="ghost" onClick={() => setCheckIssues([])} className="text-xs">关闭</Button>
                      </div>
                    )}
                    {toolResult && (
                      <div className="mt-2 animate-fade-up">
                        {toolDiff.length > 0 && (
                          <div className="mb-2 max-h-44 overflow-y-auto rounded-lg border border-ink/10 bg-surface/70 p-2">
                            <p className="mb-1.5 text-[10px] font-medium text-ink/40">改动预览：<span className="text-emerald-600">绿色=新增</span> · <span className="text-red-500">红色=删除</span></p>
                            {toolDiff.map((d, idx) => (
                              <div key={idx} className={'mb-0.5 rounded px-2 py-1 text-xs leading-5 ' + (d.type === 'insert' ? 'bg-emerald-50 text-emerald-800' : d.type === 'delete' ? 'bg-red-50 text-red-600 line-through' : d.type === 'replace' ? 'bg-amber-50 text-amber-800' : 'text-ink/45')}>
                                {d.type === 'insert' && '＋ ' + d.new}
                                {d.type === 'delete' && '－ ' + d.old}
                                {d.type === 'replace' && <>⇄ 旧：{d.old} → 新：{d.new}</>}
                                {d.type === 'keep' && d.new}
                              </div>
                            ))}
                          </div>
                        )}
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
                  {project && <BookCover project={project} size="md" />}
                  <div className="mb-3 mt-4 text-4xl">📖</div>
                  <p className="text-sm">试着口述一个你最想讲的故事片段，或者输入第一句话。</p>
                  <Button variant="subtle" onClick={addChapter} className="mt-4 text-xs">＋ 新建章节</Button>
                </div>
              )}
            </div>
          )}
        </section>

        {chatOpen && (
          <aside className="fixed inset-0 z-40 flex w-full flex-col border-l border-ink/5 bg-surface/95 md:static md:z-auto md:w-[340px] md:shrink-0">
            <div className="flex items-center justify-between border-b border-ink/5 bg-surface/70 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                {conv?.persona ? (conv.persona.avatar ? <img src={'/api/v1' + conv.persona.avatar} alt={conv.persona.name} className="h-7 w-7 rounded-full object-cover" /> : <Avatar name={conv.persona.name} color={conv.persona.avatar_color} size="sm" />) : <Avatar name="黎文" size="sm" />}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{conv?.persona?.name || '黎文'}</span>
                    <button onClick={() => setShowPersonaCard(true)} title="查看当前人设配置" className="text-[10px] text-accent hover:underline">人设卡</button>
                    <button onClick={openConvPicker} title="更换人设/朗读音色" className="text-[10px] text-ink/40 hover:text-accent hover:underline">换</button>
                  </div>
                  <div className="text-xs text-ink/40">{conv?.persona?.tagline || '安静的倾听者'}{conv?.effective_voice ? ' · 🔊 ' + conv.effective_voice.display_name : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {speaking && <Button variant="subtle" onClick={() => { stopSpeakTTS(); setSpeaking(false); }} className="px-2 py-1 text-xs">■</Button>}
                {streaming && <Button variant="subtle" onClick={stopStream} className="px-2 py-1 text-xs">停止</Button>}
                <Button variant="ghost" onClick={() => setShowNewConv(true)} className="px-2 py-1 text-xs">新会话</Button>
                <button onClick={() => setChatOpen(false)} className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">✕</button>
              </div>
            </div>

            <div ref={msgsRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
              {messages.length === 0 && !streaming && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  {conv?.persona?.avatar ? <img src={'/api/v1' + conv.persona.avatar} alt={conv.persona?.name || '黎文'} className="h-16 w-16 rounded-full object-cover shadow-soft" /> : <Avatar name={conv?.persona?.name || '黎文'} color={conv?.persona?.avatar_color} size="lg" />}
                  <h3 className="mt-3 font-serif text-lg font-semibold">{conv?.persona?.tagline || '今天想讲点什么？我在听。'}</h3>
                  <p className="mt-1 max-w-xs text-sm text-ink/40">口述或输入一段回忆、一个故事想法，我会陪你把它展开，并把可用内容变成可采纳的 diff。</p>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={"flex " + (m.role === 'user' ? 'justify-end' : 'justify-start') + " animate-fade-up"}>
                  <div className={"max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed " + (m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-ink/5 bg-surface shadow-soft')}>
                    {m.role === 'assistant' && m.reply_type && (
                      <div className="mb-1.5 flex items-center gap-2">
                        <Badge color={m.reply_type === 'encouragement' ? 'green' : m.reply_type === 'question' ? 'accent' : m.reply_type === 'feedback' ? 'amber' : m.reply_type === 'guide' ? 'accent' : 'default'}>{REPLY_LABEL[m.reply_type] || '回复'}</Badge>
                        {m.source === 'rules' && <span className="text-[10px] text-ink/30">内置教练</span>}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.role === 'assistant' && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {speakingId === m.id && <span className="text-accent" title="正在播放"><span className="wave-bars"><span /><span /><span /><span /><span /></span></span>}
                        {ttsLoadingId === m.id && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600" title="正在生成语音">
                            <Spinner size="sm" /><span className="hidden sm:inline">语音生成中…</span>
                          </span>
                        )}
                        <button
                          onClick={() => speakingId === m.id ? stopSpeakTTS() : speakMessage(m)}
                          disabled={ttsLoadingId === m.id}
                          className="text-xs text-accent transition hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                          title={ttsLoadingId === m.id ? '正在生成语音' : speakingId === m.id ? '停止播放' : '播放'}
                        >{speakingId === m.id ? '⏹' : '▶'}</button>
                        {m.adopted_at ? (
                          <span className="text-xs text-emerald-600">✓ 已采纳到文章</span>
                        ) : isAdoptable(m.reply_type) ? (
                          <button onClick={() => setDiffMsg(diffMsg?.id === m.id ? null : m)} className={"text-xs hover:underline " + (diffMsg?.id === m.id ? 'text-emerald-700 font-medium' : 'text-accent')}>✏️ 查看建议 diff</button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {streaming && (
                <div className="flex justify-start animate-fade-up">
                  <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-ink/5 bg-surface px-3.5 py-2.5 shadow-soft">
                    {streamText ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamText}</div>
                      : <div className="flex gap-1 py-1"><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink/40" /></div>}
                    {ttsLoadingId && !messages.some(x => x.id === ttsLoadingId) && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600">
                        <Spinner size="sm" /><span>正在生成语音…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {diffMsg && conv && (
                <DiffReview message={diffMsg} conversationId={conv.id} chapter={chapter} chapters={chapters} onAdopted={handleAdopted} onClose={() => setDiffMsg(null)} />
              )}
            </div>

            <div className="border-t border-ink/5 bg-surface/50 px-2.5 pt-2.5 pb-safe-input">
              {pendingTrans && (
                <div className="mb-2 rounded-xl border border-accent/25 bg-accentlight/30 p-2.5 animate-fade-up">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink/60">🎙 转写确认</span>
                    <span className="text-[10px] text-ink/35">静音 2 秒已自动结束</span>
                  </div>
                  <textarea value={pendingTrans} onChange={e => setPendingTrans(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-ink/10 bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
                  <div className="mt-1.5 flex gap-2">
                    <Button onClick={() => confirmTrans(true)} disabled={!pendingTrans.trim() || streaming} className="flex-1 py-1.5 text-xs">✓ 确认发送</Button>
                    <Button variant="ghost" onClick={() => confirmTrans(false)} className="text-xs">取消</Button>
                  </div>
                </div>
              )}
              {conv && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1">
                  <span className="mr-0.5 text-[10px] text-ink/35">快捷：</span>
                  {refDocs.length > 0 && (
                    <div className="relative">
                      <button onClick={() => setShowRefPicker(v => !v)}
                        className={"rounded-full px-2.5 py-0.5 text-xs transition " + (pickedRefs.length ? 'bg-ink text-paper' : 'bg-accentlight/50 text-ink/65 hover:bg-accentlight')}>
                        @ 参考文章{pickedRefs.length ? ' ×' + pickedRefs.length : ''}
                      </button>
                      {showRefPicker && (
                        <div className="absolute bottom-8 left-0 z-50 w-64 rounded-xl border border-ink/10 bg-surface p-2 shadow-lift animate-fade-up">
                          <p className="mb-1.5 px-1 text-[10px] text-ink/40">选择要在本次对话中 @ 的参考文章（最多 8 篇）</p>
                          <div className="max-h-52 space-y-1 overflow-y-auto">
                            {refDocs.map(d => {
                              const on = pickedRefs.includes(d.id);
                              return (
                                <button key={d.id} onClick={() => setPickedRefs(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : (prev.length >= 8 ? prev : [...prev, d.id]))}
                                  className={"flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition " + (on ? 'bg-accentlight/70 font-medium' : 'hover:bg-ink/5')}>
                                  <span className="truncate">@ {d.title}</span>
                                  {on && <span className="ml-2 text-accent">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setInput(p => (p ? p + ' ' : '') + '@' + (chapter?.title || '当前章节') + ' '); inputRef.current?.focus(); }} className="rounded-full bg-accentlight/50 px-2.5 py-0.5 text-xs text-ink/65 hover:bg-accentlight" title="在输入中引用当前章节">@当前章节</button>
                  <button onClick={() => conv && setMemOpen(true)} className={'rounded-full px-2.5 py-0.5 text-xs transition ' + (linkedMems.length ? 'bg-accent text-paper' : 'bg-accentlight/50 text-ink/65 hover:bg-accentlight')} title="打开记忆库，接入其他作品的记忆">@记忆{linkedMems.length ? ` ×${linkedMems.length}` : ''}</button>
                  <button onClick={() => { setInput(p => (p ? p + ' ' : '') + '把这句话记进灵感箱：'); inputRef.current?.focus(); }} className="rounded-full bg-accentlight/50 px-2.5 py-0.5 text-xs text-ink/65 hover:bg-accentlight" title="把要说的话记成一条灵感">💡 灵感</button>
                  {chapter?.content && (
                    <button onClick={() => { const last = chapter.content.split(/\n+/).filter(Boolean).pop() || ''; setInput('帮我润色这段话：' + (last.length > 60 ? last.slice(0, 60) + '…' : last)); inputRef.current?.focus(); }} className="rounded-full bg-accentlight/50 px-2.5 py-0.5 text-xs text-ink/65 hover:bg-accentlight" title="请助手润色当前章节最后一段">✨ 帮我润色</button>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button onClick={toggleRecord} title={recording ? '停止录音' : '语音输入'}
                  className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition " + (recording ? 'bg-red-500 text-white animate-pulse' : 'bg-accentlight text-ink hover:bg-accent/20')}>
                  {recording ? '⏹' : '🎤'}
                </button>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1}
                  placeholder={recording ? '正在聆听…' : '说点什么，或输入文字…'}
                  className="max-h-28 min-h-[36px] flex-1 resize-none rounded-xl border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
                <button onClick={() => send()} disabled={!input.trim() || streaming || !conv}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition hover:bg-ink/85 disabled:opacity-40">↑</button>
              </div>
              {!conv && <p className="mt-1.5 text-center text-xs text-ink/40">先创建一个会话，开始与你的{prefs?.assistant_name || '缪斯'}对话</p>}
            </div>
          </aside>
        )}
      </div>

      <Modal open={showNewConv} onClose={() => setShowNewConv(false)} title={conv ? '人设与朗读音色' : '新的创作会话'}>
        <div className="space-y-4">
          <p className="text-xs leading-5 text-ink/50">{conv ? '更换后立即生效，消息记录保留。朗读将跟随所选人设的音色。' : '选好你想要的创作伙伴，TA 的声音也会跟着走。'}</p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">选择人设</span>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {(project?.team_persona_ids?.length ? [...personas.filter(p => (project.team_persona_ids || []).includes(p.id)), ...personas.filter(p => !(project.team_persona_ids || []).includes(p.id))] : personas).map(p => (
                <button key={p.id} onClick={() => {
                  setNewPersona(p.id);
                  // 选人设自动带上 TA 绑定的音色（会话朗读跟着人设走）
                  const bind = p.voice_profile_id ? voices.find(v => v.id === p.voice_profile_id) : null;
                  if (bind) setNewVoice(bind.id);
                }}
                  className={"flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition " + (newPersona === p.id ? 'bg-accentlight/70' : 'hover:bg-ink/5')}>
                  <Avatar name={p.name} color={p.avatar_color} size="sm" />
                  <div><div className="flex items-center gap-1.5">{p.name}{project?.team_persona_ids?.includes(p.id) && <span className="text-[9px] text-accent">团队</span>}</div><div className="text-xs text-ink/40">{p.tagline}</div></div>
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">选择声色</span>
            <div className="flex flex-wrap gap-2">
              {voices.map(v => (
                <button key={v.id} onClick={() => setNewVoice(v.id)}
                  className={"rounded-full px-3.5 py-1.5 text-sm transition " + (newVoice === v.id ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{v.display_name}</button>
              ))}
            </div>
          </label>
          <Button onClick={createConv} className="w-full">{conv ? '保存并应用' : '开始对话'}</Button>
        </div>
      </Modal>

      <Modal open={showCover} onClose={() => setShowCover(false)} title="书的封面">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="shrink-0"><BookCover project={coverPreview} size="sm" /></div>
            <div className="flex-1 space-y-3">
              <Input label="书名" value={coverDraft.title} onChange={v => setCoverDraft({ ...coverDraft, title: v })} placeholder="书名" />
              <Input label="副标题" value={coverDraft.subtitle} onChange={v => setCoverDraft({ ...coverDraft, subtitle: v })} placeholder="一句话副标题（可选）" />
              <Input label="作者署名" value={coverDraft.author_name} onChange={v => setCoverDraft({ ...coverDraft, author_name: v })} placeholder="署名（可选）" />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink/60">封面颜色</span>
                <div className="flex flex-wrap gap-2">
                  {['#8b7d6b', '#b3543e', '#3d6b5c', '#4a5a8a', '#7b4f8a', '#b08a3e'].map(c => (
                    <button key={c} onClick={() => setCoverDraft({ ...coverDraft, cover_color: c })}
                      className={"h-8 w-8 rounded-full ring-2 ring-offset-2 transition " + (coverDraft.cover_color === c ? 'ring-ink' : 'ring-transparent')} style={{ background: c }} />
                  ))}
                </div>
              </label>
            </div>
          </div>
          <Button onClick={saveCover} disabled={!coverDraft.title.trim()} className="w-full">保存封面</Button>
        </div>
      </Modal>

      <Modal open={showProjSettings} onClose={() => setShowProjSettings(false)} title="作品设置">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">体裁</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GENRE_LABEL).map(([k, v]) => (
                <button key={k} onClick={() => setProjDraft({ ...projDraft, genre: k })}
                  className={'rounded-full px-3.5 py-1.5 text-sm transition ' + (projDraft.genre === k ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{v}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">作品语言</span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(l => (
                <button key={l} onClick={() => setProjDraft({ ...projDraft, language: l })}
                  className={'rounded-full px-3 py-1 text-sm transition ' + (projDraft.language === l ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>{LANGUAGE_LABEL[l] || l}</button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-ink/40">AI 将使用该语言与你交流并给出写作建议</span>
          </label>
          <Input label="主题（一句话）" value={projDraft.theme} onChange={v => setProjDraft({ ...projDraft, theme: v })} placeholder="例如：一个江南小镇青年的成长" />
          <Input label="目标读者" value={projDraft.target_audience} onChange={v => setProjDraft({ ...projDraft, target_audience: v })} placeholder="例如：家人与朋友 / 悬疑小说读者" />
          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink/60">陪跑团队（编辑 + 读者 + 导师可同时在场）</span>
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-xl border border-ink/10 bg-paper/50 p-2">
              {personas.map(p => {
                const checked = projDraft.team_persona_ids.includes(p.id);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-ink/5">
                    <input type="checkbox" checked={checked} onChange={e => setProjDraft({ ...projDraft, team_persona_ids: e.target.checked ? [...projDraft.team_persona_ids, p.id] : projDraft.team_persona_ids.filter(id => id !== p.id) })}
                      className="accent-accent" />
                    <Avatar name={p.name} color={p.avatar_color} size="sm" />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto truncate text-xs text-ink/40">{p.tagline}</span>
                  </label>
                );
              })}
              {personas.length === 0 && <p className="px-2 py-3 text-center text-xs text-ink/30">还没有可用人设，先去「人设」页创建</p>}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">创作目标字数</span>
            <input type="number" min={0} step={1000} value={projDraft.goal_word_count || ''}
              onChange={e => setProjDraft({ ...projDraft, goal_word_count: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="例如：30000" />
            <span className="mt-1 block text-xs text-ink/40">设置后侧栏会显示完成进度条</span>
          </label>
          {collabSection}
          <Button onClick={saveProjSettings} className="w-full">保存作品设置</Button>
        </div>
      </Modal>

      <Modal open={showShare} onClose={() => setShowShare(false)} title="分享作品">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink/55">
            {project?.my_role === 'owner'
              ? '生成邀请码发给朋友，他们可以以「可编辑」或「只读」身份加入，一起完成这部作品。'
              : '这个作品的创建者可以生成邀请码，加入后你就能一起创作了。'}
          </p>
          {collabSection}
          <p className="text-xs leading-5 text-ink/40">提示：协作者通过「加入作品 → 输入邀请码」进入；目前为保存后同步，暂不支持多人同时在线编辑与光标定位。</p>
        </div>
      </Modal>

      <Modal open={showSharePanel} onClose={() => setShowSharePanel(false)} title="分享到拾卷">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink/60">
            发布时会为这本书的<b>当前状态创建一份快照</b>，之后你继续修改原作品不会影响已分享的内容。
            {shareInfo && <>已发布 <b>v{shareInfo.version}</b>（{new Date(shareInfo.republished_at).toLocaleDateString('zh-CN')}），{shareInfo.like_count} 人点赞，{shareInfo.view_count} 次阅读。</>}
          </p>
          {shareInfo && (
            <a href={'/shares/' + shareInfo.id} target="_blank" rel="noreferrer"
              className="block rounded-xl border border-ink/10 bg-paper/50 p-3 text-sm text-accent hover:underline">
              🔖 拾卷公开页：/shares/{shareInfo.id}
            </a>
          )}
          {shareMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{shareMsg}</p>}
          <div className="flex gap-2">
            {!shareInfo ? (
              <Button onClick={publishShare} disabled={shareBusy} className="flex-1">{shareBusy ? '发布中…' : '📤 发布当前版本（v1）'}</Button>
            ) : (
              <>
                <Button onClick={republishShare} disabled={shareBusy} className="flex-1">{shareBusy ? '发布中…' : '🔄 再发版（v' + ((shareInfo.version || 1) + 1) + '）'}</Button>
                <Button variant="danger" onClick={unshare} className="shrink-0">下架</Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setShowSharePanel(false)}>关闭</Button>
          </div>
          <p className="text-xs leading-5 text-ink/40">再发版会把这本书的最新内容更新到分享快照，版本号 +1；点赞与阅读数据会保留。只有作品创建者可以发布。</p>
        </div>
      </Modal>

      <Modal open={!!suggestKind} onClose={() => setSuggestKind(null)} title={'✨ AI 建议 · ' + (suggestKind === 'outline' ? '大纲' : suggestKind === 'characters' ? '人物' : '时间线')}>
        <div className="space-y-3">
          <p className="text-xs leading-5 text-ink/50">AI 根据作品主题与现有内容给出建议，你可以选择性地保留：新增会创建新条目，调整会更新对应内容，其他会记入灵感箱。</p>
          {suggestBusy && <p className="py-6 text-center text-sm text-ink/40">AI 正在思考建议…</p>}
          {suggestErr && <p className="text-xs text-red-500">{suggestErr}</p>}
          {!suggestBusy && suggestList.length === 0 && !suggestErr && (
            <p className="py-6 text-center text-sm text-ink/40">暂无建议，试试重新生成。</p>
          )}
          {suggestList.map((sg, i) => (
            <div key={i} className="rounded-xl border border-ink/8 bg-paper/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {suggestKind === 'outline' && sg.title && <p className="text-sm font-medium">{sg.title}</p>}
                  {suggestKind === 'characters' && sg.name && <p className="text-sm font-medium">{sg.name}<span className="ml-1.5 text-xs font-normal text-ink/40">{sg.role || ''}</span></p>}
                  {suggestKind === 'timeline' && sg.when && <p className="text-xs text-ink/40">⏱ {sg.when}</p>}
                  <p className="mt-0.5 text-xs leading-5 text-ink/65">{sg.summary || sg.description || sg.event}</p>
                  {sg.reason && <p className="mt-1 text-[11px] text-ink/40">💡 {sg.reason}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/45">
                  {sg.type === 'add' ? '新增' : sg.type === 'update' ? '调整' : '记录'}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button variant="subtle" onClick={() => applySuggestion(sg)} className="px-2.5 py-1 text-[11px]">✓ 保留</Button>
                <Button variant="ghost" onClick={() => setSuggestList(prev => prev.filter(x => x !== sg))} className="px-2.5 py-1 text-[11px]">忽略</Button>
              </div>
            </div>
          ))}
          {suggestMsg && <p className="text-xs text-emerald-600">{suggestMsg}</p>}
          <div className="flex gap-2">
            <Button onClick={() => openSuggest(suggestKind!)} disabled={suggestBusy} className="flex-1 text-xs">↻ 重新生成</Button>
            <Button variant="ghost" onClick={() => setSuggestKind(null)} className="text-xs">完成</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!aiItem} onClose={() => setAiItem(null)} title={aiItem ? (aiItem.kind === 'outline' ? 'AI 大纲辅助' : 'AI 人物辅助') : ''}>
        {aiItem && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/55">
              {aiItem.kind === 'outline' ? (
                <>对大纲节点「{aiItem.item.title || '未命名'}」：可让 AI 润色现有摘要，或按你的想法生成新节点。</>
              ) : (
                <>对人物卡「{aiItem.item.name || '未命名'}」（{aiItem.item.role || '配角'}）：可让 AI 润色设定，或生成新角色。</>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setAiMode('polish')} className={'flex-1 rounded-lg px-3 py-2 text-sm transition ' + (aiMode === 'polish' ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>润色现有内容</button>
              <button onClick={() => setAiMode('generate')} className={'flex-1 rounded-lg px-3 py-2 text-sm transition ' + (aiMode === 'generate' ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60 hover:bg-ink/10')}>生成新内容</button>
            </div>
            {aiMode === 'generate' && (
              <Input label="创作要求（可选）" value={aiPrompt} onChange={setAiPrompt} placeholder="例如：一个性格倔强的乡下少年 / 第三幕的高潮转折" />
            )}
            <div className="flex gap-2">
              <Button onClick={runAI} disabled={aiBusy} className="flex-1">{aiBusy ? 'AI 思考中…' : (aiMode === 'polish' ? '✨ 润色' : '✨ 生成')}</Button>
              <Button variant="ghost" onClick={() => { setAiItem(null); setAiResult(''); }}>关闭</Button>
            </div>
            {aiErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{aiErr}</p>}
            {aiResult && (
              <div className="rounded-xl border border-accent/25 bg-accentlight/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink/60">AI 结果</span>
                  <Button variant="subtle" onClick={applyAI} disabled={aiBusy} className="px-2 py-1 text-xs">{aiMode === 'generate' ? '＋ 采纳为新内容' : '✓ 应用到现有内容'}</Button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-ink/75">{aiResult}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showPersonaCard} onClose={() => setShowPersonaCard(false)} title="当前人设">
        {(() => {
          const p = conv?.persona_id ? personas.find(x => x.id === conv.persona_id) : null;
          if (!p) return <p className="py-6 text-center text-sm text-ink/40">未找到人设信息</p>;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} color={p.avatar_color} size="lg" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-lg font-semibold">{p.name}</span>
                    {p.is_preset && <Badge color="accent">预设</Badge>}
                  </div>
                  <p className="text-sm text-ink/45">{p.tagline}</p>
                </div>
              </div>
              {p.background && <p className="text-sm leading-6 text-ink/65">{p.background}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-1 text-xs font-medium text-ink/45">性格</p>
                  <div className="flex flex-wrap gap-1">{(p.personality || []).map(t => <Badge key={t}>{t}</Badge>)}</div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-ink/45">价值观</p>
                  <div className="flex flex-wrap gap-1">{(p.values || []).map(t => <Badge key={t}>{t}</Badge>)}</div>
                </div>
              </div>
              {p.speaking_style && (
                <div className="rounded-xl bg-paper/60 p-3 text-sm text-ink/70">
                  <p className="mb-1 text-xs font-medium text-ink/45">说话风格：{p.speaking_style.tone || '自然'}</p>
                  {p.speaking_style.preferences?.length > 0 && <p className="text-xs text-ink/55">偏好：{(p.speaking_style.preferences || []).join('、')}</p>}
                  {p.speaking_style.avoid?.length > 0 && <p className="text-xs text-ink/55">避免：{(p.speaking_style.avoid || []).join('、')}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink/45">
                {p.relationship && <span>关系：{p.relationship}</span>}
                {p.expertise?.length > 0 && <span>擅长：{(p.expertise || []).join('、')}</span>}
                {p.greeting && <span className="w-full">开场白：{p.greeting}</span>}
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={showVersions} onClose={() => setShowVersions(false)} title={"版本历史 · " + (chapter?.title || '')} wide>
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

      {adoptDone && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lift animate-fade-up">{adoptDone}</div>}
      {undoInfo && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lift animate-fade-up">
          <span>已删除「{undoInfo.label}」</span>
          <button onClick={undoDelete} className="font-medium text-accentlight hover:underline">撤销</button>
          <span className="text-xs text-paper/50">30s</span>
        </div>
      )}
      {draftRestored && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lift animate-fade-up">{draftRestored}</div>}
      {notice && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-600 px-5 py-2.5 text-sm text-white shadow-lift animate-fade-up">{notice}</div>}

      <MemoryLinkModal
        open={memOpen}
        convId={conv?.id || null}
        currentProjectId={project?.id || null}
        linked={linkedMems}
        onClose={() => setMemOpen(false)}
        onSaved={(ids) => setLinkedMems(ids)}
      />
      <ReviewModal
        open={showReview}
        projectId={project?.id || ''}
        projectTitle={project?.title || ''}
        defaultPersonaId={project?.default_persona_id || null}
        onClose={() => setShowReview(false)}
      />
    </Layout>
  );
}
