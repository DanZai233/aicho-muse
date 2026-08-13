// 缪斯信笺：公开接口（匿名 + IP 限流），供独立信笺应用调用
// 提供：人设/音色列表（官方预设+公开）、音色广场搜索、AI 回信生成、分段 TTS
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, uuid } from '../db.js';
import { callLLM, personaPrompt } from '../ai.js';
import { AUDIO_DIR, ttsConfig, ttsCacheKey, signUrl } from './speech.js';

const router = Router();

// ---------- 匿名 IP 限流（内存） ----------
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++;
  buckets.set(key, b);
  return { allowed: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function ttsCfg() {
  return ttsConfig();
}

// ---------- 人设列表（官方预设 + 公开人设，附绑定音色） ----------
router.get('/personas', (req, res) => {
  const d = db();
  const list = d.personas
    .filter(p => p.is_preset || p.is_public)
    .map(p => {
      const vp = p.voice_profile_id ? d.voices.find(v => v.id === p.voice_profile_id) : null;
      return {
        id: p.id,
        name: p.name,
        tagline: p.tagline || '',
        background: (p.background || '').slice(0, 200),
        personality: p.personality || [],
        speaking_style: p.speaking_style || {},
        avatar: p.avatar || '',
        avatar_color: p.avatar_color || '#8b7d6b',
        voice_profile_id: p.voice_profile_id || null,
        voice_id: vp?.voice_id || null,
        voice_name: vp?.display_name || '',
      };
    });
  // 爱莉希雅优先排最前（默认对象）
  list.sort((a, b) => (a.id === 'preset-elysia' ? -1 : b.id === 'preset-elysia' ? 1 : 0));
  res.json({ code: 0, data: { list, total: list.length } });
});

// ---------- 音色列表（官方预设 + 公开音色） ----------
router.get('/voices', (req, res) => {
  const d = db();
  const list = d.voices
    .filter(v => v.is_preset || v.is_public)
    .map(v => ({
      id: v.id,
      display_name: v.display_name,
      voice_id: v.voice_id || '',
      provider: v.provider || 'system',
      source: v.source || '',
      params: v.params || {},
      is_preset: !!v.is_preset,
    }))
    .filter(v => v.voice_id); // 只返回有真实 voice_id 的（可直接 TTS）
  res.json({ code: 0, data: { list, total: list.length } });
});

// ---------- Fish 音频广场搜索（匿名，低配额） ----------
router.get('/library/search', async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit('letter_lib_' + ip, 20, 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ code: 42901, message: '请求太快，请稍后再试' });
  const cfg = ttsCfg();
  if (!cfg.api_key) return res.status(501).json({ code: 50101, message: 'TTS 尚未配置' });
  const q = String(req.query.q || '').trim();
  const pageSize = Math.min(20, Math.max(1, Number(req.query.page_size) || 10));
  try {
    const url = cfg.base_url + '/model?self_only=false&page_size=' + pageSize + '&page=1' + (q ? '&title=' + encodeURIComponent(q) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + cfg.api_key }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('Fish ' + r.status);
    const d = await r.json();
    const list = (d.items || []).filter(i => i.state === 'trained').map(i => ({
      id: i._id,
      title: i.title,
      description: i.description || '',
      cover_image: i.cover_image || '',
      tags: i.tags || [],
      sample_audio: i.samples?.[0]?.audio || null,
    }));
    res.json({ code: 0, data: { list, total: list.length } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '音色广场搜索失败：' + e.message });
  }
});

