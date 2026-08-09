// 文评（Literary Review）：风格化作品评论 + 语音朗读
// 提供多档文评预设（温柔鼓励 / 老朋友 / 严厉导师 / 编辑审稿 / 读者来信 / 文学奖评审），
// 支持 LLM 生成与规则兜底，返回结构化的「评分 + 段落式评论 + 一句金句」供前端仪式感展示。
import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db } from '../db.js';
import { callLLM, personaPrompt } from '../ai.js';
import { findProject } from '../access.js';

const router = Router();
router.use(authRequired);

export const REVIEW_STYLES = [
  { id: 'gentle', name: '温柔鼓励', icon: '🌿', desc: '像一位懂你的朋友，先看见你的努力，再轻轻指出可以更好的地方。', persona: '你是位温柔而有洞察力的编辑，善于发现作品里闪光的细节，用温暖而不失专业的语气评论。' },
  { id: 'oldfriend', name: '老友夜谈', icon: '🍵', desc: '像多年老友深夜读稿，犀利里带着亲昵，说话不留情面但句句为你。', persona: '你是作者多年的老友，说话直率、亲切，会先调侃再认真谈作品。' },
  { id: 'strict', name: '严厉导师', icon: '🔥', desc: '高标准严要求，一针见血指出问题，毫不留情，适合想被逼一把的时候。', persona: '你是要求极高的写作导师，对作品不客气的批评，直接点出结构与文笔的硬伤，但批评是为了让作者变得更好。' },
  { id: 'editor', name: '编辑审稿', icon: '📝', desc: '从出版编辑视角给出专业审稿意见，结构、节奏、市场感面面俱到。', persona: '你是资深出版编辑，从市场与读者视角审稿，专业、冷静、条理清晰。' },
  { id: 'reader', name: '读者来信', icon: '💌', desc: '模拟一位真实读者的阅读感受，真诚、共情，像收到一封手写信。', persona: '你是一位刚读完这部作品的普通读者，真诚分享你的阅读感受与共鸣。' },
  { id: 'award', name: '文学奖评审', icon: '🏆', desc: '以文学奖评审的庄重口吻，从思想、语言、结构三个维度郑重评价。', persona: '你是严肃的文学奖终审评委，以庄重、凝练、有分量的语言评价作品。' },
];

function styleOf(id) {
  return REVIEW_STYLES.find(s => s.id === id) || REVIEW_STYLES[0];
}

function buildReviewPrompt({ project, chapters, style, persona }) {
  const title = project?.title || '未命名作品';
  const genre = project?.genre || '';
  const theme = project?.theme || '';
  const body = chapters.map(c => `【第${(c.order_index || 0) + 1}章 ${c.title || ''}】\n${(c.content || '').slice(0, 1200)}`).join('\n\n');
  const wordCount = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  const personaBlock = persona ? personaPrompt(persona) : '';
  return {
    system: `${personaBlock ? personaBlock + '\n\n' : ''}${style.persona}
你正在为一部作品写「文评」。请用中文输出，格式如下（严格 JSON，不要其他文字）：
{
  "score": 0-100 的整数评分,
  "summary": "一句话总评（不超过 30 字）",
  "paragraphs": ["评论正文，分成 3-5 个自然段，每段 40-120 字", "..."],
  "quote": "一句适合做结尾的金句（可用作品意象）"
}
要求：
1. 结合作品实际内容给出具体评价，不要空泛。
2. 段落之间要有层次：先总评感受，再谈优点（细节/语言/结构），再指出可提升处，最后收束。
3. 以选中「评者」的性格与说话风格为主，结合所选评论视角，保持角色语气鲜明，不要写成通用 AI 腔。
4. 若作品还很短（不足 200 字），请真诚鼓励开始，并给一两个具体的推进建议。`,
    user: `作品信息：
书名：《${title}》
体裁：${genre}
主题：${theme || '未设置'}
总字数：约 ${wordCount} 字

正文：
${body || '（作品还没有正文）'}`,
  };
}

