import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Badge } from '../components/ui';

type Stats = { users: number; projects: number; chapters: number; conversations: number; messages: number; messages_today: number; conversations_today: number; ai_provider: string; ai_model?: string; memories?: number; reply_types?: Record<string, number> };
type AdminUser = { id: string; email: string; display_name: string; created_at: string };

const inputCls = 'w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

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
  const [tab, setTab] = useState<'stats' | 'users' | 'settings' | 'presets'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [presets, setPresets] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<{ id: string; recommended?: boolean; disabled?: boolean; note?: string }[] | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const isAuthed = !!localStorage.getItem('am_admin_token');
  useEffect(() => { if (!isAuthed) nav('/admin/login'); }, []);
  if (!isAuthed) return null;

  const loadStats = async () => { setStats(await adminGet<Stats>('/stats')); };
  const loadUsers = async () => { setUsers((await adminGet<{ list: AdminUser[] }>('/users')).list); };
  const loadSettings = async () => { const s = (await adminGet<{ settings: any }>('/settings')).settings; setSettings({ ...s, ai: { ...s.ai, api_key: s.ai.api_key ? '******' : '' } }); };
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

  useEffect(() => {
    loadStats(); loadUsers(); loadSettings(); loadPresets(); loadProviders();
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
      const body = { ...settings, ai: { ...settings.ai, api_key: settings.ai.api_key === '******' ? '' : settings.ai.api_key, llm_api_key: settings.ai.llm_api_key === '******' ? '' : settings.ai.llm_api_key } };
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
        <header className="mb-8 flex items-center justify-between">
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

        <nav className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1 text-sm">
          {([['stats', '数据概览'], ['users', '用户管理'], ['settings', '系统设置'], ['presets', '预设管理']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 transition ${tab === k ? 'bg-paper text-ink font-medium' : 'text-paper/60 hover:text-paper'}`}>{v}</button>
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
          </>
        )}

        {tab === 'users' && (
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">用户列表（{users.length}）</h2>
            </div>
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <div>
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-sm text-paper/40">{u.email} · {new Date(u.created_at).toLocaleDateString()}</div>
                  </div>
                  <Button variant="danger" onClick={() => delUser(u)} className="bg-red-500/20 text-red-300 hover:bg-red-500/30">删除</Button>
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
                <div className="flex items-center gap-2">
                  <label className="block flex-1">
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
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
                <div className="grid grid-cols-3 gap-2">
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
                  <span className="mb-1 block text-xs text-paper/50">公告</span>
                  <textarea value={settings.site.announcement} onChange={e => setSettings({ ...settings, site: { ...settings.site, announcement: e.target.value } })} rows={2} className={inputCls + ' bg-ink/80 resize-y'} />
                </label>
              </div>
            </div>
            <div className="lg:col-span-2"><Button onClick={saveSettings} className="bg-paper text-ink hover:bg-paper/90">保存全部设置</Button></div>
          </div>
        )}

        {tab === 'presets' && presets && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold">预设人设（{presets.personas.length}）</h2>
                <Button variant="subtle" onClick={() => addPreset('persona')} className="bg-white/10 text-paper hover:bg-white/20">＋ 添加</Button>
              </div>
              <div className="space-y-2">
                {presets.personas.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5">
                    <div><div className="font-medium">{p.name}</div><div className="text-xs text-paper/40">{p.tagline}</div></div>
                    <Badge color="accent">预设</Badge>
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
                  <div key={v.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5">
                    <div><div className="font-medium">{v.display_name}</div><div className="text-xs text-paper/40">{v.provider}</div></div>
                    <Badge color="accent">预设</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