// ---------- AI 回信生成 ----------
// 按人设（性格/声音/名字）给「笔名」写一封回信，分段落（每段 60-120 字）
router.post('/reply', async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit('letter_reply_' + ip, 10, 30 * 60 * 1000);
  if (!rl.allowed) return res.status(429).set('Retry-After', String(rl.retryAfter)).json({ code: 42901, message: '回信太频繁了，请稍后再寄（每 30 分钟最多 5 封）' });
  const { persona_id, persona_name, persona_tagline, persona_personality, voice_id, voice_name, pen_name, letter_content } = req.body || {};
  const letter = String(letter_content || '').trim();
  if (!persona_id && !persona_name) return res.status(400).json({ code: 40001, message: '请选择写信对象' });
  if (!letter) return res.status(400).json({ code: 40001, message: '信的内容不能为空' });
  if (letter.length > 3000) return res.status(400).json({ code: 40001, message: '信太长了（最多 3000 字）' });
  const d = db();
  let persona, vp, personaInfo;
  if (persona_id) {
    persona = d.personas.find(p => p.id === persona_id && (p.is_preset || p.is_public));
    if (!persona) return res.status(404).json({ code: 40401, message: '写信对象不存在' });
    vp = persona.voice_profile_id ? d.voices.find(v => v.id === persona.voice_profile_id) : null;
    personaInfo = {
      id: persona.id, name: persona.name, tagline: persona.tagline || '',
      avatar_color: persona.avatar_color || '#8b7d6b',
      voice_id: vp?.voice_id || null, voice_name: vp?.display_name || '',
    };
  } else {
    // 自定义写信对象：名字 + 音色 + 性格（音色广场选择）
    const customName = String(persona_name || '').trim().slice(0, 20);
    if (!customName) return res.status(400).json({ code: 40001, message: '请填写对象名字' });
    persona = {
      id: 'custom:' + customName,
      name: customName,
      tagline: String(persona_tagline || '').trim().slice(0, 60) || '一位特别的朋友',
      background: '',
      personality: Array.isArray(persona_personality) && persona_personality.length
        ? persona_personality.map(String).slice(0, 6)
        : ['温柔', '真诚', '有想象力'],
      speaking_style: { tone: '温柔而有温度', preferences: ['像朋友一样回应', '善于倾听', '给出真诚的建议'], avoid: ['冷漠', '说教'] },
      values: ['真诚比华丽重要', '创作是自我发现的过程'],
      relationship: '特别的朋友',
      expertise: ['创作灵感', '情感陪伴', '故事讲述'],
      greeting: '嗨，我收到你的信啦。',
      is_preset: false,
      is_public: false,
    };
    personaInfo = {
      id: 'custom:' + customName,
      name: customName,
      tagline: persona.tagline,
      avatar_color: '#8b7d6b',
      voice_id: String(voice_id || '').trim() || null,
      voice_name: String(voice_name || '').trim() || '',
    };
  }
  const displayName = String(pen_name || '').trim() || '远方的朋友';

  const s = d.settings.ai;
  const hasLLM = ((process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none') || (s.api_key && s.provider !== 'none');
  if (!hasLLM) return res.status(503).json({ code: 50301, message: '回信服务暂不可用' });

  const sys = `${personaPrompt(persona)}
【回信任务】你是「${persona.name}」，收到了一封来自「${displayName}」的信。请以你自己的性格、说话风格与身份，写一封真诚、有温度的回信。要求：
1. 开头自然地称呼对方（可用「${displayName}」或更亲昵/符合人设的称呼），结尾以你的人设落款；
2. 回应信中提到的具体内容，不要空泛；
3. 语气完全贴合你的人设，像写在纸上的信，不要用 emoji、不要 markdown、不要【】标题；
4. 全文分 3-5 个自然段，每段 60-120 字；
5. 严格输出 JSON（不要其他文字）：{"paragraphs":["段落1","段落2",...],"signature":"落款"}。`;
  const user = `来信内容：\n${letter}`;

  try {
    const raw = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.8, max_tokens: 1600, noFallback: true });
    // 容错解析 JSON
    let paragraphs = [];
    let signature = persona.name;
    const block = String(raw || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (block ? block[1] : String(raw || '')).match(/\{[\s\S]*\}/)?.[0] || String(raw || '');
    try {
      const obj = JSON.parse(candidate);
      if (Array.isArray(obj.paragraphs)) paragraphs = obj.paragraphs.map(x => String(x).trim()).filter(Boolean);
      if (obj.signature) signature = String(obj.signature).trim();
    } catch {
      // 非 JSON：按空行切分
      paragraphs = String(raw || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    }
    if (!paragraphs.length) paragraphs = [String(raw || '').trim()];
    // 二次切分：每段不超过 140 字（按句号/逗号切），段落总数 ≤ 8
    const cut = [];
    for (let p of paragraphs) {
      if (p.length <= 140) { cut.push(p); continue; }
      const parts = p.split(/(?<=[。！？!?])/).filter(x => x.trim());
      let cur = '';
      for (const part of parts) {
        if ((cur + part).length > 140 && cur) { cut.push(cur.trim()); cur = part; }
        else cur += part;
      }
      if (cur.trim()) cut.push(cur.trim());
    }
    paragraphs = cut.slice(0, 8);
    res.json({ code: 0, data: { persona: personaInfo, signature, paragraphs } });
  } catch (e) {
    console.error('[Letter] 回信生成失败:', e.message);
    res.status(502).json({ code: 50201, message: '回信生成失败：' + e.message });
  }
});


// ---------- 信件润色（预设风格） ----------
const POLISH_STYLES = {
  gentle: { label: '温柔治愈', hint: '更温暖柔软，多一分抚慰与陪伴感，像被轻轻拥抱' },
  poetic: { label: '诗意浪漫', hint: '更有画面感与诗意，善用比喻、意象和留白' },
  concise: { label: '简洁有力', hint: '删繁就简，句子干净利落，直击人心' },
  playful: { label: '俏皮灵动', hint: '活泼俏皮，带一点可爱的小幽默和元气' },
  formal: { label: '深情郑重', hint: '庄重深情，适合郑重其事地表达心意' },
};

router.post('/polish', async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit('letter_polish_' + ip, 10, 30 * 60 * 1000);
  if (!rl.allowed) return res.status(429).set('Retry-After', String(rl.retryAfter)).json({ code: 42901, message: '润色太频繁了，请稍后再试' });
  const { text, style } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return res.status(400).json({ code: 40001, message: 'text 必填' });
  if (t.length > 3000) return res.status(400).json({ code: 40001, message: '内容太长了（最多 3000 字）' });
  const st = POLISH_STYLES[String(style || 'gentle')] || POLISH_STYLES.gentle;
  const s = db().settings.ai;
  const hasLLM = ((process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none') || (s.api_key && s.provider !== 'none');
  if (!hasLLM) return res.status(503).json({ code: 50301, message: '润色服务暂不可用' });
  const sys = `你是一位文字编辑。请把用户写给朋友的信润色成「${st.label}」的风格：${st.hint}。
要求：
1. 保留原意、重要细节与整体结构（段落、称呼、落款）；
2. 不要添加原信没有的新内容，不要改变事实；
3. 不要使用 markdown、emoji、【】标题；
4. 控制在接近原文的长度，不要过度扩写；
5. 直接输出润色后的完整信件正文。`;
  try {
    const raw = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: t }], { temperature: 0.7, max_tokens: 1600, noFallback: true });
    const out = String(raw || '').trim();
    if (!out) throw new Error('润色结果为空');
    res.json({ code: 0, data: { style: st.label, text: out } });
  } catch (e) {
    console.error('[Letter] 润色失败:', e.message);
    res.status(502).json({ code: 50201, message: '润色失败：' + e.message });
  }
});

