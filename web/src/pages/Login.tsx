import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Input } from '../components/ui';
import { api } from '../lib/api';

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [siteInfo, setSiteInfo] = useState<{ site_name: string; announcement: string; allow_registration: boolean; registration_message: string } | null>(null);

  useEffect(() => {
    api.get<{ site: { site_name: string; announcement: string; allow_registration: boolean; registration_message: string } }>('/auth/site', false).then(d => setSiteInfo(d.site)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || email.split('@')[0]);
      nav(next.startsWith('/') ? next : '/');
    } catch (ex: any) {
      setErr(ex.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent font-serif text-2xl font-bold text-paper shadow-lift">M</div>
          <h1 className="font-serif text-2xl font-semibold">Aicho Muse</h1>
          <p className="mt-1 text-sm text-ink/50">用对话和声音，把灵感写成作品</p>
        </div>
        <div className="rounded-2xl border border-ink/5 bg-surface p-6 shadow-soft">
          <div className="mb-5 flex rounded-lg bg-ink/5 p-1 text-sm">
            {(siteInfo && siteInfo.allow_registration === false ? ['login'] as const : ['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink/50'}`}>
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && <Input label="昵称（可选）" value={name} onChange={setName} placeholder="怎么称呼你？" />}
            <Input label="邮箱" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            <Input label="密码" value={password} onChange={setPassword} placeholder={mode === 'register' ? '至少 6 位' : '你的密码'} type="password" />
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
            <Button type="submit" disabled={busy || !email || !password} className="w-full">{busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}</Button>
          </form>
        </div>
        {siteInfo?.announcement && (
          <div className="mt-5 rounded-xl border border-accent/20 bg-accentlight/30 px-4 py-3 text-center text-xs leading-5 text-ink/60">{siteInfo.announcement}</div>
        )}
        <p className="mt-5 text-center text-xs text-ink/40">语音与文字平等 · 人设声色自定义 · 缪斯陪跑</p>
      </div>
    </div>
  );
}