// 规则兜底：没有 LLM 时的文评
function fallbackReview({ project, chapters, style }) {
  const wordCount = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  const title = project?.title || '未命名作品';
  const para1 = wordCount > 0
    ? `读完《${title}》的现有篇章，我能感受到你在这部作品里放进了真东西——那些细节不是随便写的，它们带着你个人的温度。`
    : `《${title}》还只是刚翻开第一页的样子，但这恰恰是最有可能性的时候。`;
  const para2 = style.id === 'strict'
    ? `但坦白说，现在离「立住」还有距离：人物说话的腔调还不够分明，有些段落像是把想法铺开而不是把画面演出来。别急着写多，先把第一章改到「能看见、能听见、能闻到」。`
    : style.id === 'editor'
      ? `从编辑视角看，作品的骨架已经清楚了，节奏上还可以再收紧：把最有力的信息往前提，砍掉说明性的旁白，让读者自己发现。`
      : `我最喜欢的是你写到具体时刻的地方——那些「停下来」的瞬间最动人。接下来可以试着让主角在那个时刻做一个选择，哪怕很小，故事就自己往前走了一步。`;
  const quote = style.id === 'gentle' || style.id === 'reader'
    ? '写作是给时间留一扇窗，你已经开始为它擦玻璃了。'
    : style.id === 'strict'
      ? '严苛不是不爱，是知道你能写得更好。'
      : '好的故事从不为解释而活，它活着，是因为有人愿意相信。';
  return {
    score: wordCount === 0 ? 70 : Math.min(92, 78 + Math.round(wordCount / 800)),
    summary: wordCount === 0 ? '种子已埋下，等待发芽' : '有真实质感，继续打磨会发光',
    paragraphs: [para1, para2],
    quote,
  };
}

// POST /api/v1/projects/:id/review  body: { style?: string }
router.post('/projects/:id/review', async (req, res) => {
  const found = findProject(req, req.params.id);
  if (!found) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const d = db();
  const chapters = d.chapters.filter(c => c.project_id === found.p.id).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const style = styleOf(req.body?.style);
  // 可选：用助手人设的性格来写文评（默认人设/预设/公开/自己的均可）
  let persona = null;
  if (req.body?.persona_id) {
    persona = d.personas.find(x => x.id === req.body.persona_id && (x.is_preset || x.is_public || x.user_id === req.user.id)) || null;
  }
  const personaInfo = persona ? { id: persona.id, name: persona.name, tagline: persona.tagline || '', avatar: persona.avatar || '', avatar_color: persona.avatar_color || '#8b7d6b', voice_profile_id: persona.voice_profile_id || null } : null;

  // 无 LLM 配置时直接兜底
  const s = d.settings.ai;
  const hasLLM = ((process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none') || (s.api_key && s.provider !== 'none');
  if (!hasLLM) {
    return res.json({ code: 0, data: { style, persona: personaInfo, review: fallbackReview({ project: found.p, chapters, style, persona }) } });
  }

  const { system, user } = buildReviewPrompt({ project: found.p, chapters, style, persona });
  try {
    const raw = await callLLM([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { temperature: 0.75, max_tokens: 1200 });
    // 解析 JSON（容忍代码块）
    const block = String(raw || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    const rawJson = block ? block[1] : String(raw || '');
    const m = rawJson.match(/\{[\s\S]*\}/);
    let review = null;
    if (m) {
      try {
        const p = JSON.parse(m[0]);
        if (p && (p.summary || p.paragraphs || p.score != null)) {
          review = {
            score: Math.max(0, Math.min(100, Number(p.score) || 70)),
            summary: String(p.summary || '').slice(0, 40),
            paragraphs: (Array.isArray(p.paragraphs) ? p.paragraphs : []).map(x => String(x).trim()).filter(Boolean).slice(0, 6),
            quote: String(p.quote || '').slice(0, 80),
          };
          if (!review.paragraphs.length) review.paragraphs = [String(p.paragraphs || p.summary || raw).trim()];
        }
      } catch { /* 解析失败则走兜底 */ }
    }
    if (!review) review = fallbackReview({ project: found.p, chapters, style });
    return res.json({ code: 0, data: { style, review } });
  } catch (e) {
    return res.json({ code: 0, data: { style, persona: personaInfo, review: fallbackReview({ project: found.p, chapters, style, persona }) } });
  }
});

// GET /api/v1/review/styles 风格预设列表
router.get('/review/styles', (req, res) => {
  res.json({ code: 0, data: { styles: REVIEW_STYLES } });
});

export default router;
