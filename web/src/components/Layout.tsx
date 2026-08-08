import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from './ui';
import MuseAssistant from './assistant/MuseAssistant';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('am_theme') === 'dark');
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(() => (window.matchMedia('(display-mode: standalone)').matches));
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('am_install_dismissed') === '1');

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); localStorage.setItem('am_installed', '1'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const doInstall = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; setInstalled(true); setInstallEvt(null); localStorage.setItem('am_installed', '1'); } catch { /* 用户取消 */ }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('am_theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="flex min-h-screen flex-col">
      {installEvt && !installed && !dismissed && (
        <div className="flex items-center gap-3 border-b border-ink/5 bg-accentlight/40 px-4 py-2 text-sm animate-fade-up">
          <span className="text-base">📖</span>
          <span className="min-w-0 flex-1 truncate text-ink/75">把 Aicho Muse 装到桌面/主屏幕，像一本随时打开的书。</span>
          <button onClick={doInstall} className="shrink-0 rounded-lg bg-ink px-3 py-1 text-xs font-medium text-paper transition hover:bg-ink/90">安装</button>
          <button onClick={() => { setDismissed(true); localStorage.setItem('am_install_dismissed', '1'); }} className="shrink-0 text-xs text-ink/40 hover:text-ink">稍后</button>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-paper">M</div>
            <span className="font-serif text-lg font-semibold tracking-wide">Aicho Muse</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/workspace" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">工作台</Link>
            <Link to="/personas" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">人设</Link>
            <Link to="/voices" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">声色</Link>
            <Link to="/settings" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">设置</Link>
            <button onClick={() => setDark(d => !d)} title={dark ? '切换浅色模式' : '切换深色模式'}
              className="ml-1 rounded-lg px-2.5 py-1.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink">
              {dark ? '☀️' : '🌙'}
            </button>
            {user && (
              <div className="ml-2 flex items-center gap-2">
                <Avatar name={user.display_name} size="sm" />
                <button onClick={() => { logout(); nav('/login'); }} className="rounded-lg px-3 py-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">退出</button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {user && <MuseAssistant />}
    </div>
  );
}