// ---------- 分段 TTS（匿名，短文本，IP 限流） ----------
router.post('/tts', async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit('letter_tts_' + ip, 30, 60 * 60 * 1000);
  if (!rl.allowed) return res.status(429).set('Retry-After', String(rl.retryAfter)).json({ code: 42901, message: '语音生成太频繁，请稍后再试' });
  const { text, voice_id, force } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return res.status(400).json({ code: 40001, message: 'text 必填' });
  if (t.length > 400) return res.status(400).json({ code: 40001, message: '单段文本过长（最多 400 字）' });
  const cfg = ttsCfg();
  if (!cfg.api_key) return res.status(501).json({ code: 50101, message: 'TTS 尚未配置' });
  const refId = String(voice_id || '') || cfg.voice || '';
  if (!refId) return res.status(502).json({ code: 50201, message: '需要音色：请选择一个音色' });
  try {
    const cacheKey = ttsCacheKey(t, refId, cfg.rate || 1, cfg.provider, cfg.model);
    const cacheFile = cacheKey + '.mp3';
    const audioPath = path.join(AUDIO_DIR, cacheFile);
    if (!fs.existsSync(audioPath) || !!force) {
      const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.api_key, model: cfg.model };
      const body = {
        text: t.slice(0, 400),
        reference_id: refId,
        format: 'mp3',
        prosody: { speed: Math.min(2, Math.max(0.5, cfg.rate || 1)), volume: 0, normalize_loudness: true },
        normalize: true,
        chunk_length: 200,
        sample_rate: 44100,
        mp3_bitrate: 128,
        latency: 'normal',
      };
      const r = await fetch(cfg.base_url + '/v1/tts', {
        method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new Error('Fish TTS ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 120));
      fs.writeFileSync(audioPath, Buffer.from(await r.arrayBuffer()));
    }
    const url = signUrl(cacheFile);
    // 注意：signUrl 返回 /api/v1/audio/...，供同域前端播放；信笺后端可下载转存
    res.json({ code: 0, data: { audio_url: url, cached: fs.existsSync(audioPath), duration: Math.max(1, Math.round(t.length / 4)) } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '语音生成失败：' + e.message });
  }
});

export default router;
