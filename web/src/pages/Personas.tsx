import { useEffect, useState } from 'react';
import { api, Persona } from '../lib/api';
import Layout from '../components/Layout';
import { Avatar, Button, Badge, Modal, Input } from '../components/ui';

const EMPTY: Omit<Persona, 'id' | 'is_preset' | 'version'> = {
  name: '', tagline: '', background: '', personality: [],
  speaking_style: { tone: '', preferences: [], avoid: [] },
  values: [], relationship: '', expertise: [], greeting: '', avatar_color: '#8b7d6b',
};

function tagify(v: string) { return v.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean); }

export default function Personas() {
  const [list, setList] = useState<Persona[]>([]);
  const [edit, setEdit] = useState<Persona | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [pers, setPers] = useState('');
  const [prefs, setPrefs] = useState('');
  const [avoids, setAvoids] = useState('');
  const [values, setValues] = useState('');
  const [expertise, setExpertise] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewMsgs, setPreviewMsgs] = useState<{ role: string; content: string }[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);

  const load = async () => { setList((await api.get<{ list: Persona[] }>('/personas')).list); };
  useEffect(() => { load(); }, []);

  const openEdit = (p?: Persona) => {
    const base = p ? { ...p, speaking_style: { ...p.speaking_style } } : { ...EMPTY };
    setEdit(p || null);
    setForm(base);
    setPers((p?.personality || []).join('、'));
    setPrefs((p?.speaking_style?.preferences || []).join('、'));
    setAvoids((p?.speaking_style?.avoid || []).join('、'));
    setValues((p?.values || []).join('、'));
    setExpertise((p?.expertise || []).join('、'));
    setPreviewMsgs([]);
    setPreviewInput('');
  };

  const save = async () => {
    setBusy(true);
    const body = { ...form, personality: tagify(pers), values: tagify(values), expertise: tagify(expertise), speaking_style: { ...form.speaking_style, tone: form.speaking_style.tone, preferences: tagify(prefs), avoid: tagify(avoids) } };
    try {
      if (edit) await api.patch(`/personas/${edit.id}`, body);
      else await api.post('/personas', body);
      setEdit(null);
      await load();
    } finally { setBusy(false); }
  };

  const clonePreset = async (p: Persona) => {
    await api.post(`/personas/${p.id}/clone`);
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

  const inputCls = 'w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">创作人设</h1>
            <p className="mt-1 text-ink/50">给你的创作教练一个灵魂——性格、语气、价值观都可以定义。</p>
          </div>
          <Button onClick={() => openEdit()}>＋ 新建人设</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(p => (
            <div key={p.id} className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition hover:shadow-lift">
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={p.name} color={p.avatar_color} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-serif text-lg font-semibold">{p.name}</h3>
                    {p.is_preset && <Badge color="accent">预设</Badge>}
                  </div>
                  <p className="truncate text-sm text-ink/45">{p.tagline}</p>
                </div>
              </div>
              <p className="line-clamp-3 min-h-[60px] text-sm leading-6 text-ink/60">{p.background}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.personality || []).slice(0, 4).map(t => <Badge key={t}>{t}</Badge>)}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink/5 pt-3">
                {p.is_preset
                  ? <Button variant="subtle" onClick={() => clonePreset(p)} className="text-xs">基于预设创建</Button>
                  : <div className="flex gap-2"><Button variant="ghost" onClick={() => openEdit(p)} className="text-xs">编辑</Button><Button variant="danger" onClick={() => remove(p)} className="text-xs">删除</Button></div>}
                {!p.is_preset && <span className="text-xs text-ink/30">v{p.version}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!edit || !!form.name || edit !== null} onClose={() => setEdit(null)} title={edit ? `编辑人设 · ${edit.name}` : '新建人设'} wide>
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <Input label="姓名" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="例如：黎文" />
          <Input label="一句话定位" value={form.tagline} onChange={v => setForm({ ...form, tagline: v })} placeholder="例如：安静的倾听者" />
          <div className="sm:col-span-2"><Input label="背景故事" value={form.background} onChange={v => setForm({ ...form, background: v })} textarea rows={3} placeholder="他/她从哪里来，经历过什么" /></div>
          <Input label="性格（、分隔）" value={pers} onChange={setPers} placeholder="温和、耐心、敏锐" />
          <Input label="价值观（、分隔）" value={values} onChange={setValues} placeholder="真实比华丽重要" />
          <Input label="说话风格" value={form.speaking_style.tone} onChange={v => setForm({ ...form, speaking_style: { ...form.speaking_style, tone: v } })} placeholder="例如：平静而温暖" />
          <Input label="与你的关系" value={form.relationship} onChange={v => setForm({ ...form, relationship: v })} placeholder="亦师亦友的编辑" />
          <Input label="偏好（、分隔）" value={prefs} onChange={setPrefs} placeholder="多用提问引导、偶尔引用一句诗" />
          <Input label="避免（、分隔）" value={avoids} onChange={setAvoids} placeholder="说教、替用户做决定" />
          <Input label="擅长领域（、分隔）" value={expertise} onChange={setExpertise} placeholder="叙事结构、人物塑造" />
          <Input label="开场白" value={form.greeting} onChange={v => setForm({ ...form, greeting: v })} placeholder="今天想讲点什么？" />
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
                <div className={'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ' + (m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-ink/5 bg-white shadow-soft')}>
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
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            <Button onClick={tryChat} disabled={previewBusy || !previewInput.trim() || !form.name} className="px-3 text-xs">发送</Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={save} disabled={busy || !form.name} className="flex-1">{busy ? '保存中…' : '保存人设'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)}>取消</Button>
        </div>
      </Modal>
    </Layout>
  );
}
