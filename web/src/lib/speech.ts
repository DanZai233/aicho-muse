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
export type QuietRecognition = SpeechRecognitionLike & { autoStop?: boolean; quietMs?: number };

// 静音自动结束录音：2 秒没有新语音结果即自动 stop（对应 UX 文档 4.2）
export function startQuietRecording(onText: (t: string) => void, onEnd: (final: string) => void, opts: { quietMs?: number } = {}): QuietRecognition | null {
  const rec = getSpeechRecognition();
  if (!rec) return null;
  const quietMs = opts.quietMs || 2000;
  let final = '';
  let lastResult = Date.now();
  let timer: any = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { rec.stop(); } catch { /* 已结束 */ }
    }, quietMs);
  };
  rec.onresult = (e: any) => {
    lastResult = Date.now();
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    onText((final + interim).trim());
    arm();
  };
  rec.onend = () => {
    clearTimeout(timer);
    onEnd(final.trim());
  };
  rec.onerror = () => {
    clearTimeout(timer);
    onEnd(final.trim());
  };
  try { rec.start(); arm(); } catch { /* 已启动 */ }
  return rec;
}

export function interruptSpeech() { stopSpeak(); }


// ---------- Fish Audio TTS 朗读（优先），失败回退浏览器 ----------
// 调后端 /tts/synthesize（Fish Audio s2.1-pro-free + 音频广场音色），
// 未配置 Key / 失败时自动回退浏览器原生 speechSynthesis。
let ttsAudio: HTMLAudioElement | null = null;

export async function speakWithTTS(
  text: string,
  opts: { rate?: number; pitch?: number; onEnd?: () => void; onStart?: () => void; voiceId?: string } = {},
): Promise<boolean> {
  try {
    const token = localStorage.getItem('token');
    const resp = await fetch('/api/v1/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ text, stream: false, voice_id: opts.voiceId || null }),
    });
    const json = await resp.json().catch(() => null);
    if (json?.code === 0 && json.data?.audio_url) {
      stopSpeak();
      ttsAudio = new Audio(json.data.audio_url);
      ttsAudio.onplay = () => opts.onStart?.();
      ttsAudio.onended = () => { ttsAudio = null; opts.onEnd?.(); };
      ttsAudio.onerror = () => { ttsAudio = null; opts.onEnd?.(); };
      ttsAudio.play().catch(() => { opts.onEnd?.(); });
      return true;
    }
  } catch { /* 回退浏览器 */ }
  return speak(text, { rate: opts.rate, pitch: opts.pitch, onEnd: opts.onEnd, onStart: opts.onStart });
}

export function stopSpeakTTS() {
  if (ttsAudio) { try { ttsAudio.pause(); ttsAudio = null; } catch { /* ignore */ } }
  stopSpeak();
}
