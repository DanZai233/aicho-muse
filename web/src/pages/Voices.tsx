import { useEffect, useState } from 'react';
import { api, VoiceProfile } from '../lib/api';
import Layout from '../components/Layout';
import { Button, Badge, Modal, Input } from '../components/ui';
import { speak, speakWithTTS, stopSpeak } from '../lib/speech';

const PREVIEW_TEXT = '你好，我是你的缪斯。今天想写点什么？';

export default function Voices() {
  const [list, setList] = useState<VoiceProfile[]>([]);
  const [edit, setEdit] = useState<VoiceProfile | null>(null);
  const [form, setForm] = useState<VoiceProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneMsg, setCloneMsg] = useState('');
  const [tab, setTab] = useState<'mine' | 'preset' | 'public' | 'library'>('mine');
  const [publicList, setPublicList] = useState<VoiceProfile[]>([]);
  const [libOpen, setLibOpen] = useState(false);
  const [libQ, setLibQ] = useState('');
  const [libItems, setLibItems] = useState<any[]>([]);
  const [libBusy, setLibBusy] = useState(false);
  const [libMsg, setLibMsg] = useState('');
  const [libTab, setLibTab] = useState<'mine' | 'preset' | 'public' | 'library'>('mine');

  const load = async () => { setList((await api.get<{ list: VoiceProfile[] }>('/voice-profiles?scope=' + tab)).list); if (tab === 'public') setPublicList((await api.get<{ list: VoiceProfile[] }>('/voice-profiles?scope=public')).list); };
  useEffect(() => { load(); }, [tab]);

  const openEdit = (v?: VoiceProfile) => {
    if (v) { setEdit(v); setForm({ ...v, params: { ...v.params } }); }
    else setEdit(null); setForm({ id: '', display_name: '', provider: 'system', voice_id: '', params: { rate: 1, pitch: 0, emotion: 'calm', energy: 0.6 }, speech_notes: '', is_preset: false });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      if (edit) await api.patch(`/voice-profiles/${edit.id}`, { display_name: form.display_name, provider: form.provider, voice_id: form.voice_id, params: form.params, speech_notes: form.speech_notes });
      else await api.post('/voice-profiles', { display_name: form.display_name, provider: form.provider, voice_id: form.voice_id, params: form.params, speech_notes: form.speech_notes });
      setEdit(null); setForm(null);
      await load();
    } finally { setBusy(false); }
  };

  const cloneVoice = async (v: VoiceProfile) => {
    await api.post(`/voice-profiles/${v.id}/clone`);
    setTab('mine');
    await load();
  };

  const searchLibrary = async (page = 1) => {
    setLibBusy(true); setLibMsg('');
    try {
      const d = await api.get<{ list: any[]; total: number }>('/voice-profiles/library/search?q=' + encodeURIComponent(libQ) + '&page=' + page + '&page_size=12');
      setLibItems(d.list);
      if (!d.list.length) setLibMsg('没有找到匹配的音色，换个关键词试试（如：温柔、旁白、磁性）');
    } catch (e: any) { setLibMsg('⚠️ ' + e.message); }
    finally { setLibBusy(false); }
  };

  const previewLib = (item: any) => {
    if (!item.sample_audio) return;
    const a = new Audio(item.sample_audio);
    a.play().catch(() => setLibMsg('试听失败：音频链接可能已过期，请重新搜索'));
  };

  const addLibVoice = async (item: any) => {
    setLibBusy(true); setLibMsg('');
    try {
      await api.post('/voice-profiles/library/' + item.id + '/add', { title: item.title, description: item.description, sample_audio: item.sample_audio });
      setLibMsg('✅ 已收藏「' + item.title + '」到我的音色');
      await load();
    } catch (e: any) { setLibMsg('⚠️ ' + e.message); }
    finally { setLibBusy(false); }
  };

  const submitClone = async () => {
    if (!cloneName.trim() || !cloneFile || !cloneConsent) return;
    setCloneBusy(true); setCloneMsg('');
    try {
      const buf = await cloneFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await api.post('/voice-profiles/clone/from-audio', {
        display_name: cloneName, audio_base64: base64, mime: cloneFile.type || 'audio/wav', consent: true,
      });
      setCloneMsg('✅ 克隆成功！新音色已加入「我的音色」');
      setCloneOpen(false); setCloneName(''); setCloneFile(null); setCloneConsent(false);
      setTab('mine'); await load();
    } catch (e: any) {
      setCloneMsg('⚠️ ' + e.message);
    } finally { setCloneBusy(false); }
  };

  const remove = async (v: VoiceProfile) => {
    if (!confirm(`删除音色「${v.display_name}」？`)) return;
    await api.del(`/voice-profiles/${v.id}`);
    await load();
  };

  const preview = (v: VoiceProfile) => {
    stopSpeak();
    if (v.provider === 'fish-audio' && v.voice_id) {
      speakWithTTS(PREVIEW_TEXT, { rate: v.params.rate, pitch: (v.params.pitch || 0) / 2 + 1, voiceId: v.voice_id });
    } else {
      speak(PREVIEW_TEXT, { rate: v.params.rate, pitch: (v.params.pitch || 0) / 2 + 1 });
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">助手声色</h1>
            <p className="mt-1 text-ink/50">语速、音调、情绪——让缪斯的声音配得上它的性格。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => { setLibOpen(true); setLibMsg(''); if (!libItems.length) searchLibrary(); }} className="text-xs">🎧 音频广场</Button>
            <Button variant="subtle" onClick={() => { setCloneOpen(true); setCloneMsg(''); }} className="text-xs">🎙 克隆我的声音</Button>
            <Button onClick={() => openEdit()}>＋ 新建音色</Button>
          </div>
        </div>
        <div className="mb-6 flex rounded-xl bg-ink/5 p-1 text-sm" data-tour="tour-voice-tabs">
          {([['mine', '我的音色'], ['preset', '官方预设'], ['public', '公开分享'], ['library', '音频广场']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} className={'flex-1 rounded-lg px-4 py-2 transition ' + (tab === k ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink/50 hover:text-ink')}>{v}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tab === 'library' ? (
            <div className="col-span-full rounded-2xl border border-dashed border-ink/15 bg-paper/40 p-10 text-center">
              <div className="text-4xl">🎧</div>
              <h3 className="mt-3 font-serif text-lg font-semibold">Fish Audio 音频广场</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink/50">搜索并试听官方公开音色库（上百种语言与风格），一键收藏到「我的音色」，即可在对话朗读中使用。</p>
              <Button onClick={() => { setLibOpen(true); setLibMsg(''); if (!libItems.length) searchLibrary(); }} className="mt-4">打开音频广场</Button>
            </div>
          ) : (tab === 'public' ? publicList : list).map(v => (
            <div key={v.id} className="rounded-2xl border border-ink/5 bg-surface p-5 shadow-soft transition hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accentlight text-lg">🔊</div>
                  <div>
                    <h3 className="font-serif font-semibold">{v.display_name}</h3>
                    <p className="text-xs text-ink/40">{v.provider === 'system' ? '浏览器语音' : v.provider} {v.is_preset ? '· 预设' : ''}{v.is_public && !v.is_preset ? ' · 已分享' : ''}{tab === 'public' ? ' · 公开' : ''}</p>
                  </div>
                </div>
                <Button variant="subtle" onClick={() => preview(v)} className="text-xs">试听</Button>
              </div>
              <div className="space-y-1.5 text-xs text-ink/50">
                <div className="flex justify-between"><span>语速</span><span>{v.params.rate?.toFixed(2) ?? 1}</span></div>
                <div className="flex justify-between"><span>音调</span><span>{v.params.pitch ?? 0}</span></div>
                <div className="flex justify-between"><span>情绪</span><Badge>{v.params.emotion || 'calm'}</Badge></div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink/5 pt-3">
                {tab === 'public'
                  ? <Button variant="subtle" onClick={() => cloneVoice(v)} className="text-xs">＋ 收藏到我的</Button>
                  : !v.is_preset
                    ? <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink/45" title="开启后其他用户可看到并收藏这个音色">
                          <input type="checkbox" checked={!!v.is_public} onChange={async e => { await api.patch('/voice-profiles/' + v.id, { is_public: e.target.checked }); await load(); }} className="accent-accent" />
                          分享
                        </label>
                        <Button variant="ghost" onClick={() => openEdit(v)} className="text-xs">编辑</Button>
                        <Button variant="danger" onClick={() => remove(v)} className="text-xs">删除</Button>
                      </div>
                    : <span className="text-xs text-ink/30">预设音色</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={edit ? `编辑音色 · ${edit.display_name}` : '新建音色'}>
        {form && (
          <div className="space-y-4">
            <Input label="音色名称" value={form.display_name} onChange={v => setForm({ ...form, display_name: v })} placeholder="例如：温润男声" />
            {form.source === 'fish-library' && (
              <p className="rounded-lg bg-accentlight/40 px-3 py-2 text-xs text-ink/55">🔒 音频广场收藏音色，提供商与音色 ID 由 Fish Audio 固定，不可修改（可调整名称、语速、音调与分享状态）。</p>
            )}
            <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2.5">
              <input type="checkbox" checked={!!form.is_public} onChange={e => setForm({ ...form, is_public: e.target.checked })} className="accent-accent" />
              <span className="text-sm text-ink/60">公开分享这个音色（其他用户可收藏）</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink/60">提供商</span>
              <select value={form.provider} disabled={form.source === 'fish-library'} onChange={e => setForm({ ...form, provider: e.target.value })} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60">
                <option value="system">浏览器语音（无需密钥）</option>
                <option value="volcengine">火山引擎</option>
                <option value="fish-audio">Fish Audio</option>
                <option value="openai">OpenAI TTS</option>
              </select>
            </label>
            {form.provider !== 'system' && <Input label="音色 ID" value={form.voice_id} disabled={form.source === 'fish-library'} onChange={v => setForm({ ...form, voice_id: v })} placeholder="厂商音色 ID" />}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink/60">语速 {form.params.rate}</span>
                <input type="range" min={0.6} max={1.5} step={0.05} value={form.params.rate} onChange={e => setForm({ ...form, params: { ...form.params, rate: Number(e.target.value) } })} className="w-full accent-accent" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink/60">音调 {form.params.pitch}</span>
                <input type="range" min={-2} max={2} step={0.1} value={form.params.pitch} onChange={e => setForm({ ...form, params: { ...form.params, pitch: Number(e.target.value) } })} className="w-full accent-accent" />
              </label>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-paper/70 px-3 py-2.5">
              <button onClick={() => preview(form)} className="text-sm text-accent hover:underline">🔊 试听当前设置</button>
              <button onClick={() => stopSpeak()} className="text-xs text-ink/40 hover:text-ink">停止</button>
            </div>
            <Button onClick={save} disabled={busy || !form.display_name} className="w-full">{busy ? '保存中…' : '保存音色'}</Button>
          </div>
        )}
      </Modal>
      <Modal open={libOpen} onClose={() => setLibOpen(false)} title="🎧 Fish Audio 音频广场" wide>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={libQ} onChange={e => setLibQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchLibrary(); } }}
              placeholder="搜索公开音色库，例如：温柔、旁白、磁性、日语"
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            <Button onClick={() => searchLibrary()} disabled={libBusy} className="px-4 text-xs">{libBusy ? '搜索中…' : '搜索'}</Button>
          </div>
          {libMsg && <p className="rounded-lg bg-paper/70 px-3 py-2 text-xs text-ink/60">{libMsg}</p>}
          <div className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {libItems.map(item => (
              <div key={item.id} className="rounded-2xl border border-ink/5 bg-paper/60 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-semibold">{item.title}</h4>
                  <div className="flex shrink-0 gap-1.5">
                    {item.sample_audio && <Button variant="subtle" onClick={() => previewLib(item)} className="px-2 py-1 text-[11px]">▶ 试听</Button>}
                    <Button variant="subtle" onClick={() => addLibVoice(item)} disabled={libBusy} className="px-2 py-1 text-[11px]">＋ 收藏</Button>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-ink/50">{item.description || '（无描述）'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(item.languages || []).slice(0, 3).map((l: string) => <Badge key={l}>{l}</Badge>)}
                  {(item.tags || []).slice(0, 4).map((t: string) => <span key={t} className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink/40">{t}</span>)}
                </div>
              </div>
            ))}
            {!libBusy && libOpen && libItems.length === 0 && !libMsg && (
              <p className="col-span-full py-8 text-center text-sm text-ink/35">输入关键词搜索 Fish Audio 官方音频广场的音色，收藏后即可在对话中朗读使用。</p>
            )}
          </div>
        </div>
      </Modal>
      <Modal open={cloneOpen} onClose={() => setCloneOpen(false)} title="克隆我的声音">
        <div className="space-y-4">
          <p className="rounded-xl bg-accentlight/30 px-3 py-2.5 text-xs leading-5 text-ink/60">
            🎙 上传一段 <b>10–60 秒</b> 的清晰录音（安静环境、正常语速），Aicho Muse 会通过克隆服务生成一个只属于你的音色。
            需要你明确授权：这段样本仅用于本次克隆，不会用于其他用途。
          </p>
          <Input label="音色名称" value={cloneName} onChange={setCloneName} placeholder="例如：我的声音" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">录音样本（wav / mp3 / m4a）</span>
            <input type="file" accept="audio/*" onChange={e => setCloneFile(e.target.files?.[0] || null)} className="block w-full text-sm text-ink/60 file:mr-3 file:rounded-lg file:border-0 file:bg-accentlight file:px-3 file:py-1.5 file:text-xs file:text-ink hover:file:bg-accentlight/70" />
            {cloneFile && <span className="mt-1 block text-xs text-ink/40">{cloneFile.name} · {(cloneFile.size / 1024).toFixed(0)} KB</span>}
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2.5 text-sm text-ink/60">
            <input type="checkbox" checked={cloneConsent} onChange={e => setCloneConsent(e.target.checked)} className="mt-0.5 accent-accent" />
            <span>我确认这段录音是我的声音，并授权用于生成专属音色（仅本次克隆使用）。</span>
          </label>
          {cloneMsg && <p className="rounded-lg bg-paper/70 px-3 py-2 text-xs text-ink/60">{cloneMsg}</p>}
          <Button onClick={submitClone} disabled={cloneBusy || !cloneName.trim() || !cloneFile || !cloneConsent} className="w-full">
            {cloneBusy ? '生成中…（约 30 秒）' : '开始克隆'}
          </Button>
        </div>
      </Modal>
    </Layout>
  );
}
