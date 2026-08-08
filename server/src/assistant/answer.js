// 统一 AI 助手：问答编排
// 根据用户问题生成回复，并尝试解析「导航动作」供前端执行
import { callLLM } from '../ai.js';
import { buildContextText } from './context.js';
import { db } from '../db.js';

// 从回复文本中提取 JSON（容忍 markdown 代码块）
function extractJson(text) {
  if (!text) return null;
  const block = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = block ? block[1] : String(text);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const NAV_HINTS = [
  { label: '我的书', to: '/' },
  { label: '创作空间', to: '/workspace' },
  { label: '人设', to: '/personas' },
  { label: '音色', to: '/voices' },
  { label: '设置', to: '/settings' },
];

// 让模型决定导航动作；无法解析则给空
export async function askAssistant({ userId, question, projectId }) {
  const ctx = buildContextText(userId, projectId);
  const d = db();
  const user = d.users.find(u => u.id === userId);
  const assistantName = user?.prefs?.assistant_name || '缪斯';

  const sys = `你是 Aicho Muse 创作应用里的统一助手「${assistantName}」。
你的职责：
1. 基于提供的上下文回答用户关于「作品库 / 知识库 / 某部作品内容」的问题（包括文章摘要、写作建议、知识点问答）。
2. 如果用户在问“怎么去某页/某功能/在哪里”，返回导航动作；否则不返回动作。
3. 回答保持简洁、有温度、贴合创作场景。

可用导航目标：${NAV_HINTS.map(h => `"${h.label}"→${h.to}`).join('，')}（若当前在创作空间，也可用 "/workspace?project=ID" 打开指定作品）。

输出格式（严格 JSON，不要其他文字）：
{"answer":"你的回答","actions":[{"label":"按钮文案","to":"路由地址"}]}
若无需导航，actions 为 []。`;

  try {
    const raw = await callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: `用户问题：${question}\n\n当前上下文：\n${ctx}` },
    ], { temperature: 0.5, max_tokens: 800 });
    const parsed = extractJson(raw);
    if (parsed && parsed.answer) {
      return {
        answer: parsed.answer,
        actions: Array.isArray(parsed.actions) ? parsed.actions.filter(a => a?.label && a?.to) : [],
      };
    }
    return { answer: raw || '抱歉，我暂时无法回答这个问题。', actions: [] };
  } catch (e) {
    return { answer: '（助手暂时不可用：' + e.message + '）', actions: [] };
  }
}
