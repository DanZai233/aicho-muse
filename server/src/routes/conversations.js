import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { generateCoachReply, extractMemory } from '../ai.js';
import { checkQuota, consumeQuota } from '../quota.js';

const router = Router();
router.use(authRequired);

function ownProject(req, id) {
  return db().projects.find(p => p.id === id && p.user_id === req.user.id);
}

function withJoins(c) {
  const d = db();
  const persona = c.persona_id ? d.personas.find(p => p.id === c.persona_id) : null;
  const voice = c.voice_profile_id ? d.voices.find(v => v.id === c.voice_profile_id) : null;
  const project = c.project_id ? d.projects.find(p => p.id === c.project_id) : null;
  const last = d.messages.filter(m => m.conversation_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-1)[0];
  return {
    ...c,
    persona: persona ? { id: persona.id, name: persona.name, tagline: persona.tagline, avatar_color: persona.avatar_color } : null,
    voice: voice ? { id: voice.id, display_name: voice.display_name, params: voice.params } : null,
    project: project ? { id: project.id, title: project.title, genre: project.genre } : null,
    last_message: last ? last.content.slice(0, 60) : null,
    updated_at: last ? last.created_at : c.created_at,
  };
}

router.get('/', (req, res) => {
  const d = db();
  const list = d.conversations.filter(c => c.user_id === req.user.id)
    .map(withJoins)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  res.json({ code: 0, data: { list, total: list.length } });
});

router.post('/', (req, res) => {
  const d = db();
  const { project_id, persona_id, voice_profile_id } = req.body || {};
  if (project_id && !ownProject(req, project_id)) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const persona = persona_id ? d.personas.find(p => p.id === persona_id && (p.is_preset || p.user_id === req.user.id)) : null;
  const voice = voice_profile_id ? d.voices.find(v => v.id === voice_profile_id && (v.is_preset || v.user_id === req.user.id)) : null;
  const now = new Date().toISOString();
  const c = {
    id: uuid(),
    user_id: req.user.id,
    project_id: project_id || null,
    persona_id: persona ? persona.id : (d.personas.find(p => p.is_preset && p.id === 'preset-liwen')?.id || null),
    voice_profile_id: voice ? voice.id : null,
    title: '新的创作会话',
    created_at: now,
    updated_at: now,
  };
  d.conversations.push(c);
  d.stats.conversations_created++;
  saveDb();
  res.json({ code: 0, data: { conversation: withJoins(c) } });
});

router.patch('/:id', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  if (req.body.title) c.title = req.body.title;
  if (req.body.persona_id) c.persona_id = req.body.persona_id;
  if (req.body.voice_profile_id !== undefined) c.voice_profile_id = req.body.voice_profile_id;
  c.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { conversation: withJoins(c) } });
});

router.get('/:id', (req, res) => {
  const c = db().conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  res.json({ code: 0, data: { conversation: withJoins(c) } });
});

router.get('/:id/messages', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  const before = req.query.before || new Date().toISOString();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let list = d.messages.filter(m => m.conversation_id === c.id && m.created_at < before)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit);
  res.json({ code: 0, data: { list, total: list.length } });
});

// 发送消息：返回 message 记录；SSE 通过 /stream 实时推送助手回复
router.post('/:id/messages', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  const { content, reply_as_voice } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ code: 40001, message: '消息不能为空' });
  const q = checkQuota('message', req.user.id);
  if (!q.allowed) return res.status(429).json({ code: 42901, message: '今日消息配额已用完（' + q.limit + ' 条），请明天再试', quota: q });
  consumeQuota('message', req.user.id);
  const now = new Date().toISOString();
  const msg = { id: uuid(), conversation_id: c.id, role: 'user', content: content.trim(), reply_as_voice: !!reply_as_voice, created_at: now };
  d.messages.push(msg);
  d.stats.messages_sent++;
  c.updated_at = now;
  if (!c.title || c.title === '新的创作会话') {
    const first = d.messages.find(m => m.conversation_id === c.id && m.role === 'user');
    c.title = first ? (first.content.slice(0, 20) + (first.content.length > 20 ? '…' : '')) : c.title;
  }
  const mem = extractMemory(content, c.project_id);
  mem.forEach(m => d.memories.push({ ...m, id: uuid(), user_id: req.user.id, created_at: now }));
  saveDb();
  res.status(202).json({ code: 0, data: { message: msg } });
});

