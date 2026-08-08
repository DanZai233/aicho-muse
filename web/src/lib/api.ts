const BASE = '/api/v1';

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken() {
  return localStorage.getItem('am_token') || '';
}

async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.auth !== false) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const resp = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let json: any = null;
  try { json = await resp.json(); } catch { /* empty */ }
  if (!resp.ok || (json && json.code !== 0)) {
    throw new ApiError(resp.status, json?.code || -1, json?.message || `请求失败 (${resp.status})`);
  }
  return json.data as T;
}

export const api = {
  get: <T>(p: string, auth = true) => request<T>(p, { auth }),
  post: <T>(p: string, body?: unknown, auth = true) => request<T>(p, { method: 'POST', body, auth }),
  patch: <T>(p: string, body?: unknown, auth = true) => request<T>(p, { method: 'PATCH', body, auth }),
  del: <T>(p: string, auth = true) => request<T>(p, { method: 'DELETE', auth }),
};

export type Persona = {
  id: string; name: string; tagline: string; background: string;
  personality: string[]; speaking_style: { tone: string; preferences: string[]; avoid: string[]; catchphrase?: string };
  values: string[]; relationship: string; expertise: string[];
  greeting: string; avatar?: string; avatar_color: string; is_preset: boolean; is_public?: boolean; version: number;
  voice_profile_id?: string | null;
};

export type VoiceProfile = {
  id: string; display_name: string; provider: string; voice_id: string;
  params: { rate: number; pitch: number; emotion: string; energy: number };
  speech_notes: string; is_preset: boolean; is_public?: boolean;
  source?: string;
};

export const LANGUAGES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];
export const LANGUAGE_LABEL: Record<string, string> = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };

export type Project = {
  id: string; title: string; genre: string; language?: string; theme: string; target_audience: string;
  goal_word_count: number; status: string; default_persona_id: string | null; team_persona_ids?: string[];
  cover_color: string; subtitle?: string; author_name?: string;
  chapter_count?: number; word_count?: number;
  my_role?: 'owner' | 'editor' | 'viewer' | null;
  default_persona?: { id: string; name: string; avatar_color: string } | null;
};

export type Chapter = {
  id: string; project_id: string; title: string; content: string;
  order_index: number; status: string; word_count: number;
};

export type Conversation = {
  id: string; title: string; project_id: string | null; persona_id: string | null; voice_profile_id: string | null;
  persona?: { id: string; name: string; tagline: string; avatar?: string; avatar_color: string } | null;
  voice?: { id: string; display_name: string; provider?: string; voice_id?: string | null; params?: { rate: number; pitch: number; emotion: string; energy: number } } | null;
  project?: { id: string; title: string; genre: string } | null;
  last_message?: string | null; updated_at?: string;
};

export type Message = {
  id: string; conversation_id: string; role: 'user' | 'assistant' | 'tool';
  content: string; reply_type?: string; source?: string; adopted_at?: string; created_at: string;
};
