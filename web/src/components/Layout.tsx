import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from './ui';
import MuseAssistant from './assistant/MuseAssistant';
import FeedbackModal from './FeedbackModal';
import OnboardingTour from './OnboardingTour';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('am_theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(() => (window.matchMedia('(display-mode: standalone)').matches));
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('am_install_dismissed') === '1');
  const [fbOpen, setFbOpen] = useState(false);

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
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-paper">M</div>
            <span className="hidden font-serif text-lg font-semibold tracking-wide min-[420px]:inline">Aicho Muse</span>
          </Link>
          {/* 桌面端横向导航 */}
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <Link to="/workspace" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">工作台</Link>
            <Link to="/personas" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">人设</Link>
            <Link to="/voices" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">声色</Link>
            <Link to="/settings" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">设置</Link>
            <Link to="/shares" className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink">拾卷</Link>
            <button onClick={() => setFbOpen(true)} className="rounded-lg px-3 py-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink" title="反馈建议">反馈</button>
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
          {/* 移动端：主题 + 菜单 */}
          <div className="flex items-center gap-1 md:hidden">
            <button onClick={() => setDark(d => !d)} title={dark ? '切换浅色模式' : '切换深色模式'}
              className="rounded-lg px-2.5 py-1.5 text-lg text-ink/60 transition hover:bg-ink/5 hover:text-ink">
              {dark ? '☀️' : '🌙'}
            </button>
            {user && <Avatar name={user.display_name} size="sm" />}
            <button onClick={() => setMenuOpen(v => !v)} title="菜单"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-ink/70 transition hover:bg-ink/5 hover:text-ink">
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
        {/* 移动端下拉菜单 */}
        {menuOpen && (
          <nav className="border-t border-ink/5 bg-paper/95 px-4 py-3 shadow-lift backdrop-blur md:hidden animate-fade-up">
            <div className="grid grid-cols-2 gap-1.5">
              <Link to="/workspace" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">📖 工作台</Link>
              <Link to="/personas" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">🧑‍🎨 人设</Link>
              <Link to="/voices" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">🎙 声色</Link>
              <Link to="/settings" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">⚙ 设置</Link>
              <Link to="/shares" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">📚 拾卷</Link>
              <button onClick={() => { setFbOpen(true); setMenuOpen(false); }} className="rounded-lg px-3 py-2.5 text-left text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">💌 反馈建议</button>
              {user && (
                <button onClick={() => { logout(); nav('/login'); setMenuOpen(false); }}
                  className="rounded-lg px-3 py-2.5 text-left text-sm text-ink/50 hover:bg-ink/5 hover:text-ink">↩ 退出登录</button>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      {user && <MuseAssistant />}
      {user && <OnboardingTour />}
      {user && (
        <>
          {/* 移动端悬浮反馈按钮放左下角，避免挡住聊天发送按钮；桌面端用顶栏「反馈」入口 */}
          <button onClick={() => setFbOpen(true)} title="反馈建议"
            className="fixed bottom-5 left-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-xl text-paper shadow-lift transition hover:scale-105 hover:bg-accent/90 md:hidden">
            💌
          </button>
          <FeedbackModal open={fbOpen} onClose={() => setFbOpen(false)} />
        </>
      )}
    </div>
  );
}
