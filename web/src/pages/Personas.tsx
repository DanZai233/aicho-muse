import { useEffect, useRef, useState } from 'react';
import { api, Persona, VoiceProfile } from '../lib/api';
import Layout from '../components/Layout';
import { Avatar, Button, Badge, Modal, Input } from '../components/ui';
import { speakWithTTS, stopSpeakTTS } from '../lib/speech';
import { completeTourStep } from '../lib/tour';

const EMPTY: Omit<Persona, 'id' | 'is_preset' | 'version'> = {
  name: '', tagline: '', background: '', personality: [],
  speaking_style: { tone: '', preferences: [], avoid: [], catchphrase: '' },
  values: [], relationship: '', expertise: [], greeting: '', avatar: '', avatar_color: '#8b7d6b', is_public: false,
};

function tagify(v: string) { return v.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean); }

const PREVIEW_TEXT = '你好，我是你的创作伙伴。今天想写点什么？我陪你一起，把心里的故事慢慢说出来。';

export default function Personas() {
  const [list, setList] = useState<Persona[]>([]);
  const [edit, setEdit] = useState<Persona | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [pers, setPers] = useState('');
  const [prefs, setPrefs] = useState('');
  const [avoids, setAvoids] = useState('');
  const [values, setValues] = useState('');
  const [expertise, setExpertise] = useState('');
  const [catchphr, setCatchphr] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiMode, setAiMode] = useState<'generate' | 'polish'>('generate');
  const [aiErr, setAiErr] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewMsgs, setPreviewMsgs] = useState<{ role: string; content: string }[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tab, setTab] = useState<'mine' | 'preset' | 'public'>('mine');
  const [publicList, setPublicList] = useState<Persona[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [cloneBusy, setCloneBusy] = useState<string | null>(null);
  const [cloneMsg, setCloneMsg] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [voiceQ, setVoiceQ] = useState('');
  const [voiceResults, setVoiceResults] = useState<any[]>([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const libAudioRef = useRef<HTMLAudioElement | null>(null);

  // 加载音色列表（用于已绑定音色试听）
  useEffect(() => { api.get<{ list: VoiceProfile[] }>('/voice-profiles').then(d => setVoices(d.list)).catch(() => {}); }, []);

  const load = async () => {
    const d = await api.get<{ list: Persona[]; total: number }>('/personas?scope=' + tab + '&page=' + page + '&page_size=' + pageSize + (searchQ ? '&q=' + encodeURIComponent(searchQ) : ''));
    setList(d.list); setTotal(d.total);
    if (tab === 'public') setPublicList((await api.get<{ list: Persona[] }>('/personas?scope=public')).list);
  };
  useEffect(() => { load(); }, [tab, page, searchQ]);

  const openEdit = (p?: Persona) => {
    const base = p ? { ...p, speaking_style: { ...p.speaking_style } } : { ...EMPTY };
    setEdit(p || null);
    setForm(base);
    setPers((p?.personality || []).join('、'));
    setPrefs((p?.speaking_style?.preferences || []).join('、'));
    setAvoids((p?.speaking_style?.avoid || []).join('、'));
    setValues((p?.values || []).join('、'));
    setExpertise((p?.expertise || []).join('、'));
    setCatchphr(p?.speaking_style?.catchphrase || '');
    setPreviewMsgs([]);
    setAiResult(null); setAiPrompt(''); setAiErr('');
    setPreviewInput('');
    setModalOpen(true);
  };

  // 试听 Fish 广场音色（优先官方样例音频，无样例则 TTS 合成）
  const previewLibraryVoice = (item: any) => {
    stopSpeakTTS();
    if (libAudioRef.current) { try { libAudioRef.current.pause(); } catch {} libAudioRef.current = null; }
    if (item.sample_audio) {
      const a = new Audio(item.sample_audio);
      libAudioRef.current = a;
      a.play().catch(() => speakWithTTS(PREVIEW_TEXT, { voiceId: item.id }));
      return;
    }
    speakWithTTS(PREVIEW_TEXT, { voiceId: item.id });
  };

  // 试听已绑定音色（voice_profile_id → voice_id）
  const previewBoundVoice = () => {
    stopSpeakTTS();
    if (libAudioRef.current) { try { libAudioRef.current.pause(); } catch {} libAudioRef.current = null; }
    const newFishId = (form as any)._voiceId;
    const bound = form.voice_profile_id ? voices.find((v: VoiceProfile) => v.id === form.voice_profile_id) : null;
    const voiceId = newFishId || bound?.voice_id;
    if (!voiceId) return;
    speakWithTTS(PREVIEW_TEXT, { voiceId, rate: bound?.params?.rate, pitch: bound ? (bound.params.pitch || 0) / 2 + 1 : undefined });
  };

  const searchVoice = async () => {
    if (!voiceQ.trim()) return;
    setVoiceBusy(true);
    try {
      const d = await api.get<{ list: any[] }>('/voice-profiles/library/search?q=' + encodeURIComponent(voiceQ) + '&page_size=8');
      setVoiceResults(d.list);
    } catch { setVoiceResults([]); }
    finally { setVoiceBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    let body = { ...form, personality: tagify(pers), values: tagify(values), expertise: tagify(expertise), speaking_style: { ...form.speaking_style, tone: form.speaking_style.tone, preferences: tagify(prefs), avoid: tagify(avoids), catchphrase: catchphr } };
    try {
      if ((form as any)._voiceId && !body.voice_profile_id) {
        const fav = await api.post<{ voice: { id: string } }>('/voice-profiles/library/' + (form as any)._voiceId + '/add', { title: (form as any)._voiceTitle || 'Fish 音色' });
        body = { ...body, voice_profile_id: fav.voice.id };
      }
    } catch { /* 收藏失败则仍保存（不绑定音色） */ }
    delete (body as any)._voiceId; delete (body as any)._voiceTitle;
    try {
      if (edit) await api.patch(`/personas/${edit.id}`, body);
      else await api.post('/personas', body);
      completeTourStep('persona');
      setEdit(null);
      await load();
    } finally { setBusy(false); }
  };

  const clonePreset = async (p: Persona) => {
    setCloneBusy(p.id); setCloneMsg('');
    try {
      await api.post('/personas/' + p.id + '/clone');
      completeTourStep('persona');
      setCloneMsg('✅ 已基于「' + p.name + '」创建你的版本，可在「我的」中编辑');
      setTab('mine');
      await load();
    } catch (e: any) {
      setCloneMsg('⚠️ ' + (e?.message || '创建失败'));
    } finally { setCloneBusy(null); }
  };
  const clonePublic = async (p: Persona) => {
    await api.post(`/personas/${p.id}/clone`);
    setTab('mine');
    await load();
  };

  const remove = async (p: Persona) => {
    if (!confirm(`确定删除人设「${p.name}」？`)) return;
    await api.del(`/personas/${p.id}`);
    await load();
  };

  const tryChat = async () => {
    const content = previewInput.trim();
    if (!content || previewBusy || !form.name) return;
    const next = [...previewMsgs, { role: 'user', content }];
    setPreviewMsgs(next);
    setPreviewInput('');
    setPreviewBusy(true);
    try {
      const d = await api.post<{ reply: string; reply_type: string }>('/personas/preview', {
        persona: form,
        input: content,
        history: next,
      });
      setPreviewMsgs(prev => [...prev, { role: 'assistant', content: d.reply }]);
    } catch (e: any) {
      setPreviewMsgs(prev => [...prev, { role: 'assistant', content: '（出错了：' + e.message + '）' }]);
    } finally {
      setPreviewBusy(false);
    }
  };

  const runAI = async () => {
    if (!form.name && aiMode === 'generate' && !aiPrompt.trim()) { setAiErr('请先填写人设名称或描述创作方向'); return; }
    setAiBusy(true); setAiErr('');
    try {
      if (aiMode === 'generate') {
        const d = await api.post<{ result: any }>('/personas/ai/generate', { prompt: aiPrompt, name: form.name || undefined });
        setAiResult(d.result);
      } else {
        if (!edit) { setAiErr('请先保存人设后再润色'); return; }
        const d = await api.post<{ result: any }>('/personas/' + edit.id + '/ai/polish', { prompt: aiPrompt });
        setAiResult(d.result);
      }
    } catch (e: any) { setAiErr(e.message || 'AI 处理失败'); }
    finally { setAiBusy(false); }
  };

  const applyAI = async () => {
    if (!aiResult) return;
    const r = aiResult;
    setForm((f: any) => ({
      ...f,
      name: r.name || f.name, tagline: r.tagline || f.tagline, background: r.background || f.background,
      personality: Array.isArray(r.personality) ? r.personality : f.personality,
      speaking_style: {
        ...f.speaking_style,
        tone: r.speaking_style?.tone || f.speaking_style?.tone,
        preferences: Array.isArray(r.speaking_style?.preferences) ? r.speaking_style.preferences : f.speaking_style?.preferences || [],
        avoid: Array.isArray(r.speaking_style?.avoid) ? r.speaking_style.avoid : f.speaking_style?.avoid || [],
        catchphrase: r.speaking_style?.catchphrase || f.speaking_style?.catchphrase || '',
      },
      values: Array.isArray(r.values) ? r.values : f.values,
      relationship: r.relationship || f.relationship,
      expertise: Array.isArray(r.expertise) ? r.expertise : f.expertise,
      greeting: r.greeting || f.greeting,
      avatar_color: r.avatar_color || f.avatar_color,
    }));
    setPers((r.personality || []).join('、'));
    setValues((r.values || []).join('、'));
    setExpertise((r.expertise || []).join('、'));
    setPrefs((r.speaking_style?.preferences || []).join('、'));
    setAvoids((r.speaking_style?.avoid || []).join('、'));
    setCatchphr(r.speaking_style?.catchphrase || '');
    setAiResult(null); setAiPrompt(''); setAiErr('');
  };

  const uploadAvatar = async (file: File) => {
    if (!edit) { setAiErr('请先保存人设，再上传头像'); return; }
    if (file.size > 2 * 1024 * 1024) { setAiErr('图片不能超过 2MB'); return; }
    setAvatarBusy(true); setAiErr('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result || ''));
        rd.onerror = () => reject(new Error('读取失败'));
        rd.readAsDataURL(file);
      });
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) { setAiErr('不支持的图片格式'); return; }
      const d = await api.post<{ persona: Persona }>('/personas/' + edit.id + '/avatar', { data: m[2], mime: m[1] });
      setEdit(d.persona);
      setForm({ ...form, avatar: d.persona.avatar, avatar_color: d.persona.avatar_color });
      await load();
    } catch (e: any) { setAiErr(e.message || '上传失败'); }
    finally { setAvatarBusy(false); }
  };

  const inputCls = 'w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold">创作人设</h1>
            <p className="mt-1 text-ink/50">给你的缪斯一个灵魂——性格、语气、价值观都可以定义。</p>
          </div>
          <Button onClick={() => openEdit()} data-tour="tour-persona-create">＋ 新建人设</Button>
        </div>
        <div className="mb-6 flex rounded-xl bg-ink/5 p-1 text-sm">
          {([['mine', '我的人设'], ['preset', '官方预设'], ['public', '公开分享']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} className={'flex-1 rounded-lg px-4 py-2 transition ' + (tab === k ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink/50 hover:text-ink')}>{v}</button>
          ))}
        </div>

        <div className="mb-6 flex items-center gap-2">
          <input
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            placeholder="搜索人设：名称、性格、擅长领域…"
            className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className="shrink-0 text-xs text-ink/40">共 {total} 个</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tab === 'public' ? publicList : list).map(p => (
            <div key={p.id} className="rounded-2xl border border-ink/5 bg-surface p-5 shadow-soft transition hover:shadow-lift">
              <div className="mb-4 flex items-center gap-3">
                {p.avatar
                  ? <img src={'/api/v1' + p.avatar} alt={p.name} className="h-16 w-16 rounded-full object-cover shadow-soft" />
                  : <Avatar name={p.name} color={p.avatar_color} size="lg" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-serif text-lg font-semibold">{p.name}</h3>
                    {p.is_preset && <Badge color="accent">预设</Badge>}
                    {p.is_public && !p.is_preset && <Badge color="green">已分享</Badge>}
                    {tab === 'public' && <Badge color="green">公开</Badge>}
                  </div>
                  <p className="truncate text-sm text-ink/45">{p.tagline}</p>
                </div>
              </div>
              <p className="line-clamp-3 min-h-[60px] text-sm leading-6 text-ink/60">{p.background}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.personality || []).slice(0, 4).map(t => <Badge key={t}>{t}</Badge>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink/5 pt-3">
                {tab === 'public'
                  ? <Button variant="subtle" onClick={() => clonePublic(p)} className="text-xs">＋ 收藏到我的</Button>
                  : p.is_preset
                    ? <Button variant="subtle" onClick={() => clonePreset(p)} disabled={cloneBusy !== null} className="text-xs">{cloneBusy === p.id ? '创建中…' : '基于预设创建'}</Button>
                    : <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink/45" title="开启后其他用户可看到并收藏这个人设">
                          <input type="checkbox" checked={!!p.is_public} onChange={async e => { await api.patch('/personas/' + p.id, { is_public: e.target.checked }); await load(); }} className="accent-accent" />
                          分享
                        </label>
                        <Button variant="ghost" onClick={() => openEdit(p)} className="text-xs">编辑</Button>
                        <Button variant="danger" onClick={() => remove(p)} className="text-xs">删除</Button>
                      </div>}
                {!p.is_preset && <span className="text-xs text-ink/30">v{p.version}</span>}
              </div>
            </div>
          ))}
        </div>
        {total > pageSize && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/10 disabled:opacity-30"
            >上一页</button>
            <span className="text-sm text-ink/50">{page} / {Math.ceil(total / pageSize)}</span>
            <button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(page + 1)}
              className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/10 disabled:opacity-30"
            >下一页</button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setEdit(null); setForm(EMPTY); setModalOpen(false); }} title={edit ? `编辑人设 · ${edit.name}` : '新建人设'} wide>
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="relative">
            {form.avatar
              ? <img src={'/api/v1' + form.avatar} alt="头像" className="h-14 w-14 rounded-full object-cover shadow-soft" />
              : <Avatar name={form.name || '新'} color={form.avatar_color} size="lg" />}
            <button onClick={() => fileRef.current?.click()} disabled={avatarBusy} title="上传头像（png/jpg/webp/gif，≤2MB）"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white shadow transition hover:scale-105 disabled:opacity-50">📷</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
          </div>
          <div className="text-xs text-ink/45">
            {avatarBusy ? '上传中…' : '自定义头像 · 上传后立即生效'}
            <div className="mt-1 flex gap-2">
              <Button variant="subtle" onClick={() => { setAiMode('generate'); setAiPrompt(''); setAiResult(null); setAiErr(''); }} className="px-2 py-1 text-[11px]">✨ AI 生成人设</Button>
              {edit && <Button variant="subtle" onClick={() => { setAiMode('polish'); setAiPrompt(''); setAiResult(null); setAiErr(''); }} className="px-2 py-1 text-[11px]">✨ AI 润色人设</Button>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="姓名" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="例如：黎文" />
          <Input label="一句话定位" value={form.tagline} onChange={v => setForm({ ...form, tagline: v })} placeholder="例如：安静的倾听者" />
          <div className="sm:col-span-2"><Input label="背景故事" value={form.background} onChange={v => setForm({ ...form, background: v })} textarea rows={3} placeholder="他/她从哪里来，经历过什么" /></div>
          <Input label="性格（、分隔）" value={pers} onChange={setPers} placeholder="温和、耐心、敏锐" />
          <Input label="价值观（、分隔）" value={values} onChange={setValues} placeholder="真实比华丽重要" />
          <Input label="说话风格" value={form.speaking_style.tone} onChange={v => setForm({ ...form, speaking_style: { ...form.speaking_style, tone: v } })} placeholder="例如：平静而温暖" />
          <Input label="口头禅" value={catchphr} onChange={setCatchphr} placeholder="例如：嗯，这个故事有意思" />
          <Input label="与你的关系" value={form.relationship} onChange={v => setForm({ ...form, relationship: v })} placeholder="亦师亦友的编辑" />
          <Input label="偏好（、分隔）" value={prefs} onChange={setPrefs} placeholder="多用提问引导、偶尔引用一句诗" />
          <Input label="避免（、分隔）" value={avoids} onChange={setAvoids} placeholder="说教、替用户做决定" />
          <Input label="擅长领域（、分隔）" value={expertise} onChange={setExpertise} placeholder="叙事结构、人物塑造" />
          <Input label="开场白" value={form.greeting} onChange={v => setForm({ ...form, greeting: v })} placeholder="今天想讲点什么？" />
          <div className="sm:col-span-2 rounded-xl border border-ink/10 bg-paper/50 p-3">
            <p className="mb-2 text-xs font-semibold text-ink/60">🔊 绑定音色（可选）</p>
            {/* 我的音色：自己收藏/创建的音色直接选择 */}
            {voices.some(v => !v.is_preset) && (
              <div className="mb-2">
                <p className="mb-1.5 text-[11px] text-ink/45">我的音色（收藏 / 创建的）</p>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {voices.filter(v => !v.is_preset).map(v => {
                    const active = form.voice_profile_id === v.id && !form._voiceId;
                    return (
                      <span key={v.id} className={"flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition " + (active ? 'border-accent bg-accentlight text-ink font-medium' : 'border-ink/10 bg-surface text-ink/60 hover:border-accent/40')}>
                        <button onClick={() => setForm({ ...form, voice_profile_id: v.id, _voiceId: null, _voiceTitle: null })}
                          className="max-w-40 truncate" title={v.display_name}>{v.display_name}{active ? ' ✓' : ''}</button>
                        <button onClick={(e) => { e.stopPropagation(); speakWithTTS(PREVIEW_TEXT, { voiceId: v.voice_id }); }}
                          className="shrink-0 text-[10px] text-ink/40 hover:text-accent" title="试听">▶</button>
                      </span>
                    );
                  })}
                </div>
                <div className="my-2 flex items-center gap-2">
                  <span className="h-px flex-1 bg-ink/8" />
                  <span className="text-[10px] text-ink/30">或从音频广场搜索</span>
                  <span className="h-px flex-1 bg-ink/8" />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={voiceQ} onChange={e => setVoiceQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchVoice(); } }}
                placeholder="搜索 Fish 音频广场：温柔、旁白、爱莉希雅…"
                className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
              <Button variant="subtle" onClick={searchVoice} disabled={voiceBusy} className="px-3 text-xs">{voiceBusy ? '搜索中…' : '搜索'}</Button>
            </div>
            {voiceResults.length > 0 && (
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                {voiceResults.map(v => (
                  <div key={v.id} className={"flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition " + ((form as any)._voiceId === v.id ? 'bg-accentlight text-ink font-medium' : 'bg-surface text-ink/60 hover:bg-accentlight/50')}>
                    <button onClick={() => setForm({ ...form, _voiceId: v.id, _voiceTitle: v.title, voice_profile_id: null })}
                      className="min-w-0 flex-1 truncate text-left">{v.title}</button>
                    <span className="shrink-0 text-[10px] text-ink/35">{v.languages?.join('/') || ''}</span>
                    <button onClick={(e) => { e.stopPropagation(); previewLibraryVoice(v); }}
                      className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/55 transition hover:bg-accentlight hover:text-ink" title="试听">▶ 试听</button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-ink/40">{(form._voiceId || form.voice_profile_id) ? '已选：' + (form._voiceTitle || 'Fish 音色') + '（保存后会话朗读将使用此音色）' : '未绑定音色，会话时默认使用全局音色'}</p>
              {(form._voiceId || form.voice_profile_id) && (
                <button onClick={previewBoundVoice} className="shrink-0 rounded-full bg-accentlight/60 px-2.5 py-1 text-[10px] text-ink/70 transition hover:bg-accentlight">🔊 试听</button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2.5">
            <input type="checkbox" checked={!!form.is_public} onChange={e => setForm({ ...form, is_public: e.target.checked })} className="accent-accent" />
            <span className="text-sm text-ink/60">公开分享这个人设（其他用户可收藏）</span>
          </label>
          <Input label="头像颜色" value={form.avatar_color} onChange={v => setForm({ ...form, avatar_color: v })} type="color" />
        </div>
        <div className="mt-5 rounded-xl border border-ink/10 bg-paper/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink/60">💬 试聊预览（不保存）</p>
            <span className="text-[10px] text-ink/35">用当前配置即时生成回复</span>
          </div>
          <div className="mb-2 max-h-44 space-y-2 overflow-y-auto pr-1">
            {previewMsgs.length === 0 && <p className="py-3 text-center text-xs text-ink/35">先输入一句话，试试这个人设聊起来是什么感觉。</p>}
            {previewMsgs.map((m, idx) => (
              <div key={idx} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ' + (m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-ink/5 bg-surface shadow-soft')}>
                  {m.content}
                </div>
              </div>
            ))}
            {previewBusy && <p className="text-xs text-ink/40">正在思考…</p>}
          </div>
          <div className="flex gap-2">
            <input value={previewInput} onChange={e => setPreviewInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tryChat(); } }}
              placeholder={form.name ? '和「' + (form.name || '') + '」说句话…' : '先填写人设名称'}
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            <Button onClick={tryChat} disabled={previewBusy || !previewInput.trim() || !form.name} className="px-3 text-xs">发送</Button>
          </div>
        </div>
        {aiMode && (
          <div className="mt-4 rounded-xl border border-accent/25 bg-accentlight/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink/70">{aiMode === 'generate' ? '✨ AI 生成人设' : '✨ AI 润色人设'}</p>
              <div className="flex gap-1 text-[10px]">
                <button onClick={() => setAiMode('generate')} className={'rounded px-2 py-0.5 ' + (aiMode === 'generate' ? 'bg-accent text-white' : 'bg-ink/5 text-ink/50')}>生成</button>
                <button onClick={() => setAiMode('polish')} disabled={!edit} className={'rounded px-2 py-0.5 ' + (aiMode === 'polish' ? 'bg-accent text-white' : 'bg-ink/5 text-ink/50 disabled:opacity-40')}>润色</button>
              </div>
            </div>
            <div className="flex gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runAI(); } }}
                placeholder={aiMode === 'generate' ? '描述你想要的创作伙伴，例如：温柔、会讲故事的民国女作家' : '想怎么调整？例如：更犀利一点，话更少'}
                className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
              <Button onClick={runAI} disabled={aiBusy} className="px-3 text-xs">{aiBusy ? '生成中…' : '生成'}</Button>
            </div>
            {aiErr && <p className="mt-2 text-xs text-red-500">{aiErr}</p>}
            {aiResult && (
              <div className="mt-2 rounded-lg bg-surface p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink/70">预览</span>
                  <Button variant="subtle" onClick={applyAI} className="px-2 py-0.5 text-[11px]">采用到表单</Button>
                </div>
                <div className="max-h-40 overflow-y-auto text-xs leading-5 text-ink/60">
                  <p><b>{aiResult.name}</b>{aiResult.tagline ? ' · ' + aiResult.tagline : ''}</p>
                  <p className="mt-1 whitespace-pre-wrap">{aiResult.background}</p>
                  {(aiResult.personality || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{(aiResult.personality as string[]).map((t: string) => <Badge key={t}>{t}</Badge>)}</div>}
                  {aiResult.speaking_style?.catchphrase && <p className="mt-1 text-ink/50">口头禅：{aiResult.speaking_style.catchphrase}</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button onClick={save} disabled={busy || !form.name} className="flex-1">{busy ? '保存中…' : '保存人设'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)}>取消</Button>
        </div>
      </Modal>
    </Layout>
  );
}
