import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Badge, Modal } from '../components/ui';

type Stats = { users: number; projects: number; chapters: number; conversations: number; messages: number; messages_today: number; conversations_today: number; ai_provider: string; ai_model?: string; memories?: number; reply_types?: Record<string, number>; trend?: { date: string; messages: number; new_users: number; new_projects: number; new_conversations: number }[] };
type AdminUser = { id: string; email: string; display_name: string; status?: string; created_at: string; projects?: number; conversations?: number; messages?: number; memories?: number; last_active?: string | null };
type FeedbackItem = { id: string; user_id: string; user_email?: string | null; user_name?: string | null; contact: string; content: string; page: string; status: string; note?: string; created_at: string; updated_at?: string };
type LetterFeedbackItem = { id: string; type: string; content: string; contact: string; status: string; created_at: string };

const inputCls = 'w-full rounded-lg border border-ink/25 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

function adminHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('am_admin_token')}` };
}
async function adminGet<T>(p: string): Promise<T> {
  const r = await fetch('/api/v1/admin' + p, { headers: adminHeaders() });
  const j = await r.json();
  if (!r.ok || j.code !== 0) throw new Error(j.message || '请求失败');
  return j.data as T;
}
async function adminSend<T>(p: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch('/api/v1/admin' + p, { method, headers: adminHeaders(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok || j.code !== 0) throw new Error(j.message || '请求失败');
  return j.data as T;
}

export default function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'stats' | 'users' | 'settings' | 'presets' | 'feedback' | 'letter-feedback' | 'admins'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [presets, setPresets] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<{ id: string; recommended?: boolean; disabled?: boolean; note?: string }[] | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState('');
  const [letterFeedback, setLetterFeedback] = useState<LetterFeedbackItem[]>([]);
  const [letterFbFilter, setLetterFbFilter] = useState('');
  const [letterFbErr, setLetterFbErr] = useState('');
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [personaOptions, setPersonaOptions] = useState<any[]>([]);
  const [voiceOptions, setVoiceOptions] = useState<any[]>([]);
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', role: 'admin' });
  // 预设人设表单（表格）状态
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [personaEditId, setPersonaEditId] = useState<string | null>(null); // null=新建
  const [personaForm, setPersonaForm] = useState({
    name: '', tagline: '', background: '', personality: '', // 逗号分隔
    tone: '', preferences: '', avoid: '', values: '', relationship: '', expertise: '',
    greeting: '', avatar_color: '#8b7d6b',
  });
  const [aiDesc, setAiDesc] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [voiceCandidates, setVoiceCandidates] = useState<any[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceSearchBusy, setVoiceSearchBusy] = useState(false);
  const [voiceSel, setVoiceSel] = useState<any>(null); // { id, title, sample_audio }
  const [previewAudio, setPreviewAudio] = useState<any>(null);
  const origSettingsRef = useRef<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const isAuthed = !!localStorage.getItem('am_admin_token');
  useEffect(() => { if (!isAuthed) nav('/admin/login'); }, []);
  if (!isAuthed) return null;

  const loadStats = async () => { setStats(await adminGet<Stats>('/stats')); };
  const loadUsers = async () => { setUsers((await adminGet<{ list: AdminUser[] }>('/users')).list); };
  const mask = (v?: string) => (v ? '******' : '');
  const loadSettings = async () => {
    const s = (await adminGet<{ settings: any }>('/settings')).settings;
    origSettingsRef.current = JSON.parse(JSON.stringify(s));
    setSettings({
      ...s,
      ai: { ...s.ai, api_key: mask(s.ai.api_key), llm_api_key: mask(s.ai.llm_api_key) },
      tts: { ...s.tts, api_key: mask(s.tts?.api_key) },
      stt: { ...s.stt, api_key: mask(s.stt?.api_key) },
      voice_clone: { ...s.voice_clone, api_key: mask(s.voice_clone?.api_key) },
    });
  };
  const loadPresets = async () => { setPresets(await adminGet('/presets')); };
  const loadProviders = async () => {
    try { setProviders((await adminGet<{ providers: any[] }>('/llm-providers')).providers); } catch (e: any) { setErr(e.message); }
  };
  const loadModels = async () => {
    setModelsBusy(true); setModels(null);
    try { setModels((await adminGet<{ models: any[] }>('/ai/models')).models); setErr(''); }
    catch (e: any) { setModels([]); setErr('模型列表查询失败：' + e.message); }
    finally { setModelsBusy(false); }
  };

  const loadAdmins = async () => { try { setAdmins((await adminGet<{ list: any[] }>('/admins')).list); } catch (e: any) { setErr(e.message); } };
  const loadFeedback = async () => {
    try { setFeedback((await adminGet<{ list: FeedbackItem[] }>('/feedback' + (feedbackFilter ? '?status=' + feedbackFilter : ''))).list); }
    catch (e: any) { setErr(e.message); }
  };
  const loadLetterFeedback = async () => {
    try {
      setLetterFbErr('');
      const q = letterFbFilter ? '?status=' + letterFbFilter : '';
      setLetterFeedback((await adminGet<{ list: LetterFeedbackItem[] }>('/letter-feedback' + q)).list);
    } catch (e: any) { setLetterFbErr(e.message); setLetterFeedback([]); }
  };
  const setLetterFbStatus = async (f: LetterFeedbackItem, status: string) => {
    try { await adminSend('/letter-feedback/' + f.id, 'PATCH', { status }); setErr(''); flash('信笺反馈已更新'); loadLetterFeedback(); }
    catch (e: any) { setErr(e.message); }
  };
  const loadOptions = async () => {
    try {
      const [ps, vj] = await Promise.all([
        adminGet<{ personas: any[]; voices: any[] }>('/presets').catch(() => ({ personas: [], voices: [] })),
        fetch('/api/v1/personas?page_size=100', { headers: adminHeaders() }).then(r => r.json()).catch(() => ({ data: { list: [] } })),
      ]);
      const all = (ps.personas || []).concat(vj.data?.list || []);
      setPersonaOptions(all);
    } catch { /* ignore */ }
    try {
      const r = await fetch('/api/v1/voice-profiles?page_size=100', { headers: adminHeaders() });
      const j = await r.json();
      setVoiceOptions(j.data?.list || []);
    } catch { /* ignore */ }
  };

  const editUser = async (u: AdminUser) => {
    const name = prompt('修改显示名称：', u.display_name);
    if (!name) return;
    try { await adminSend('/users/' + u.id, 'PATCH', { display_name: name }); setErr(''); flash('用户已更新'); loadUsers(); }
    catch (e: any) { setErr(e.message); }
  };

  const delPreset = async (type: 'persona' | 'voice', item: any) => {
    if (String(item.id).startsWith('preset-')) { setErr('内置官方预设不可删除（永久落库）'); return; }
    if (!confirm('删除预设「' + (item.name || item.display_name) + '」？')) return;
    try {
      await adminSend('/presets/' + (type === 'persona' ? 'personas' : 'voices') + '/' + item.id, 'DELETE');
      setErr(''); flash('预设已删除'); loadPresets();
    } catch (e: any) { setErr(e.message); }
  };

  // ---- 预设人设完整表单 ----
  const splitList = (s: string) => s.split(/[,，、\n]/).map(x => x.trim()).filter(Boolean).slice(0, 8);

  const openPersonaForm = (p: any = null) => {
    setPersonaEditId(p?.id || null);
    setPersonaForm(p ? {
      name: p.name || '',
      tagline: p.tagline || '',
      background: p.background || '',
      personality: (p.personality || []).join('，'),
      tone: p.speaking_style?.tone || '',
      preferences: (p.speaking_style?.preferences || []).join('，'),
      avoid: (p.speaking_style?.avoid || []).join('，'),
      values: (p.values || []).join('，'),
      relationship: p.relationship || '',
      expertise: (p.expertise || []).join('，'),
      greeting: p.greeting || '',
      avatar_color: p.avatar_color || '#8b7d6b',
    } : { name: '', tagline: '', background: '', personality: '', tone: '', preferences: '', avoid: '', values: '', relationship: '', expertise: '', greeting: '', avatar_color: '#8b7d6b' });
    setVoiceSel(p?.voice_profile_id ? { id: p.voice_profile_id, title: p.voice_name || '已绑定音色' } : null);
    setVoiceCandidates([]);
    setVoiceSearch('');
    setAiDesc('');
    setAiMsg('');
    setErr('');
    setPersonaModalOpen(true);
  };

  const savePersonaForm = async () => {
    if (!personaForm.name.trim()) { setErr('角色名必填'); return; }
    const body = {
      name: personaForm.name.trim(),
      tagline: personaForm.tagline.trim(),
      background: personaForm.background.trim(),
      personality: splitList(personaForm.personality),
      speaking_style: {
        tone: personaForm.tone.trim(),
        preferences: splitList(personaForm.preferences),
        avoid: splitList(personaForm.avoid),
      },
      values: splitList(personaForm.values),
      relationship: personaForm.relationship.trim(),
      expertise: splitList(personaForm.expertise),
      greeting: personaForm.greeting.trim(),
      avatar_color: personaForm.avatar_color,
      voice_profile_id: voiceSel?.id || null,
    };
    try {
      if (personaEditId) {
        await adminSend('/presets/personas/' + personaEditId, 'PATCH', body);
      } else {
        await adminSend('/presets/personas', 'POST', body);
      }
      setErr(''); flash(personaEditId ? '预设人设已更新' : '预设人设已添加');
      setPersonaModalOpen(false);
      loadPresets();
    } catch (e: any) { setErr(e.message); }
  };

  // AI 自动生成：描述 → 人设字段 + 音色候选
  const aiGenerate = async () => {
    if (aiDesc.trim().length < 2) { setErr('请先描述角色，例如：陆沉，光与夜之恋，万甄集团CEO血族，温柔神秘'); return; }
    setAiBusy(true); setAiMsg(''); setErr('');
    try {
      const d = await adminSend<{ persona: any; voices: any[] }>('/presets/ai-generate', 'POST', { description: aiDesc });
      const p = d.persona || {};
      setPersonaForm({
        name: p.name || '', tagline: p.tagline || '', background: p.background || '',
        personality: (p.personality || []).join('，'),
        tone: p.speaking_style?.tone || '',
        preferences: (p.speaking_style?.preferences || []).join('，'),
        avoid: (p.speaking_style?.avoid || []).join('，'),
        values: (p.values || []).join('，'),
        relationship: p.relationship || '',
        expertise: (p.expertise || []).join('，'),
        greeting: p.greeting || '',
        avatar_color: p.avatar_color || '#8b7d6b',
      });
      setVoiceCandidates(d.voices || []);
      setVoiceSel(null);
      setAiMsg('已生成，请核对并补充，然后保存');
      if (d.voices?.length) setVoiceSearch(p.name || '');
    } catch (e: any) { setErr(e.message); }
    finally { setAiBusy(false); }
  };

  // 音色广场搜索
  const searchVoices = async (q?: string) => {
    const kw = (q !== undefined ? q : voiceSearch).trim();
    if (!kw) return;
    setVoiceSearchBusy(true);
    try {
      const r = await fetch('/api/v1/voice-profiles/library/search?q=' + encodeURIComponent(kw) + '&page_size=12', { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok || j.code !== 0) throw new Error(j.message || '音色搜索失败');
      setVoiceCandidates(j.data?.list || []);
    } catch (e: any) { setAiMsg(e.message); }
    finally { setVoiceSearchBusy(false); }
  };

  const stopPreview = () => { if (previewAudio) { previewAudio.pause(); previewAudio.src = ''; setPreviewAudio(null); } };
  const playSample = (item: any) => {
    if (!item.sample_audio) return;
    stopPreview();
    const a = new Audio(item.sample_audio);
    a.play().catch(() => {});
    setPreviewAudio(a);
  };

  const editPreset = async (type: 'persona' | 'voice', item: any) => {
    if (String(item.id).startsWith('preset-')) { setErr('内置官方预设不可编辑（如需调整请克隆为自定义预设）'); return; }
    if (type === 'persona') { openPersonaForm(item); return; }
    const name = prompt('修改预设音色名称：', item.display_name);
    if (!name) return;
    try {
      await adminSend('/presets/voices/' + item.id, 'PATCH', { display_name: name });
      setErr(''); flash('预设已更新'); loadPresets();
    } catch (e: any) { setErr(e.message); }
  };

  const addAdmin = async () => {
    if (!newAdmin.username || !newAdmin.password) { setErr('用户名和密码必填'); return; }
    try {
      await adminSend('/admins', 'POST', newAdmin);
      setNewAdmin({ username: '', password: '', role: 'admin' }); setErr(''); flash('管理员已添加'); loadAdmins();
    } catch (e: any) { setErr(e.message); }
  };

  const delAdmin = async (a: any) => {
    if (!confirm('删除管理员 ' + a.username + '？')) return;
    try { await adminSend('/admins/' + a.id, 'DELETE'); setErr(''); flash('管理员已删除'); loadAdmins(); }
    catch (e: any) { setErr(e.message); }
  };

  const changePassword = async () => {
    if (!passwordForm.old_password || !passwordForm.new_password) { setPwMsg('请填写旧密码和新密码'); return; }
    if (passwordForm.new_password.length < 8) { setPwMsg('新密码至少 8 位'); return; }
    if (passwordForm.new_password !== passwordForm.confirm) { setPwMsg('两次输入的新密码不一致'); return; }
    try {
      await adminSend('/me/password', 'POST', { old_password: passwordForm.old_password, new_password: passwordForm.new_password });
      setPasswordForm({ old_password: '', new_password: '', confirm: '' }); setPwMsg(''); flash('密码已修改，请牢记新密码');
    } catch (e: any) { setErr(e.message); }
  };

  const setUserStatus = async (u: AdminUser, status: string) => {
    if (!confirm((status === 'disabled' ? '禁用' : '恢复') + '用户 ' + u.display_name + '？' + (status === 'disabled' ? '其将无法登录' : ''))) return;
    try { await adminSend('/users/' + u.id, 'PATCH', { status }); setErr(''); flash('已' + (status === 'disabled' ? '禁用' : '恢复')); loadUsers(); }
    catch (e: any) { setErr(e.message); }
  };

  const setFeedbackStatus = async (f: FeedbackItem, status: string) => {
    try { await adminSend('/feedback/' + f.id, 'PATCH', { status }); setErr(''); flash('反馈已更新'); loadFeedback(); }
    catch (e: any) { setErr(e.message); }
  };

  const resetData = async () => {
    if (!confirm('⚠️ 将清空全部用户、作品、消息与设置（内置官方预设除外），且不可恢复！确定？')) return;
    if (!confirm('再次确认：真的要重置全部数据吗？')) return;
    try { await adminSend('/data/reset', 'POST'); setErr(''); flash('数据已重置'); loadStats(); loadUsers(); loadSettings(); loadPresets(); }
    catch (e: any) { setErr(e.message); }
  };

  useEffect(() => {
    loadStats(); loadUsers(); loadSettings(); loadPresets(); loadProviders(); loadAdmins(); loadFeedback(); loadOptions();
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const logout = () => { localStorage.removeItem('am_admin_token'); nav('/admin/login'); };

  const delUser = async (u: AdminUser) => {
    if (!confirm(`删除用户 ${u.email} 及其全部数据？`)) return;
    try { await adminSend(`/users/${u.id}`, 'DELETE'); setErr(''); flash('用户已删除'); loadStats(); loadUsers(); }
    catch (e: any) { setErr(e.message); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      const body = JSON.parse(JSON.stringify(settings));
      const clean = (o: any, keys: string[]) => { for (const k of keys) if (o[k] === '******') delete o[k]; };
      clean(body.ai || {}, ['api_key', 'llm_api_key']);
      clean(body.tts || {}, ['api_key']);
      clean(body.stt || {}, ['api_key']);
      clean(body.voice_clone || {}, ['api_key']);
      await adminSend('/settings', 'PATCH', body);
      setErr(''); flash('设置已保存');
      loadSettings();
    } catch (e: any) { setErr(e.message); }
  };

  const addPreset = async (type: 'persona' | 'voice') => {
    const name = prompt(type === 'persona' ? '预设人设名称：' : '预设音色名称：');
    if (!name) return;
    try {
      if (type === 'persona') await adminSend('/presets/personas', 'POST', { name });
      else await adminSend('/presets/voices', 'POST', { display_name: name });
      setErr(''); flash('预设已添加'); loadPresets();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="admin-root min-h-screen bg-ink/95 text-paper">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper font-serif text-lg font-bold text-ink">A</div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">Aicho Muse 管理后台</h1>
              <p className="text-sm text-paper/50">管理员 {localStorage.getItem('am_admin_name') || 'admin'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/" className="rounded-lg px-3 py-1.5 text-sm text-paper/60 hover:bg-white/10 hover:text-paper">返回前台</a>
            <Button variant="subtle" onClick={logout} className="bg-white/10 text-paper hover:bg-white/20">退出</Button>
          </div>
        </header>

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 text-sm">
          {([['stats', '数据概览'], ['users', '用户管理'], ['feedback', '用户反馈'], ['letter-feedback', '信笺反馈'], ['settings', '系统设置'], ['presets', '预设管理'], ['admins', '管理员']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-2 py-2 transition sm:px-4 ${tab === k ? 'bg-paper text-ink font-medium' : 'text-paper/60 hover:text-paper'}`}>{v}</button>
          ))}
        </nav>

        {msg && <div className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{msg}</div>}
        {err && <div className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</div>}

        {tab === 'stats' && stats && (
          <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['注册用户', stats.users], ['作品', stats.projects], ['章节', stats.chapters], ['会话', stats.conversations],
              ['消息总量', stats.messages], ['今日消息', stats.messages_today], ['今日会话', stats.conversations_today], ['AI 引擎', stats.ai_provider === 'none' ? '内置' : (stats.ai_model ? stats.ai_provider + ' · ' + stats.ai_model : stats.ai_provider)],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-2xl bg-white/5 p-5">
                <p className="text-sm text-paper/50">{label}</p>
                <p className="mt-1 font-serif text-3xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          {stats.reply_types && (
            <div className="mt-4 rounded-2xl bg-white/5 p-5">
              <h3 className="mb-3 font-serif text-lg font-semibold">回复类型分布</h3>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  ['提问', stats.reply_types.question, 'accent'],
                  ['反馈', stats.reply_types.feedback, 'amber'],
                  ['建议', stats.reply_types.suggestion, 'default'],
                  ['鼓励', stats.reply_types.encouragement, 'green'],
                  ['其他', stats.reply_types.other, 'default'],
                ].map(([label, v]) => (
                  <div key={label as string} className="rounded-xl bg-white/5 px-4 py-3">
                    <p className="text-sm text-paper/50">{label}</p>
                    <p className="mt-1 font-serif text-2xl font-semibold">{v as number}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.trend && (
            <div className="mt-4 rounded-2xl bg-white/5 p-5">
              <h3 className="mb-3 font-serif text-lg font-semibold">近 7 天趋势</h3>
              <div className="grid gap-4 lg:grid-cols-4">
                {(['messages', 'new_users', 'new_projects', 'new_conversations'] as const).map(k => (
                  <div key={k}>
                    <p className="mb-2 text-xs text-paper/50">{k === 'messages' ? '消息' : k === 'new_users' ? '新增用户' : k === 'new_projects' ? '新作品' : '新会话'}</p>
                    <div className="flex items-end gap-1.5" style={{ height: 64 }}>
                      {stats.trend!.map(t => {
                        const max = Math.max(1, ...stats.trend!.map(x => x[k]));
                        const h = Math.max(4, Math.round((t[k] / max) * 56));
                        return (
                          <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[9px] text-paper/50">{t[k]}</span>
                            <div className="w-full rounded-t bg-accent/70" style={{ height: h }} title={t.date + ' ' + t[k]} />
                            <span className="text-[8px] text-paper/35">{t.date.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        )}

        {tab === 'users' && (
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">用户列表（{users.length}）</h2>
            </div>
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.display_name}</span>
                      {u.status === 'disabled' && <Badge color="amber">已禁用</Badge>}
                    </div>
                    <div className="text-sm text-paper/40">{u.email} · 注册于 {new Date(u.created_at).toLocaleDateString()}{u.last_active ? ' · 最近活跃 ' + new Date(u.last_active).toLocaleDateString() : ''}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-paper/50">
                      <span className="rounded-full bg-white/5 px-2 py-0.5">作品 {u.projects ?? 0}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5">会话 {u.conversations ?? 0}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5">消息 {u.messages ?? 0}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5">记忆 {u.memories ?? 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="subtle" onClick={() => editUser(u)} className="bg-white/10 px-2.5 py-1 text-xs text-paper hover:bg-white/20">编辑</Button>
                    {u.status === 'disabled'
                      ? <Button variant="subtle" onClick={() => setUserStatus(u, 'active')} className="bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25">恢复</Button>
                      : <Button variant="subtle" onClick={() => setUserStatus(u, 'disabled')} className="bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/25">禁用</Button>}
                    <Button variant="danger" onClick={() => delUser(u)} className="bg-red-500/20 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/30">删除</Button>
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="py-8 text-center text-paper/40">暂无注册用户</p>}
            </div>
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">AI 配置</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">LLM 引擎（UniLLM 多厂商）</span>
                  <select value={settings.ai.llm_provider || 'none'} onChange={e => {
                    const p = providers.find(x => x.id === e.target.value);
                    setSettings({ ...settings, ai: { ...settings.ai, llm_provider: e.target.value, llm_model: p?.defaultModels?.[0] || '' } });
                  }} className={inputCls + ' bg-ink/80'}>
                    <option value="none">内置规则教练（无需 Key）</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                {settings.ai.llm_provider && settings.ai.llm_provider !== 'none' && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs text-paper/50">API Key（UniLLM）</span>
                      <input value={settings.ai.llm_api_key} onChange={e => setSettings({ ...settings, ai: { ...settings.ai, llm_api_key: e.target.value } })} type="password" className={inputCls + ' bg-ink/80'} placeholder="sk-... 或火山/通义等对应 Key" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-paper/50">模型（默认取厂商推荐，可改）</span>
                      <input value={settings.ai.llm_model} onChange={e => setSettings({ ...settings, ai: { ...settings.ai, llm_model: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="deepseek-chat / qwen-plus / gemini-2.5-flash…" />
                    </label>
                    {settings.ai.llm_provider === 'custom' && (
                      <label className="block">
                        <span className="mb-1 block text-xs text-paper/50">Base URL（自定义 OpenAI 兼容端点）</span>
                        <input value={settings.ai.base_url} onChange={e => setSettings({ ...settings, ai: { ...settings.ai, base_url: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="https://your-endpoint/v1" />
                      </label>
                    )}
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="block min-w-52 flex-1">
                    <span className="mb-1 block text-xs text-paper/50">模型（可点击下方列表快速选择）</span>
                    <input value={settings.ai.llm_model} onChange={e => setSettings({ ...settings, ai: { ...settings.ai, llm_model: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="deepseek-v4-flash / qwen-plus / gemini-2.5-flash…" />
                  </label>
                  <button onClick={loadModels} disabled={modelsBusy} className="mt-5 shrink-0 rounded-lg border border-paper/20 px-3 py-2 text-xs text-paper/70 transition hover:bg-white/10 hover:text-paper disabled:opacity-40">
                    {modelsBusy ? '查询中…' : '📡 查询可用模型'}
                  </button>
                </div>
                {models && (
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl bg-ink/60 p-2.5 animate-fade-up">
                    {models.length === 0 && <p className="py-2 text-center text-xs text-paper/40">没有查到模型，请检查 API Key 与厂商端点后重试</p>}
                    {models.map(m => (
                      <button key={m.id} disabled={m.disabled} title={m.note || m.id} onClick={() => setSettings({ ...settings, ai: { ...settings.ai, llm_model: m.id } })}
                        className={"flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition disabled:cursor-not-allowed " + (m.disabled ? "bg-white/5 text-paper/30 line-through" : m.recommended ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-white/5 text-paper/80 hover:bg-white/15")}>
                        <span className="truncate">{m.id}</span>
                        <span className="shrink-0">
                          {m.recommended && <Badge color="green">推荐</Badge>}
                          {m.disabled && <Badge color="amber">禁用</Badge>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {settings.ai.llm_provider === 'deepseek' && <p className="text-xs text-amber-300/80">DeepSeek 当前仅允许 v4-flash 模型，pro 系列已自动禁用。</p>}

                <p className="text-xs text-paper/40">接入 14+ 厂商：OpenAI / Claude / Gemini / 豆包 / DeepSeek / Kimi / 通义 / 智谱 / Grok / Ollama 等，通过 uniLLM SDK 统一驱动。</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">语音服务（STT / TTS）</h2>
              <div className="space-y-3">
                <p className="text-xs text-paper/45">可选。留空时前端使用浏览器原生语音（Web Speech API），无需任何密钥。填入后可启用 OpenAI 兼容的 TTS / STT 代理端点。</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">TTS API Key</span>
                    <input value={settings.tts?.api_key || ''} onChange={e => setSettings({ ...settings, tts: { ...settings.tts, api_key: e.target.value } })} type="password" className={inputCls + ' bg-ink/80'} placeholder="sk-..." />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">TTS 音色</span>
                    <input value={settings.tts?.voice_uri || 'alloy'} onChange={e => setSettings({ ...settings, tts: { ...settings.tts, voice_uri: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="alloy / echo / 火山音色ID" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">TTS 端点（可选）</span>
                    <input value={settings.tts?.base_url || ''} onChange={e => setSettings({ ...settings, tts: { ...settings.tts, base_url: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="https://api.openai.com/v1" />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg bg-ink/40 px-3 py-2">
                    <input type="checkbox" checked={!!settings.tts?.no_save_audio} onChange={e => setSettings({ ...settings, tts: { ...settings.tts, no_save_audio: e.target.checked } })} className="accent-accent" />
                    <span className="text-xs text-paper/70">TTS 音频不落盘保存（隐私：播放后即丢弃）</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">STT API Key</span>
                    <input value={settings.stt?.api_key || ''} onChange={e => setSettings({ ...settings, stt: { ...settings.stt, api_key: e.target.value } })} type="password" className={inputCls + ' bg-ink/80'} placeholder="sk-..." />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">STT 端点（可选）</span>
                    <input value={settings.stt?.base_url || ''} onChange={e => setSettings({ ...settings, stt: { ...settings.stt, base_url: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="https://api.openai.com/v1" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">STT 模型</span>
                    <input value={settings.stt?.model || 'whisper-1'} onChange={e => setSettings({ ...settings, stt: { ...settings.stt, model: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="whisper-1" />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg bg-ink/40 px-3 py-2">
                    <input type="checkbox" checked={!!settings.stt?.no_save_audio} onChange={e => setSettings({ ...settings, stt: { ...settings.stt, no_save_audio: e.target.checked } })} className="accent-accent" />
                    <span className="text-xs text-paper/70">STT 音频不保存（转写后立即丢弃录音）</span>
                  </label>
                </div>
                <div className="rounded-xl bg-ink/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-paper/60">声音克隆（授权制）</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-paper/50">克隆服务 API Key</span>
                      <input value={settings.voice_clone?.api_key || ''} onChange={e => setSettings({ ...settings, voice_clone: { ...settings.voice_clone, api_key: e.target.value } })} type="password" className={inputCls + ' bg-ink/80'} placeholder="Fish Audio / 火山克隆 Key" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-paper/50">克隆服务端点</span>
                      <input value={settings.voice_clone?.base_url || ''} onChange={e => setSettings({ ...settings, voice_clone: { ...settings.voice_clone, base_url: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="https://api.fish.audio（Fish 克隆 /v1/voices）" />
                    </label>
                    <label className="block col-span-2">
                      <span className="mb-1 block text-xs text-paper/50">克隆模型</span>
                      <input value={settings.voice_clone?.model || 'fishaudio/fish-speech-1.5'} onChange={e => setSettings({ ...settings, voice_clone: { ...settings.voice_clone, model: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="fishaudio/fish-speech-1.5" />
                    </label>
                  </div>
                  <p className="mt-2 text-[10px] text-paper/40">配置后，用户在「助手声色」页可上传 10–60 秒授权音频样本一键生成专属音色。未配置时界面会提示先到后台配置。</p>
                </div>
                <p className="text-xs text-paper/40">配额：TTS 每小时上限与 STT 每日分钟上限在上方「配额与站点」中配置，超限返回 429。</p>
                <div className="rounded-xl bg-accentlight/15 p-3 text-[11px] leading-5 text-paper/60">
                  <b>📌 Fish Audio 使用说明</b><br />
                  · 访问 <span className="text-paper">/admin</span>（或站点域名加 /admin）进入后台，默认账号 admin / admin123，可在「AI 与系统设置」里修改。<br />
                  · 填入 TTS API Key（sk-fish-...）后，用户端「助手声色」页即可用「音频广场」搜索并收藏公开音色，收藏后成为 TTS 音色（reference_id）。<br />
                  · 最新模型：s2.1-pro-free（免费开发）/ s2.1-pro（生产），83 种语言，支持 [方括号] 自然语言情绪控制。
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">配额与站点</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">每日消息</span>
                    <input type="number" value={settings.quota.daily_messages} onChange={e => setSettings({ ...settings, quota: { ...settings.quota, daily_messages: Number(e.target.value) } })} className={inputCls + ' bg-ink/80'} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">消息/分钟</span>
                    <input type="number" value={settings.quota.messages_per_minute ?? 30} onChange={e => setSettings({ ...settings, quota: { ...settings.quota, messages_per_minute: Number(e.target.value) } })} className={inputCls + ' bg-ink/80'} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">TTS/小时</span>
                    <input type="number" value={settings.quota.tts_per_hour} onChange={e => setSettings({ ...settings, quota: { ...settings.quota, tts_per_hour: Number(e.target.value) } })} className={inputCls + ' bg-ink/80'} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-paper/50">STT 分钟/日</span>
                    <input type="number" value={settings.quota.stt_minutes_per_day} onChange={e => setSettings({ ...settings, quota: { ...settings.quota, stt_minutes_per_day: Number(e.target.value) } })} className={inputCls + ' bg-ink/80'} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">站点名称</span>
                  <input value={settings.site.site_name} onChange={e => setSettings({ ...settings, site: { ...settings.site, site_name: e.target.value } })} className={inputCls + ' bg-ink/80'} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">首页/登录页公告</span>
                  <textarea value={settings.site.announcement} onChange={e => setSettings({ ...settings, site: { ...settings.site, announcement: e.target.value } })} rows={2} className={inputCls + ' bg-ink/80 resize-y'} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-ink/40 px-3 py-2.5">
                  <span className="text-sm text-paper/80">开放注册</span>
                  <input type="checkbox" checked={settings.site.allow_registration !== false} onChange={e => setSettings({ ...settings, site: { ...settings.site, allow_registration: e.target.checked } })} className="h-4 w-4 accent-accent" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">关闭注册时的提示语</span>
                  <input value={settings.site.registration_message || ''} onChange={e => setSettings({ ...settings, site: { ...settings.site, registration_message: e.target.value } })} className={inputCls + ' bg-ink/80'} placeholder="例如：内测中，请联系管理员开通账号" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">默认创作人设（新用户/新作品默认）</span>
                  <select value={settings.site.default_persona_id || ''} onChange={e => setSettings({ ...settings, site: { ...settings.site, default_persona_id: e.target.value } })} className={inputCls + ' bg-ink/80'}>
                    <option value="">系统默认（黎文）</option>
                    {personaOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-paper/50">默认音色（朗读/TTS 优先）</span>
                  <select value={settings.site.default_voice_id || ''} onChange={e => setSettings({ ...settings, site: { ...settings.site, default_voice_id: e.target.value } })} className={inputCls + ' bg-ink/80'}>
                    <option value="">系统默认</option>
                    {voiceOptions.map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:col-span-2"><Button onClick={saveSettings} className="bg-paper text-ink hover:bg-paper/90">保存全部设置</Button><Button variant="danger" onClick={resetData} className="bg-red-500/20 text-red-300 hover:bg-red-500/30">⚠️ 重置全部数据</Button></div>
          </div>
        )}

        {tab === 'presets' && presets && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold">预设人设（{presets.personas.length}）</h2>
                <Button variant="subtle" onClick={() => openPersonaForm()} className="bg-white/10 text-paper hover:bg-white/20">＋ 添加</Button>
              </div>
              <div className="space-y-2">
                {presets.personas.map((p: any) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-2.5">
                    <div><div className="font-medium">{p.name}</div><div className="text-xs text-paper/40">{p.tagline}</div></div>
                    <div className="flex items-center gap-1.5"><Badge color="accent">预设</Badge><button onClick={() => editPreset('persona', p)} title="编辑" className="text-xs text-paper/50 hover:text-paper">✎</button><button onClick={() => delPreset('persona', p)} title="删除" className="text-xs text-red-300/70 hover:text-red-300">✕</button></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold">预设音色（{presets.voices.length}）</h2>
                <Button variant="subtle" onClick={() => addPreset('voice')} className="bg-white/10 text-paper hover:bg-white/20">＋ 添加</Button>
              </div>
              <div className="space-y-2">
                {presets.voices.map((v: any) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-2.5">
                    <div><div className="font-medium">{v.display_name}</div><div className="text-xs text-paper/40">{v.provider}</div></div>
                    <div className="flex items-center gap-1.5"><Badge color="accent">预设</Badge><button onClick={() => editPreset('voice', v)} title="编辑" className="text-xs text-paper/50 hover:text-paper">✎</button><button onClick={() => delPreset('voice', v)} title="删除" className="text-xs text-red-300/70 hover:text-red-300">✕</button></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'feedback' && (
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold">用户反馈（{feedback.length}）</h2>
              <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
                {[['', '全部'], ['open', '待处理'], ['done', '已处理'], ['ignored', '已忽略']].map(([k, v]) => (
                  <button key={k} onClick={() => { setFeedbackFilter(k); setTimeout(loadFeedback, 0); }}
                    className={'rounded-md px-3 py-1.5 transition ' + (feedbackFilter === k ? 'bg-paper text-ink font-medium' : 'text-paper/60 hover:text-paper')}>{v}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {feedback.map(f => (
                <div key={f.id} className="rounded-xl bg-white/5 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-paper/50">
                      {f.user_name || '匿名用户'}{f.user_email ? ' · ' + f.user_email : ''} · {new Date(f.created_at).toLocaleString('zh-CN')}
                      {f.contact ? ' · 📮 ' + f.contact : ''}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {f.status === 'open' && <Badge color="amber">待处理</Badge>}
                      {f.status === 'done' && <Badge color="green">已处理</Badge>}
                      {f.status === 'ignored' && <Badge>已忽略</Badge>}
                    </div>
                  </div>
                  {f.page && <p className="mt-1 text-[10px] text-paper/35">页面：{f.page}</p>}
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-paper/85">{f.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {f.status !== 'done' && <button onClick={() => setFeedbackStatus(f, 'done')} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/25">✓ 标记已处理</button>}
                    {f.status !== 'ignored' && <button onClick={() => setFeedbackStatus(f, 'ignored')} className="rounded-full bg-white/10 px-3 py-1 text-xs text-paper/60 transition hover:bg-white/20">忽略</button>}
                    {f.status === 'done' && <button onClick={() => setFeedbackStatus(f, 'open')} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300 transition hover:bg-amber-500/25">重新打开</button>}
                    <button onClick={async () => { if (!confirm('删除这条反馈？')) return; try { await adminSend('/feedback/' + f.id, 'DELETE'); setErr(''); flash('反馈已删除'); loadFeedback(); } catch (e: any) { setErr(e.message); } }}
                      className="rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/25">删除</button>
                  </div>
                </div>
              ))}
              {feedback.length === 0 && <p className="py-8 text-center text-paper/40">暂无反馈</p>}
            </div>
          </div>
        )}

        {tab === 'letter-feedback' && (
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold">信笺反馈（{letterFeedback.length}）</h2>
              <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
                {[['', '全部'], ['new', '待处理'], ['done', '已处理']].map(([k, v]) => (
                  <button key={k} onClick={() => { setLetterFbFilter(k); setTimeout(loadLetterFeedback, 0); }}
                    className={'rounded-md px-3 py-1.5 transition ' + (letterFbFilter === k ? 'bg-paper text-ink font-medium' : 'text-paper/60 hover:text-paper')}>{v}</button>
                ))}
              </div>
            </div>
            {letterFbErr && <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{letterFbErr}</p>}
            <div className="space-y-2">
              {letterFeedback.map(f => (
                <div key={f.id} className="rounded-xl bg-white/5 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-paper/50">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{f.type}</span>
                      {' '}· {new Date(f.created_at).toLocaleString('zh-CN')}
                      {f.contact ? ' · 📮 ' + f.contact : ''}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {f.status === 'new' && <Badge color="amber">待处理</Badge>}
                      {f.status === 'done' && <Badge color="green">已处理</Badge>}
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-paper/85">{f.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {f.status !== 'done' && <button onClick={() => setLetterFbStatus(f, 'done')} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/25">✓ 标记已处理</button>}
                    {f.status === 'done' && <button onClick={() => setLetterFbStatus(f, 'new')} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300 transition hover:bg-amber-500/25">重新打开</button>}
                  </div>
                </div>
              ))}
              {letterFeedback.length === 0 && !letterFbErr && <p className="py-8 text-center text-paper/40">暂无信笺反馈</p>}
            </div>
          </div>
        )}

        {tab === 'admins' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">修改我的密码</h2>
              <div className="space-y-3">
                <input value={passwordForm.old_password} onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })} type="password" placeholder="当前密码" className={inputCls + ' bg-ink/80'} />
                <input value={passwordForm.new_password} onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })} type="password" placeholder="新密码（至少 8 位）" className={inputCls + ' bg-ink/80'} />
                <input value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })} type="password" placeholder="再次输入新密码" className={inputCls + ' bg-ink/80'} />
                {pwMsg && <p className="text-xs text-amber-300">{pwMsg}</p>}
                <Button onClick={changePassword} className="bg-paper text-ink hover:bg-paper/90">更新密码</Button>
                <p className="text-[11px] leading-4 text-paper/40">默认密码 admin123 已公开泄露，建议立即修改为强密码。</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">添加管理员</h2>
              <div className="space-y-3">
                <input value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} placeholder="用户名" className={inputCls + ' bg-ink/80'} />
                <input value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} type="password" placeholder="密码" className={inputCls + ' bg-ink/80'} />
                <select value={newAdmin.role} onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value })} className={inputCls + ' bg-ink/80'}>
                  <option value="admin">admin（全部权限）</option>
                  <option value="operator">operator（运营）</option>
                </select>
                <Button onClick={addAdmin} className="bg-paper text-ink hover:bg-paper/90">添加管理员</Button>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">管理员列表（{admins.length}）</h2>
              <div className="space-y-2">
                {admins.map(a => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-2.5">
                    <div>
                      <div className="font-medium">{a.username}</div>
                      <div className="text-xs text-paper/40">{a.role || 'admin'}</div>
                    </div>
                    <Button variant="danger" onClick={() => delAdmin(a)} className="bg-red-500/20 text-red-300 hover:bg-red-500/30">删除</Button>
                  </div>
                ))}  
                {admins.length === 0 && <p className="py-6 text-center text-paper/40">暂无管理员</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 预设人设完整表单（表格） */}
      <Modal open={personaModalOpen} onClose={() => { stopPreview(); setPersonaModalOpen(false); }} title={personaEditId ? '编辑预设人设' : '添加预设人设'} wide>
        <div className="space-y-4 text-ink">
          {/* AI 自动生成 */}
          <div className="rounded-xl bg-accentlight/50 p-3">
            <p className="mb-1.5 text-xs font-bold text-ink">✨ AI 自动生成</p>
            <div className="flex gap-2">
              <input value={aiDesc} onChange={e => setAiDesc(e.target.value)} placeholder="描述角色，如：陆沉，光与夜之恋，万甄集团CEO血族，温柔神秘；会联网检索资料并搜索音色" className={inputCls} />
              <Button onClick={aiGenerate} disabled={aiBusy} className="shrink-0 bg-ink text-paper hover:bg-ink/90">{aiBusy ? '生成中…' : '生成'}</Button>
            </div>
            {aiMsg && <p className="mt-1.5 text-xs font-medium text-emerald-700">{aiMsg}</p>}
          </div>

          {/* 表格：基础信息 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="角色名 *" value={personaForm.name} onChange={v => setPersonaForm({ ...personaForm, name: v })} placeholder="如：陆沉" />
            <Input label="一句话标签" value={personaForm.tagline} onChange={v => setPersonaForm({ ...personaForm, tagline: v })} placeholder="如：万甄集团 CEO · 血族" />
          </div>
          <Input label="背景故事（含出处）" textarea rows={3} value={personaForm.background} onChange={v => setPersonaForm({ ...personaForm, background: v })} placeholder="2-4 句，介绍角色出处与经历" />
          <Input label="性格标签（逗号分隔）" value={personaForm.personality} onChange={v => setPersonaForm({ ...personaForm, personality: v })} placeholder="温柔、神秘、睿智、克制" />

          {/* 表格：说话风格 */}
          <div className="rounded-xl bg-ink/5 p-3">
            <p className="mb-2 text-xs font-bold text-ink">说话风格</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="语气总述" value={personaForm.tone} onChange={v => setPersonaForm({ ...personaForm, tone: v })} placeholder="温润低沉、慢条斯理" />
              <Input label="说话偏好（逗号分隔）" value={personaForm.preferences} onChange={v => setPersonaForm({ ...personaForm, preferences: v })} placeholder="用隐喻和故事说话、安静倾听" />
              <Input label="要避免的（逗号分隔）" value={personaForm.avoid} onChange={v => setPersonaForm({ ...personaForm, avoid: v })} placeholder="急躁、命令式、空泛安慰" />
            </div>
          </div>

          {/* 表格：深层设定 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="价值观（逗号分隔）" value={personaForm.values} onChange={v => setPersonaForm({ ...personaForm, values: v })} placeholder="真实比华丽重要" />
            <Input label="与写信人的关系" value={personaForm.relationship} onChange={v => setPersonaForm({ ...personaForm, relationship: v })} placeholder="如：守护者、青梅竹马" />
            <Input label="专长（逗号分隔）" value={personaForm.expertise} onChange={v => setPersonaForm({ ...personaForm, expertise: v })} placeholder="剑术、治国、厨艺" />
            <Input label="初次见面问候语" value={personaForm.greeting} onChange={v => setPersonaForm({ ...personaForm, greeting: v })} placeholder="如：在下钟离，往生堂客卿" />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink">头像底色</span>
              <div className="flex items-center gap-2">
                <input type="color" value={personaForm.avatar_color} onChange={e => setPersonaForm({ ...personaForm, avatar_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-ink/30 bg-transparent" />
                <input value={personaForm.avatar_color} onChange={e => setPersonaForm({ ...personaForm, avatar_color: e.target.value })} className={inputCls} />
              </div>
            </label>
          </div>

          {/* 音色绑定 */}
          <div className="rounded-xl bg-ink/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-ink">绑定音色（自动搜索广场）</p>
              {voiceSel && <Badge color="accent">✓ {voiceSel.title}</Badge>}
            </div>
            <div className="flex gap-2">
              <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="搜音色：如 陆沉 男声 中文" className={inputCls} onKeyDown={e => { if (e.key === 'Enter') searchVoices(); }} />
              <Button onClick={() => searchVoices()} disabled={voiceSearchBusy} className="shrink-0 bg-ink text-paper hover:bg-ink/90">{voiceSearchBusy ? '搜索中…' : '搜索'}</Button>
            </div>
            {voiceCandidates.length > 0 && (
              <div className="mt-2 grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {voiceCandidates.map((v: any) => (
                  <button key={v.id} onClick={() => setVoiceSel({ id: v.id, title: v.title })} className={'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition ' + (voiceSel?.id === v.id ? 'bg-accent/30 font-semibold text-ink' : 'bg-white text-ink/80 ring-1 ring-ink/15 hover:ring-accent/60')}>
                    <span className="min-w-0 truncate">{v.title}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {v.sample_audio && <span className="rounded bg-ink/10 px-1.5 py-0.5 font-medium" onClick={e => { e.stopPropagation(); playSample(v); }}>▶ 试听</span>}
                      <span className="text-[10px] text-ink/60">{(v.languages || []).slice(0, 2).join('/')}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {voiceCandidates.length === 0 && !voiceSearchBusy && <p className="mt-1.5 text-xs text-ink/60">输入关键词搜索 Fish 音色广场；未绑定音色则保存后不可朗读</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { stopPreview(); setPersonaModalOpen(false); }}>取消</Button>
            <Button onClick={savePersonaForm} className="bg-ink text-paper hover:bg-ink/90">保存预设</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
