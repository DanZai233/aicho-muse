import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

function fishConfig() {
  const s = db().settings.tts || {};
  return {
    api_key: process.env.TTS_API_KEY || s.api_key || '',
    base_url: String(process.env.TTS_BASE_URL || s.base_url || 'https://api.fish.audio').replace(/\/+$/, ''),
    model: process.env.TTS_MODEL || s.model || 's2.1-pro-free',
  };
}

function visibleVoices(req) {
  return db().voices.filter(v => v.is_preset || v.user_id === req.user.id || v.is_public);
}

router.get('/', (req, res) => {
  let list = visibleVoices(req);
  if (req.query.scope === 'preset') list = list.filter(v => v.is_preset);
  if (req.query.scope === 'mine') list = list.filter(v => !v.is_preset);
  if (req.query.scope === 'public') list = list.filter(v => v.is_public);
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/', (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.display_name || !b.display_name.trim()) return res.status(400).json({ code: 40001, message: '音色名称必填' });
  const now = new Date().toISOString();
  const v = {
    id: uuid(),
    user_id: req.user.id,
    display_name: b.display_name.trim(),
    provider: b.provider || 'system',
    voice_id: b.voice_id || '',
    params: b.params || { rate: 1, pitch: 0, emotion: 'calm', energy: 0.6 },
    speech_notes: b.speech_notes || '',
    is_preset: false,
    is_public: !!b.is_public,
    created_at: now,
    updated_at: now,
  };
  d.voices.push(v);
  saveDb();
  res.json({ code: 0, data: { voice: v } });
});

