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

  const load = async () => { setList((await api.get<{ list: VoiceProfile[] }>('/voice-profiles')).list); };
  useEffect(() => { load(); }, []);

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
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">助手声色</h1>
            <p className="mt-1 text-ink/50">语速、音调、情绪——让缪斯的声音配得上它的性格。</p>
          </div>
          <Button onClick={() => openEdit()}>＋ 新建音色</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(v => (
            <div key={v.id} className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accentlight text-lg">🔊</div>
                  <div>
                    <h3 className="font-serif font-semibold">{v.display_name}</h3>
                    <p className="text-xs text-ink/40">{v.provider === 'system' ? '浏览器语音' : v.provider} {v.is_preset ? '· 预设' : ''}</p>
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
                {!v.is_preset
                  ? <div className="flex gap-2"><Button variant="ghost" onClick={() => openEdit(v)} className="text-xs">编辑</Button><Button variant="danger" onClick={() => remove(v)} className="text-xs">删除</Button></div>
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
    </Layout>
  );
}
