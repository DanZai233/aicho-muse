import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';

const router = Router();
router.use(authRequired);

function visibleVoices(req) {
  return db().voices.filter(v => v.is_preset || v.user_id === req.user.id);
}

router.get('/', (req, res) => {
  let list = visibleVoices(req);
  if (req.query.scope === 'preset') list = list.filter(v => v.is_preset);
  if (req.query.scope === 'mine') list = list.filter(v => !v.is_preset);
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
  for (const k of ['display_name', 'provider', 'voice_id', 'params', 'speech_notes']) {
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

export default router;