// SSE 流式对话
router.get('/:id/stream', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const persona = d.personas.find(p => p.id === c.persona_id) || null;
  const voice = d.voices.find(v => v.id === c.voice_profile_id) || null;
  const project = c.project_id ? d.projects.find(p => p.id === c.project_id) : null;
  const chapter = project ? d.chapters.filter(ch => ch.project_id === project.id).sort((a, b) => a.order_index - b.order_index)[0] : null;
  const history = d.messages.filter(m => m.conversation_id === c.id).slice(-12)
    .map(m => ({ role: m.role, content: m.content }));

  const lastUser = [...d.messages].reverse().find(m => m.conversation_id === c.id && m.role === 'user');
  const input = lastUser ? lastUser.content : '';

  (async () => {
    try {
      send('start', { ok: true });
      const { reply, replyType, source } = await generateCoachReply({
        persona, project, chapter, input, history, wantVoice: lastUser?.reply_as_voice, userId: req.user.id,
      });
      // 流式输出：按句分片
      const chunks = reply.split(/(?<=[。！？!?；;])/).filter(s => s.trim());
      const step = Math.max(1, Math.floor((chunks.length || 1) / 10));
      let emitted = '';
      for (let i = 0; i < chunks.length; i++) {
        const piece = chunks[i] + (i < chunks.length - 1 ? '' : '');
        emitted += piece;
        send('text_delta', { delta: piece });
        if ((i + 1) % step === 0) await new Promise(r => setTimeout(r, 60));
      }
      const now = new Date().toISOString();
      const assistantMsg = { id: uuid(), conversation_id: c.id, role: 'assistant', content: reply.trim(), reply_type: replyType, source, created_at: now };
      d.messages.push(assistantMsg);
      d.stats.messages_sent++;
      c.updated_at = now;
      saveDb();
      send('text_done', { message_id: assistantMsg.id, reply_type: replyType, source });
      if (lastUser?.reply_as_voice) {
        send('audio_ready', { audio_url: null, note: '使用浏览器 TTS 播放', voice: voice ? { display_name: voice.display_name, params: voice.params } : null, text: reply.trim() });
      }
      send('done', {});
      res.end();
    } catch (e) {
      console.error('[SSE]', e);
      send('error', { message: e.message || '生成失败' });
      res.end();
    }
  })();

  req.on('close', () => {
    res.end();
  });
});

// 采纳助手回复到文章：追加到指定章节，或新建章节
router.post('/:id/adopt', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  const { message_id, chapter_id, mode } = req.body || {};
  const msg = d.messages.find(m => m.id === message_id && m.conversation_id === c.id);
  if (!msg || msg.role !== 'assistant') return res.status(400).json({ code: 40001, message: '消息不存在或不是助手回复' });
  const text = msg.content;
  if (!text.trim()) return res.status(400).json({ code: 40001, message: '回复内容为空' });

  let targetChapter;
  if (chapter_id) {
    targetChapter = d.chapters.find(ch => ch.id === chapter_id && ch.project_id === c.project_id);
    if (!targetChapter) return res.status(404).json({ code: 40401, message: '目标章节不存在' });
    const now = new Date().toISOString();
    d.snapshots.push({ id: uuid(), chapter_id: targetChapter.id, content: targetChapter.content, note: '采纳对话内容前', created_at: now });
    d.snapshots = d.snapshots.slice(-50);
    targetChapter.content = (targetChapter.content ? targetChapter.content + '\n\n' : '') + text.trim();
    targetChapter.word_count = targetChapter.content.length;
    targetChapter.updated_at = now;
    const proj = d.projects.find(p => p.id === c.project_id);
    if (proj) proj.updated_at = now;
  } else {
    if (!c.project_id) return res.status(400).json({ code: 40001, message: '该会话未关联作品，无法新建章节' });
    const now = new Date().toISOString();
    const maxOrder = d.chapters.filter(ch => ch.project_id === c.project_id).reduce((m, ch) => Math.max(m, ch.order_index), -1);
    targetChapter = {
      id: uuid(), project_id: c.project_id, title: '新章节（来自对话）', content: text.trim(),
      order_index: maxOrder + 1, status: 'draft', word_count: text.trim().length, created_at: now, updated_at: now,
    };
    d.chapters.push(targetChapter);
  }
  // 标记消息已采纳
  msg.adopted_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { chapter: targetChapter, adopted: true } });
});

router.delete('/:id', (req, res) => {
  const d = db();
  const c = d.conversations.find(x => x.id === req.params.id && x.user_id === req.user.id);
  if (!c) return res.status(404).json({ code: 40401, message: '会话不存在' });
  d.conversations = d.conversations.filter(x => x.id !== c.id);
  d.messages = d.messages.filter(m => m.conversation_id !== c.id);
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});

export default router;
