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

// 助手可执行的工具动作（由前端处理，含副作用类动作）
// - nav：跳转（label/to）
// - open_project：打开指定作品（id / label），前端跳 /workspace?project=ID
// - create_project：帮用户创建一本书（label / title / genre / subtitle / author_name / theme / language / cover_color），前端弹确认后调 API 创建并跳转
export function normalizeAction(a) {
  if (!a || typeof a !== 'object') return null;
  const label = String(a.label || '').trim();
  const type = String(a.type || (a.to ? 'nav' : '')).trim();
  if (!label) return null;
  if (type === 'nav' || (type === '' && a.to)) {
    const to = String(a.to || '').trim();
    if (!to) return null;
    return { type: 'nav', label, to };
  }
  if (type === 'open_project' && a.id) {
    return { type: 'open_project', label, id: String(a.id) };
  }
  if (type === 'create_project') {
    const title = String(a.title || '').trim();
    if (!title) return null;
    return {
      type: 'create_project', label,
      title,
      genre: String(a.genre || 'fiction').trim() || 'fiction',
      subtitle: String(a.subtitle || '').trim(),
      author_name: String(a.author_name || '').trim(),
      theme: String(a.theme || '').trim(),
      language: String(a.language || 'zh-CN').trim() || 'zh-CN',
      cover_color: String(a.cover_color || '#8b7d6b').trim() || '#8b7d6b',
    };
  }
  return null;
}

// 让模型决定工具动作；无法解析则给空
export async function askAssistant({ userId, question, projectId }) {
  const ctx = buildContextText(userId, projectId);
  const d = db();
  const user = d.users.find(u => u.id === userId);
  const assistantName = user?.prefs?.assistant_name || '缪斯';

  const sys = `你是 Aicho Muse 创作应用里的统一助手「${assistantName}」，既能回答问题，也能帮用户操作应用。

你的职责：
1. 基于提供的上下文回答用户关于「作品库 / 知识库 / 某部作品内容」的问题（包括文章摘要、写作建议、知识点问答）。
2. 识别用户的「操作意图」并给出对应动作：
   - 用户想去某页/某功能/在哪里 → type=nav（可用：${NAV_HINTS.map(h => `"${h.label}"→${h.to}`).join('，')}）
   - 用户想打开某个已有作品 → type=open_project，id 必须是作品库中的真实作品 ID（从上文作品库的《标题》行对应读取，不要用书名代替 ID）
   - 用户明确想「创建一本书/新建作品/开始写一本（含书名、体裁、主题等要求）」→ type=create_project，帮用户把书填好：title 必填，genre 可选（biography 自传/fiction 小说/prose 散文/poetry 诗歌/script 剧本/paper 论文），subtitle/author_name/theme/language/cover_color 可选
3. 回答保持简洁、有温度、贴合创作场景。给出 create_project 动作时，在 answer 里说明你准备建一本怎样的书。

输出格式（严格 JSON，不要其他文字）：
{"answer":"你的回答","actions":[{"type":"nav|open_project|create_project","label":"按钮文案","to":"路由(仅 nav)","id":"作品ID(仅 open_project)","title":"书名(仅 create_project)","genre":"fiction(可选)","subtitle":"副标题(可选)","author_name":"署名(可选)","theme":"主题(可选)","language":"zh-CN(可选)"}]}
若无需动作，actions 为 []。`;

  try {
    const raw = await callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: `用户问题：${question}\n\n当前上下文：\n${ctx}` },
    ], { temperature: 0.4, max_tokens: 900 });
    const parsed = extractJson(raw);
    if (parsed && parsed.answer) {
      const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
        .map(normalizeAction)
        .filter(Boolean)
        .map(a => {
          // open_project：模型可能给的是书名而不是 ID，按标题解析成真实项目 ID
          if (a.type === 'open_project') {
            const pj = d.projects.find(x => x.id === a.id) || d.projects.find(x => x.title === String(a.id).trim() || x.title === String(a.label || '').replace(/^打开[《]?/, '').replace(/[》]?$/, ''));
            if (pj && pj.id !== a.id) return { ...a, id: pj.id };
          }
          return a;
        })
        .filter(a => !(a.type === 'open_project' && !d.projects.some(x => x.id === a.id)));
      return { answer: parsed.answer, actions };
    }
    return { answer: raw || '抱歉，我暂时无法回答这个问题。', actions: [] };
  } catch (e) {
    return { answer: '（助手暂时不可用：' + e.message + '）', actions: [] };
  }
}
