import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../components/ui';

export default function AdminLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const resp = await fetch('/api/v1/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const json = await resp.json();
      if (!resp.ok || json.code !== 0) throw new Error(json.message || '登录失败');
      localStorage.setItem('am_admin_token', json.data.token);
      localStorage.setItem('am_admin_name', json.data.admin.username);
      nav('/admin');
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="admin-root flex min-h-screen items-center justify-center bg-ink/95 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink font-serif text-xl font-bold text-paper">A</div>
          <h1 className="font-serif text-xl font-semibold">Aicho Muse 管理后台</h1>
          <p className="mt-1 text-sm text-ink/50">系统配置 · 用户管理 · 数据概览</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="管理员账号" value={username} onChange={setUsername} placeholder="admin" />
          <Input label="密码" value={password} onChange={setPassword} type="password" placeholder="••••••" />
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
          <Button type="submit" disabled={busy || !username || !password} className="w-full">进入后台</Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink/35">默认账号 admin / admin123（请尽快修改）</p>
      </div>
    </div>
  );
}
