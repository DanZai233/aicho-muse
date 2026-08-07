import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Avatar } from './ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
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
    </div>
  );
}
