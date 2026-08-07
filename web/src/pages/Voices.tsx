import { useEffect, useState } from 'react';
import { api, VoiceProfile } from '../lib/api';
import Layout from '../components/Layout';
import { Button, Badge, Modal, Input } from '../components/ui';
import { speak, stopSpeak } from '../lib/speech';

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
  const [tab, setTab] = useState<'mine' | 'preset' | 'public'>('mine');
  const [publicList, setPublicList] = useState<VoiceProfile[]>([]);

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
    speak(PREVIEW_TEXT, { rate: v.params.rate, pitch: (v.params.pitch || 0) / 2 + 1 });
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
            <Button variant="subtle" onClick={() => { setCloneOpen(true); setCloneMsg(''); }} className="text-xs">🎙 克隆我的声音</Button>
            <Button onClick={() => openEdit()}>＋ 新建音色</Button>
          </div>
        </div>
        <div className="mb-6 flex rounded-xl bg-ink/5 p-1 text-sm">
          {([['mine', '我的音色'], ['preset', '官方预设'], ['public', '公开分享']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} className={'flex-1 rounded-lg px-4 py-2 transition ' + (tab === k ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink/50 hover:text-ink')}>{v}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tab === 'public' ? publicList : list).map(v => (
            <div key={v.id} className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition hover:shadow-lift">
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
            <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2.5">
              <input type="checkbox" checked={!!form.is_public} onChange={e => setForm({ ...form, is_public: e.target.checked })} className="accent-accent" />
              <span className="text-sm text-ink/60">公开分享这个音色（其他用户可收藏）</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink/60">提供商</span>
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none">
                <option value="system">浏览器语音（无需密钥）</option>
                <option value="volcengine">火山引擎</option>
                <option value="fish-audio">Fish Audio</option>
                <option value="openai">OpenAI TTS</option>
              </select>
            </label>
            {form.provider !== 'system' && <Input label="音色 ID" value={form.voice_id} onChange={v => setForm({ ...form, voice_id: v })} placeholder="厂商音色 ID" />}
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