router.patch('/:id', (req, res) => {
  const d = db();
  const v = d.voices.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!v) return res.status(404).json({ code: 40401, message: '音色不存在或为预设' });
  for (const k of ['display_name', 'provider', 'voice_id', 'params', 'speech_notes', 'is_public']) {
    if (req.body[k] !== undefined) v[k] = req.body[k];
  }
  v.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { voice: v } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const v = d.voices.find(x => x.id === req.params.id && !x.is_preset && x.user_id === req.user.id);
  if (!v) return res.status(404).json({ code: 40401, message: '音色不存在或为预设' });
  d.voices = d.voices.filter(x => x.id !== v.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

// 克隆他人分享的音色到自己的空间
router.post('/:id/clone', (req, res) => {
  const d = db();
  const src = d.voices.find(x => x.id === req.params.id);
  if (!src || (!src.is_preset && src.user_id !== req.user.id && !src.is_public)) return res.status(404).json({ code: 40401, message: '音色不存在' });
  if (src.user_id === req.user.id && !src.is_preset) return res.status(400).json({ code: 40001, message: '这是你的音色，无需克隆' });
  const now = new Date().toISOString();
  const vc = { ...JSON.parse(JSON.stringify(src)), id: uuid(), user_id: req.user.id, is_preset: false, is_public: false, display_name: src.display_name + '（我的版本）', created_at: now, updated_at: now };
  d.voices.push(vc);
  saveDb();
  res.json({ code: 0, data: { voice: vc } });
});

// 声音克隆（授权制）：上传 10-60 秒授权音频样本，调用外部克隆服务生成音色
// 合规：仅在用户明确勾选授权后受理；样本只用于本次克隆，不入库
router.post('/clone/from-audio', async (req, res) => {
  const { display_name, audio_base64, mime, consent } = req.body || {};
  if (!display_name || !display_name.trim()) return res.status(400).json({ code: 40001, message: '音色名称必填' });
  if (!audio_base64 || String(audio_base64).length < 5000) return res.status(400).json({ code: 40001, message: '请上传 10–60 秒的清晰音频样本（录音文件偏小，请重录）' });
  if (consent !== true) return res.status(400).json({ code: 40001, message: '需要你明确授权：同意将这段样本用于生成专属音色（仅用于本次克隆）' });
  const cfg = db().settings.voice_clone || {};
  const apiKey = process.env.VOICE_CLONE_API_KEY || cfg.api_key || '';
  const baseUrl = String(process.env.VOICE_CLONE_BASE_URL || cfg.base_url || '').replace(/\/+$/, '');
  if (!apiKey || !baseUrl) {
    return res.status(501).json({ code: 50101, message: '尚未配置声音克隆服务（管理后台 → 系统设置 → 语音服务 → 克隆配置），配置后可在这里一键生成你的专属音色' });
  }
  try {
    const buf = Buffer.from(audio_base64, 'base64');
    const fd = new FormData();
    fd.append('name', display_name.trim());
    fd.append('file', new Blob([buf], { type: mime || 'audio/wav' }), 'sample.' + (mime?.includes('mp3') ? 'mp3' : 'wav'));
    const r = await fetch(baseUrl + '/voices', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: fd, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('克隆服务 ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
    const data = await r.json();
    const voiceId = data.voice_id || data.id || '';
    const now = new Date().toISOString();
    const vc = { id: uuid(), user_id: req.user.id, display_name: display_name.trim() + '（克隆）', provider: 'fish-audio', voice_id: voiceId, params: { rate: 1, pitch: 0, emotion: 'calm', energy: 0.6 }, speech_notes: '用户授权克隆音色', is_preset: false, is_public: false, created_at: now, updated_at: now };
    db().voices.push(vc);
    saveDb();
    res.json({ code: 0, data: { voice: vc } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '克隆失败：' + e.message });
  }
});


// ---------- Fish Audio 音频广场 ----------
// 搜索公开音色库（self_only=false），返回可试听/收藏的音色列表
router.get('/library/search', async (req, res) => {
  const cfg = fishConfig();
  if (!cfg.api_key) return res.status(501).json({ code: 50101, message: '尚未配置 Fish Audio API Key（管理后台 → 语音服务）' });
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(30, Math.max(1, Number(req.query.page_size) || 10));
  try {
    const url = cfg.base_url + '/model?self_only=false&page_size=' + pageSize + '&page=' + page + (q ? '&title=' + encodeURIComponent(q) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + cfg.api_key }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('Fish 搜索 ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
    const data = await r.json();
    const items = (data.items || []).filter(i => i.state === 'trained').map(i => ({
      id: i._id,
      title: i.title,
      description: i.description,
      cover_image: i.cover_image,
      tags: i.tags || [],
      languages: i.languages || [],
      sample_audio: i.samples?.[0]?.audio || null,
      default_text: i.default_text || null,
      visibility: i.visibility,
    }));
    res.json({ code: 0, data: { total: data.total || 0, list: items, page, page_size: pageSize } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '音频广场搜索失败：' + e.message });
  }
});

// 收藏广场音色 → 生成 fish-audio voice profile（voice_id = reference_id）
router.post('/library/:id/add', async (req, res) => {
  const cfg = fishConfig();
  if (!cfg.api_key) return res.status(501).json({ code: 50101, message: '尚未配置 Fish Audio API Key（管理后台 → 语音服务）' });
  const { title, description, sample_audio } = req.body || {};
  if (!req.params.id) return res.status(400).json({ code: 40001, message: '音色 ID 必填' });
  try {
    // 从广场拉一次详情/确认存在（也可直接用传入字段）
    let meta = { title: title || 'Fish 音色', description: description || '', sample_audio: sample_audio || null };
    try {
      const r = await fetch(cfg.base_url + '/model/' + req.params.id, { headers: { Authorization: 'Bearer ' + cfg.api_key }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        meta = { title: d.title || meta.title, description: d.description || meta.description, sample_audio: d.samples?.[0]?.audio || meta.sample_audio };
      }
    } catch { /* 用传入字段 */ }
    const now = new Date().toISOString();
    const v = {
      id: uuid(),
      user_id: req.user.id,
      display_name: meta.title + '（Fish）',
      provider: 'fish-audio',
      voice_id: req.params.id,
      params: { rate: 1, pitch: 0, emotion: 'calm', energy: 0.6 },
      speech_notes: meta.description || '',
      is_preset: false,
      is_public: false,
      created_at: now,
      updated_at: now,
    };
    db().voices.push(v);
    saveDb();
    res.json({ code: 0, data: { voice: v } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '收藏失败：' + e.message });
  }
});

export default router;

