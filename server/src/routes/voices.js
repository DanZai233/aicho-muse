import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

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

export default router;
