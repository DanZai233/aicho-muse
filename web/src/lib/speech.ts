// 浏览器原生语音：STT（语音输入）+ TTS（语音朗读），无需密钥
export type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void; stop: () => void;
};

export function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'zh-CN';
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}

export function speak(text: string, opts: { rate?: number; pitch?: number; onEnd?: () => void; onStart?: () => void } = {}) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.find(v => v.lang.startsWith('zh'));
  if (zh) u.voice = zh;
  u.onend = () => opts.onEnd?.();
  u.onstart = () => opts.onStart?.();
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeak() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
