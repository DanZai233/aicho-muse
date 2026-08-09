import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authRequired } from '../auth.js';
import { db, uuid } from '../db.js';
import { checkQuota, consumeQuota } from '../quota.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = process.env.AUDIO_DIR || path.join(__dirname, '..', '..', 'data', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const router = Router();

// TTS 音频缓存：同文本 + 同音色 + 同参数复用已合成文件，避免每次播放都调 API
function ttsCacheKey(text, voiceId, rate, provider, model) {
  return crypto.createHash('sha256').update([String(text || ''), String(voiceId || ''), String(rate || 1), String(provider || ''), String(model || '')].join('|')).digest('hex').slice(0, 32);
}

// ---------- 音频访问（短期签名 URL） ----------
router.get('/audio/:file', (req, res) => {
  const { file } = req.params;
  const exp = Number(req.query.exp) || 0;
  const sig = String(req.query.sig || '');
  if (!/^[0-9a-f-]+\.mp3$/.test(file)) return res.status(400).json({ code: 40001, message: '非法文件名' });
  const expect = crypto.createHmac('sha256', process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me').update(file + ':' + exp).digest('hex');
  if (!sig || sig !== expect || exp < Date.now()) return res.status(403).json({ code: 40301, message: '链接无效或已过期' });
  const p = path.join(AUDIO_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).json({ code: 40401, message: '音频不存在' });
  res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'private, max-age=900').sendFile(p);
});

function ttsConfig() {
  const s = db().settings.tts || {};
  const provider = String(process.env.TTS_PROVIDER || s.provider || '').toLowerCase();
  return {
    provider,
    api_key: process.env.TTS_API_KEY || s.api_key || '',
    base_url: String(process.env.TTS_BASE_URL || s.base_url || (provider === 'fish-audio' ? 'https://api.fish.audio' : 'https://api.openai.com/v1')).replace(/\/+$/, ''),
    voice: process.env.TTS_VOICE || s.voice_uri || '',
    model: process.env.TTS_MODEL || s.model || (provider === 'fish-audio' ? 's2.1-pro-free' : 'tts-1'),
    rate: s.rate || 1,
  };
}
function sttConfig() {
  const s = db().settings.stt || {};
  return {
    api_key: process.env.STT_API_KEY || s.api_key || '',
    base_url: String(process.env.STT_BASE_URL || s.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.STT_MODEL || s.model || 'whisper-1',
  };
}

function signUrl(file) {
  const exp = Date.now() + 15 * 60 * 1000;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'aicho-muse-dev-secret-change-me').update(file + ':' + exp).digest('hex');
  return '/api/v1/audio/' + file + '?exp=' + exp + '&sig=' + sig;
}

// ---------- TTS 合成 ----------
router.post('/tts/synthesize', authRequired, async (req, res) => {
  const { text, stream, voice_id } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ code: 40001, message: 'text 必填' });
  const q = checkQuota('tts', req.user.id);
  if (!q.allowed) return res.status(429).set('Retry-After', String(3600 - new Date().getMinutes() * 60 - new Date().getSeconds())).json({ code: 42901, message: 'TTS 配额已用尽（' + q.limit + ' 次/小时）' });
  const cfg = ttsConfig();
  if (!cfg.api_key) return res.json({ code: 0, data: { audio_url: null, fallback: 'browser', message: '未配置 TTS 提供商，请使用浏览器朗读' } });
  try {
    // 命中缓存：直接返回已合成的音频文件（不调 API、不扣配额）
    const cacheKey = ttsCacheKey(text, String(voice_id || ''), cfg.rate || 1, cfg.provider, cfg.model);
    const cacheFile = cacheKey + '.mp3';
    if (fs.existsSync(path.join(AUDIO_DIR, cacheFile))) {
      return res.json({ code: 0, data: { audio_url: signUrl(cacheFile), duration: Math.max(1, Math.round(String(text).length / 4)), stream: !!stream, cached: true } });
    }
    let buf;
    if (cfg.provider === 'fish-audio') {
      // 音色来源：前端显式传 voice_id（会话音色→人设音色→站点默认）→ 后台配置的 TTS 音色。
      // 不再自动抓取广场随机音色，避免朗读声与人设不一致。
      let refId = String(voice_id || '') || cfg.voice || '';
      if (!refId) return res.status(502).json({ code: 50201, message: 'Fish TTS 需要音色：请选择一个人设绑定音色，或在后台配置 TTS 音色 ID' });
      // Fish Audio：model 放 header，reference_id 为音色（音频广场收藏的 voice_id 或预设音色）
      const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.api_key, model: cfg.model };
      const body = {
        text: String(text).slice(0, 4000),
        reference_id: refId,
        format: 'mp3',
        prosody: { speed: Math.min(2, Math.max(0.5, cfg.rate || 1)), volume: 0, normalize_loudness: true },
        normalize: true,
        chunk_length: 300,
        sample_rate: 44100,
        mp3_bitrate: 128,
        latency: 'normal',
      };
      const r = await fetch(cfg.base_url + '/v1/tts', {
        method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new Error('Fish TTS ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      const body = { model: cfg.model, input: String(text).slice(0, 4000), voice: cfg.voice, response_format: 'mp3', speed: Math.min(2, Math.max(0.5, cfg.rate || 1)) };
      const r = await fetch(cfg.base_url + '/audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.api_key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error('TTS ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
      buf = Buffer.from(await r.arrayBuffer());
    }
    const cfg2 = ttsConfig();
    if (cfg2.no_save_audio) {
      // 不落盘：直接回传 base64 流式播放（隐私：不保存音频）
      consumeQuota('tts', req.user.id, 1);
      return res.json({ code: 0, data: { audio_base64: buf.toString('base64'), duration: Math.max(1, Math.round(String(text).length / 4)), stream: !!stream, no_save: true } });
    }
    const file = cacheKey + '.mp3';
    fs.writeFileSync(path.join(AUDIO_DIR, file), buf);
    consumeQuota('tts', req.user.id, 1);
    res.json({ code: 0, data: { audio_url: signUrl(file), duration: Math.max(1, Math.round(String(text).length / 4)), stream: !!stream } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: 'TTS 合成失败：' + e.message });
  }
});

// ---------- STT 转写 ----------
router.post('/stt/transcribe', authRequired, async (req, res) => {
  const { audio_base64, mime, duration } = req.body || {};
  if (!audio_base64) return res.status(400).json({ code: 40001, message: 'audio_base64 必填' });
  const dur = Math.max(0.1, Number(duration) || 0.1);
  const q = checkQuota('stt', req.user.id);
  if (!q.allowed) return res.status(429).set('Retry-After', String(86400)).json({ code: 42901, message: 'STT 分钟配额已用尽' });
  const cfg = sttConfig();
  if (!cfg.api_key) return res.status(501).json({ code: 50101, message: '未配置 STT 提供商，请使用浏览器原生语音输入' });
  try {
    const audioBuf = Buffer.from(audio_base64, 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([audioBuf], { type: mime || 'audio/webm' }), 'speech.' + (mime?.includes('mp3') ? 'mp3' : 'webm'));
    fd.append('model', cfg.model);
    fd.append('language', 'zh');
    const r = await fetch(cfg.base_url + '/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + cfg.api_key }, body: fd, signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error('STT ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
    const data = await r.json();
    consumeQuota('stt', req.user.id, dur);
    res.json({ code: 0, data: { text: data.text || '', duration: dur } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: 'STT 转写失败：' + e.message });
  }
});


export default router;
