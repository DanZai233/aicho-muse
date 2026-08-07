import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { Button, Input } from '../components/ui';

type UserPrefs = { tts_rate: number; tts_pitch: number; auto_send: boolean; read_aloud: boolean };

export default function Settings() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.display_name || '');
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const d = await api.get<{ settings: UserPrefs }>('/auth/me/settings');
      setPrefs(d.settings);
    } catch { setPrefs({ tts_rate: 1, tts_pitch: 1, auto_send: false, read_aloud: true }); }
  };
  useEffect(() => { load(); }, []);

  const saveUser = async () => {
    await api.patch('/auth/me', { display_name: name });
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const savePrefs = async () => {
    if (!prefs) return;
    await api.patch('/auth/me/settings', prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-8 font-serif text-3xl font-semibold">设置</h1>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
          <h2 className="mb-4 font-serif text-lg font-semibold">个人资料</h2>
          <div className="space-y-3">
            <Input label="昵称" value={name} onChange={setName} />
            <Input label="邮箱" value={user?.email || ''} onChange={() => {}} />
            <Button onClick={saveUser}>保存资料</Button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
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
                  语音转写完成后自动发送
                </label>
              </div>
              <div className="mt-4"><Button onClick={savePrefs}>保存语音偏好</Button></div>
            </>
          ) : <p className="text-sm text-ink/50">加载中…</p>}
        </section>

        <section className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
          <h2 className="mb-3 font-serif text-lg font-semibold">关于 AI 模型</h2>
          <p className="text-sm leading-6 text-ink/50">
            AI 模型与系统级配置由管理后台统一管理（<span className="text-accent">/admin</span>）。未配置外部模型时，Aicho Muse 使用内置创作教练，同样提供提问、反馈、建议与鼓励。
          </p>
        </section>

        {saved && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已保存 ✓</p>}
      </div>
    </Layout>
  );
}
