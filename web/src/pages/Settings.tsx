import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { Button, Input, Modal } from '../components/ui';
import { completeTourStep, resetTour } from '../lib/tour';

type UserPrefs = { assistant_name: string; my_name: string; tts_rate: number; tts_pitch: number; auto_send: boolean; read_aloud: boolean };
type ReportData = {
  totals: { projects: number; chapters: number; words: number; conversations: number; messages: number; draftDays: number; memories: number; firstDate: string | null; lastDate: string | null };
  genres: { genre: string; label: string; count: number }[];
  topics: { word: string; count: number }[];
  tools: { tool: string; label: string; count: number }[];
  replies: { type: string; label: string; count: number }[];
  prefs: string[];
};

export default function Settings() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.display_name || '');
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [saved, setSaved] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportErr, setReportErr] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    try {
      const d = await api.get<{ settings: UserPrefs }>('/auth/me/settings');
      setPrefs(d.settings);
    } catch { setPrefs({ assistant_name: '缪斯', my_name: '', tts_rate: 1, tts_pitch: 1, auto_send: false, read_aloud: true }); }
    try {
      const m = await api.get<{ list: any[] }>('/memories');
      setMemories(m.list);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const loadReport = async () => {
    setReportBusy(true); setReportErr('');
    try {
      const d = await api.get<ReportData>('/insights/report');
      setReport(d);
    } catch (e: any) { setReportErr(e.message || '报告生成失败'); }
    finally { setReportBusy(false); }
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('删除这条创作记忆？')) return;
    await api.del(`/memories/${id}`);
    setMemories(prev => prev.filter(x => x.id !== id));
  };

  const deleteAccount = async () => {
    if (delConfirm !== (user?.email || '')) return;
    setDelBusy(true);
    try {
      await api.del('/auth/me');
      localStorage.removeItem('am_token');
      localStorage.removeItem('am_user');
      nav('/login');
    } finally { setDelBusy(false); }
  };

  const saveUser = async () => {
    await api.patch('/auth/me', { display_name: name });
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const savePrefs = async () => {
    if (!prefs) return;
    await api.patch('/auth/me/settings', prefs);
    completeTourStep('settings');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-8 font-serif text-3xl font-semibold">设置</h1>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-4 font-serif text-lg font-semibold">新手引导</h2>
          <p className="mb-3 text-sm text-ink/50">重新走一遍「称呼 → 人设 → 音色 → 新建作品」的完整引导，帮你快速上手创作。</p>
          <Button variant="subtle" onClick={() => resetTour()}>重新开始引导</Button>
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-4 font-serif text-lg font-semibold">个人资料</h2>
          <div className="space-y-3">
            <Input label="昵称" value={name} onChange={setName} />
            <Input label="邮箱" value={user?.email || ''} onChange={() => {}} />
            <Button onClick={saveUser}>保存资料</Button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft" data-tour="tour-names">
          <h2 className="mb-4 font-serif text-lg font-semibold">彼此称呼</h2>
          <p className="mb-3 text-sm text-ink/50">给这段创作关系一个专属称呼：你对缪斯的称呼，以及它该怎样称呼你。</p>
          <Input label="对缪斯的称呼" value={prefs?.assistant_name || '缪斯'} onChange={v => setPrefs(p => p ? { ...p, assistant_name: v } : p)} placeholder="缪斯" />
          <div className="mt-3">
            <Input label="缪斯如何称呼你（可选）" value={prefs?.my_name || ''} onChange={v => setPrefs(p => p ? { ...p, my_name: v } : p)} placeholder="例如：小舟、阿澈…" />
            <p className="mt-1 text-xs text-ink/40">填写后，AI 回复会自动带上这个称呼，让对话更亲近。</p>
          </div>
          <div className="mt-3"><Button onClick={savePrefs}>保存称呼</Button></div>
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-4 font-serif text-lg font-semibold">语音偏好</h2>
          {prefs ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-xs font-medium text-ink/60">朗读语速 {prefs.tts_rate}</span>
                  <input type="range" min={0.6} max={1.5} step={0.05} value={prefs.tts_rate}
                    onChange={e => setPrefs({ ...prefs, tts_rate: Number(e.target.value) })} className="w-full accent-accent" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-xs font-medium text-ink/60">朗读音调 {prefs.tts_pitch}</span>
                  <input type="range" min={0.5} max={1.5} step={0.05} value={prefs.tts_pitch}
                    onChange={e => setPrefs({ ...prefs, tts_pitch: Number(e.target.value) })} className="w-full accent-accent" />
                </label>
              </div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-ink/70">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={prefs.read_aloud} onChange={e => setPrefs({ ...prefs, read_aloud: e.target.checked })} className="accent-accent" />
                  助手回复后自动朗读
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={prefs.auto_send} onChange={e => setPrefs({ ...prefs, auto_send: e.target.checked })} className="accent-accent" />
                  语音转写完成后自动发送（不开时先确认；转写中仍可随时打字，互不阻塞）
                </label>
              </div>
              <div className="mt-4"><Button onClick={savePrefs}>保存语音偏好</Button></div>
            </>
          ) : <p className="text-sm text-ink/50">加载中…</p>}
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-3 font-serif text-lg font-semibold">创作记忆（{memories.length}）</h2>
          <p className="mb-3 text-sm text-ink/50">对话中助手自动记住的创作偏好与设定，会注入到后续回复中。</p>
          {memories.length === 0 ? (
            <p className="text-sm text-ink/35">还没有记忆，多聊几次创作后会自动生成。</p>
          ) : (
            <div className="space-y-2">
              {memories.map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-ink/5 bg-paper/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm text-ink/70">{m.content}</div>
                    <div className="mt-0.5 text-xs text-ink/35">{m.scope === 'project' ? '作品' : '用户'} · 重要度 {m.importance || 3}</div>
                  </div>
                  <button onClick={() => deleteMemory(m.id)} className="ml-2 shrink-0 text-xs text-ink/30 hover:text-red-500">删除</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold">创作足迹</h2>
              <p className="mt-1 text-sm text-ink/50">回头看看走过的路：字数、体裁、笔下的主题与缪斯陪伴你的方式。</p>
            </div>
            <Button variant="ghost" onClick={loadReport} disabled={reportBusy}>{reportBusy ? '生成中…' : (report ? '刷新' : '生成报告')}</Button>
          </div>
          {reportErr && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{reportErr}</p>}
          {!report && !reportErr && <p className="text-sm text-ink/40">尚未生成。点击「生成报告」查看你的创作轨迹。</p>}
          {report && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ['作品', report.totals.projects],
                  ['章节', report.totals.chapters],
                  ['总字数', report.totals.words],
                  ['对话', report.totals.conversations],
                  ['创作天数', report.totals.draftDays],
                  ['记忆', report.totals.memories],
                ].map(([label, v]) => (
                  <div key={label as string} className="rounded-xl border border-ink/5 bg-paper/50 p-3 text-center">
                    <div className="font-serif text-2xl font-semibold text-ink">{v}</div>
                    <div className="mt-0.5 text-xs text-ink/45">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink/40">
                {report.totals.firstDate ? `首次动笔 ${report.totals.firstDate.slice(0, 10)}` : '尚未开始写作'}
                {report.totals.lastDate ? ` · 最近更新 ${report.totals.lastDate.slice(0, 10)}` : ''}
              </p>

              {report.genres.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink/70">体裁分布</h3>
                  <div className="space-y-2">
                    {report.genres.map(g => (
                      <div key={g.genre} className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-xs text-ink/55">{g.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                          <div className="h-full rounded-full bg-accent" style={{ width: Math.max(4, Math.round((g.count / Math.max(1, report.genres[0].count)) * 100)) + '%' }} />
                        </div>
                        <span className="w-6 text-right text-xs text-ink/45">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.topics.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink/70">笔下的主题</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {report.topics.map(t => (
                      <span key={t.word} className="rounded-full bg-accentlight/70 px-2.5 py-1 text-xs text-ink/75" title={`出现 ${t.count} 次`}>{t.word}</span>
                    ))}
                  </div>
                </div>
              )}

              {(report.tools.length > 0 || report.replies.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {report.tools.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-ink/70">用过的写作工具</h3>
                      <div className="space-y-1.5">
                        {report.tools.map(t => (
                          <div key={t.tool} className="flex items-center justify-between rounded-lg bg-paper/50 px-3 py-1.5 text-sm">
                            <span className="text-ink/70">{t.label}</span>
                            <span className="text-xs text-ink/45">{t.count} 次</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.replies.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-ink/70">缪斯的陪伴方式</h3>
                      <div className="space-y-1.5">
                        {report.replies.map(r => (
                          <div key={r.type} className="flex items-center justify-between rounded-lg bg-paper/50 px-3 py-1.5 text-sm">
                            <span className="text-ink/70">{r.label}</span>
                            <span className="text-xs text-ink/45">{r.count} 条</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {report.prefs.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink/70">缪斯记住的偏好</h3>
                  <div className="space-y-1">
                    {report.prefs.map((p, i) => (
                      <p key={i} className="text-sm leading-6 text-ink/60">· {p}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-3 font-serif text-lg font-semibold">关于 AI 模型</h2>
          <p className="text-sm leading-6 text-ink/50">
            AI 模型与系统级配置由管理后台统一管理（<span className="text-accent">/admin</span>）。未配置外部模型时，Aicho Muse 使用内置创作缪斯，同样提供提问、反馈、建议与鼓励。
          </p>
        </section>

        <section className="rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <h2 className="mb-3 font-serif text-lg font-semibold">隐私与数据</h2>
          <div className="space-y-2 text-sm leading-6 text-ink/50">
            <p>🔒 你的创作内容属于你自己。Aicho Muse 将作品、章节、对话保存在你自己的部署环境中（本机或你配置的 MySQL 数据库），不会上传到任何第三方。</p>
            <p>🤖 AI 对话会发送给你在管理后台配置的大模型提供商用于生成回复；未配置时不发送任何外部请求。</p>
            <p>🗑 删除的作品进入 30 秒回收站后自动清除；你也可以随时在「设置 → 创作记忆」删除助手记住的偏好。</p>
            <p>🎙 语音输入使用浏览器本地语音识别；外部 STT/TTS 仅在管理后台配置密钥后才会调用。</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/40 p-6">
          <h2 className="mb-2 font-serif text-lg font-semibold text-red-700">注销账号</h2>
          <p className="mb-3 text-sm leading-6 text-ink/55">注销将永久删除你的账号、作品、章节、对话、人设与记忆，且不可恢复。所有创作内容属于你，删除是对数据清除权的尊重。</p>
          <button onClick={() => setDelOpen(true)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700">注销我的账号</button>
        </section>

        <Modal open={delOpen} onClose={() => { setDelOpen(false); setDelConfirm(''); }} title="确认注销">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/60">此操作不可撤销。请输入你的邮箱 <b className="text-ink">{user?.email}</b> 以确认。</p>
            <Input label="输入邮箱确认" value={delConfirm} onChange={setDelConfirm} placeholder={user?.email || ''} />
            <div className="flex gap-2">
              <Button onClick={deleteAccount} disabled={delBusy || delConfirm !== (user?.email || '')} className="flex-1 bg-red-600 text-white hover:bg-red-700">{delBusy ? '删除中…' : '永久删除'}</Button>
              <Button variant="ghost" onClick={() => { setDelOpen(false); setDelConfirm(''); }}>取消</Button>
            </div>
          </div>
        </Modal>

        {saved && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已保存 ✓</p>}
      </div>
    </Layout>
  );
}
