import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authRequired);

const GENRE_LABEL = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };
const TOOL_LABEL = { polish: '润色', expand: '扩写', condense: '缩写', continue: '续写', restyle: '风格迁移' };
const REPLY_LABEL = { question: '提问', feedback: '反馈', suggestion: '建议', encouragement: '鼓励', other: '其他' };

// 高频主题词提取：去除常见停用词后统计 2-4 字词频
const STOPWORDS = new Set(['一个','我们','你们','他们','她们','这个','那个','什么','怎么','因为','所以','但是','如果','就是','自己','时候','已经','没有','还是','可以','知道','觉得','感觉','起来','出来','过去','现在','后来','突然','好像','真的','非常','特别','可能','然后','这样','那样','那里','这里','之间','之中','之后','之前','一天','一年','一次','一点','一些','东西','事情','地方','时间','世界','生活','故事','小说','章节','开始','最后','最后','第二','第一','第三','还有','还有','其实','只是','一直','一起','甚至','几乎','终于','终于','依然','仍然','因为','所以','于是','接着','随着','经过','通过','他们','她们','那个','那些','这个','这些']);
function tokenize(text) {
  const out = [];
  const cleaned = String(text || '').replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < cleaned.length - 1; i++) {
    const bi = cleaned.slice(i, i + 2);
    if (!STOPWORDS.has(bi)) out.push(bi);
    if (i < cleaned.length - 2) {
      const tri = cleaned.slice(i, i + 3);
      if (!STOPWORDS.has(tri)) out.push(tri);
    }
  }
  return out;
}

// 个人写作报告：风格偏好 + 高频主题 + 创作轨迹
router.get('/report', (req, res) => {
  const d = db();
  const uid = req.user.id;
  const projects = d.projects.filter(p => p.user_id === uid);
  const projectIds = projects.map(p => p.id);
  const chapters = d.chapters.filter(c => projectIds.includes(c.project_id));
  const conversations = d.conversations.filter(c => c.user_id === uid);
  const convIds = conversations.map(c => c.id);
  const messages = d.messages.filter(m => convIds.includes(m.conversation_id) || (m.role === 'tool' && !m.conversation_id));
  const toolMsgs = messages.filter(m => m.role === 'tool' || m.tool_used);
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  const memories = d.memories.filter(m => m.user_id === uid);

  // 基本盘
  const totalWords = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  const draftDays = new Set(chapters.map(c => (c.updated_at || c.created_at || '').slice(0, 10)).filter(Boolean)).size;
  const firstDate = chapters.length ? chapters.map(c => c.created_at).sort()[0] : null;
  const lastDate = chapters.length ? chapters.map(c => c.updated_at).sort().reverse()[0] : null;

  // 体裁分布
  const genreCount = {};
  for (const p of projects) genreCount[p.genre || 'prose'] = (genreCount[p.genre || 'prose'] || 0) + 1;

  // 高频主题词（从章节 + 用户消息）
  const freq = {};
  for (const c of chapters) for (const t of tokenize(c.content)) freq[t] = (freq[t] || 0) + 1;
  for (const m of messages) if (m.role === 'user') for (const t of tokenize(m.content)) freq[t] = (freq[t] || 0) + 1;
  const topTopics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, count]) => ({ word, count }));

  // 工具使用统计
  const toolCount = {};
  for (const m of toolMsgs) {
    let mode = m.tool_used;
    if (!mode && m.content) { try { mode = JSON.parse(m.content)?.mode; } catch { /* ignore */ } }
    if (mode) toolCount[mode] = (toolCount[mode] || 0) + 1;
  }

  // 回复类型分布
  const replyCount = {};
  for (const m of assistantMsgs) replyCount[m.reply_type || 'other'] = (replyCount[m.reply_type || 'other'] || 0) + 1;

  // 偏好推断（从记忆里已有标签 + 高频词补充）
  const prefs = memories.filter(m => ['偏好/态度', '写作偏好'].includes(m.key) || m.scope === 'user').map(m => m.content).slice(0, 6);

  res.json({ code: 0, data: {
    totals: { projects: projects.length, chapters: chapters.length, words: totalWords, conversations: conversations.length, messages: messages.length, draftDays, memories: memories.length, firstDate, lastDate },
    genres: Object.entries(genreCount).map(([k, v]) => ({ genre: k, label: GENRE_LABEL[k] || k, count: v })),
    topics: topTopics,
    tools: Object.entries(toolCount).map(([k, v]) => ({ tool: k, label: TOOL_LABEL[k] || k, count: v })),
    replies: Object.entries(replyCount).map(([k, v]) => ({ type: k, label: REPLY_LABEL[k] || k, count: v })),
    prefs,
  } });
});

export default router;
