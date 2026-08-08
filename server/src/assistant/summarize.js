// 统一 AI 助手：作品摘要生成与缓存
// 每个作品生成「摘要 + 简约信息」，落库到 project.summary（含更新时间）
import { db, saveDb } from '../db.js';
import { callLLM } from '../ai.js';
import { projectBrief, projectChapterContext, listUserProjects } from './context.js';

export async function summarizeProject(userId, projectId) {
  const d = db();
  const p = listUserProjects(userId).find(x => x.id === projectId);
  if (!p) return { ok: false, reason: 'not-found' };

  const chs = d.chapters.filter(c => c.project_id === projectId).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (chs.length === 0) {
    p.summary = '';
    p.summary_updated_at = new Date().toISOString();
    saveDb();
    return { ok: true, brief: projectBrief(p, chs), generated: false };
  }

  // 喂前若干章 + 末尾（避免超长）
  const maxChars = 6000;
  let text = '';
  for (const c of chs) {
    text += `\n【${c.title}】\n${c.content || ''}`;
    if (text.length > maxChars) break;
  }
  text = text.slice(0, maxChars);

  const sys = '你是 Aicho Muse 的书籍摘要助手。请为下面的作品写一份精炼摘要（200 字以内），并给出：主题、主要人物、当前进度。用 JSON 输出，格式：{"summary":"...","theme":"...","characters":["..."],"progress":"..."}。只输出 JSON。';
  try {
    const raw = await callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: `作品标题：${p.title}${p.subtitle ? '（' + p.subtitle + '）' : ''}\n体裁：${p.genre}\n\n正文片段：\n${text}` },
    ], { temperature: 0.4, max_tokens: 500 });
    let parsed = null;
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* 忽略 */ } }
    p.summary = parsed?.summary || raw || '';
    p.summary_theme = parsed?.theme || '';
    p.summary_characters = parsed?.characters || [];
    p.summary_progress = parsed?.progress || '';
    p.summary_updated_at = new Date().toISOString();
    saveDb();
    return { ok: true, brief: projectBrief(p, chs), generated: true };
  } catch (e) {
    return { ok: false, reason: 'llm-failed', message: e.message };
  }
}

export function hasSummary(projectId) {
  const p = db().projects.find(x => x.id === projectId);
  return !!(p?.summary);
}
