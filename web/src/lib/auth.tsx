import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { api } from './api';

type User = { id: string; email: string; display_name: string };

type AuthCtx = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('am_token'));

  const refresh = async () => {
    try {
      const d = await api.get<{ user: User }>('/auth/me');
      setUser(d.user);
    } catch {
      setUser(null);
      localStorage.removeItem('am_token');
      setToken(null);
    }
  };

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = async (email: string, password: string) => {
    const d = await api.post<{ token: string; user: User }>('/auth/login', { email, password }, false);
    localStorage.setItem('am_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };

  const register = async (email: string, password: string, display_name?: string) => {
    const d = await api.post<{ token: string; user: User }>('/auth/register', { email, password, display_name }, false);
    localStorage.setItem('am_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };

  const logout = () => {
    localStorage.removeItem('am_token');
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
