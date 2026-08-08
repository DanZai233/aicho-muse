import { db } from './db.js';

// ---------- UniLLM 统一大模型接入 ----------
// 复用 DanZai233/unillm-sdk：一份配置接入 14+ 厂商
let unillmPromise = null;
function loadUnillm() {
  if (!unillmPromise) {
    const p = process.env.UNILLM_PATH || 'unillm-sdk';
    unillmPromise = import(p).catch(e => {
      console.error('[AI] unillm-sdk 加载失败（回退内置规则）:', e.message);
      return null;
    });
  }
  return unillmPromise;
}



// ---------- 规则引擎：内置创作缪斯（无 API Key 时的兜底） ----------

const QUOTE_POOL = [
  '写作是雕刻回忆，刀慢一点，画面就深一点。',
  '好的故事都从一句“那时候”开始。',
  '别急着写完整，先让细节自己浮上来。',
  '最动人的细节，往往是那些你以为不重要的。',
];

const ENCOURAGEMENT = [
  '你已经迈出了最难的第一步，剩下的交给时间。',
  '这一小段里已经有你的声音了，继续保持。',
  '写作不是一次成型的，改着改着，它就亮了。',
  '记住这种感觉：你正在为自己留下什么。',
];

const FEEDBACK_OPENERS = [
  '这一段里，我最喜欢“{hit}”这个细节，它让画面立住了。',
  '你已经找到了“{hit}”这个支点，接下来可以让它再长大一点。',
  '“{hit}”写得很诚实，这是创作里最珍贵的东西。',
];

const FEEDBACK_QUESTIONS = [
  '如果时间再慢一点，那一刻你会先注意到什么？',
  '当时周围还有什么声音、气味、光线？',
  '这件事对你来说，为什么重要？',
  '如果把它写成一个画面，最先出现的是哪个动作？',
  '那时的你，心里真正想要的是什么？',
];

const SUGGESTIONS = [
  '试试用“我”的第一人称再讲一遍，会离故事更近。',
  '可以先把时间、地点、人物三件事写清楚，再往里加细节。',
  '试着只写三句话：开始前、发生中、结束后。',
  '把这段放进一个场景里：谁在，在哪儿，说了什么。',
  '不妨从结尾倒着写，先知道要去哪，路就清楚了。',
];

const INTROSPECTIVE = ['回忆', '小时候', '记得', '那年', '从前', '曾经', '妈妈', '爸爸', '家', '上学', '工作', '结婚', '离开', '故乡'];
const FICTION = ['小说', '故事', '主角', '人物', '情节', '开头', '结局', '章节', '角色', '冲突', '穿越', '科幻', '悬疑'];
const POETRY = ['诗', '诗歌', '意象', '押韵', '比喻'];
const BLOCKED = ['写不出来', '卡住', '没灵感', '写不下去', '不想写', '瓶颈', '放弃', '难'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function extractHit(text) {
  const cleaned = text.replace(/[，。！？、；：,.!?;:]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(p => p.length >= 2 && p.length <= 12);
  if (parts.length) return parts[0];
  return '这句话';
}

function categorize(input) {
  if (BLOCKED.some(k => input.includes(k))) return 'blocked';
  if (POETRY.some(k => input.includes(k))) return 'poetry';
  if (FICTION.some(k => input.includes(k))) return 'fiction';
  if (INTROSPECTIVE.some(k => input.includes(k))) return 'memoir';
  if (input.length < 15) return 'short';
  return 'story';
}

function personaPrompt(persona) {
  if (!persona) return '';
  const parts = [
    `你是${persona.name}${persona.tagline ? '：' + persona.tagline : ''}。`,
    persona.background ? `背景：${persona.background}。` : '',
    (persona.personality || []).length ? `性格：${persona.personality.join('、')}。` : '',
    `说话风格：${persona.speaking_style?.tone || '自然'}${(persona.speaking_style?.preferences || []).length ? '，偏好：' + persona.speaking_style.preferences.join('、') : ''}${(persona.speaking_style?.avoid || []).length ? '，避免：' + persona.speaking_style.avoid.join('、') : ''}${persona.speaking_style?.catchphrase ? '，口头禅：' + persona.speaking_style.catchphrase : ''}。`,
    (persona.values || []).length ? `你的价值观：${persona.values.join('、')}。` : '',
    persona.relationship ? `你和用户的关系：${persona.relationship}。` : '',
    (persona.expertise || []).length ? `你擅长：${persona.expertise.join('、')}。` : '',
    persona.greeting ? `开场白：${persona.greeting}（初次见面或适合时自然使用，不要每次重复）。` : '',
  ].filter(Boolean).join('\n');
  return parts;
}
const LANGUAGE_NAME = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };
function languageNote(lang) {
  if (!lang || lang === 'zh-CN') return '';
  const name = LANGUAGE_NAME[lang] || lang;
  return '【作品语言】本作品使用' + name + '创作。请用' + name + '与用户交流，并给出' + name + '的写作建议；专有名词可保留原文。';
}

// ---------- 写作专用 agent 工作流 ----------
// 用户明确要求 AI 直接写作（或选定方向/选项后），进入「只写作模式」：
// 只输出文章正文，供 diff 采纳；不提问、不鼓励、不加标题与说明。
const WRITE_INTENT_WORDS = [
  '帮我写', '帮我续', '帮我润', '帮我扩', '帮我改', '你写', '你来写', '代写', '替我写', '帮我生成',
  '续写', '扩写', '润色', '改写', '重写', '写一段', '写个', '写一篇', '写开头', '写下去',
  '接着写', '继续写', '直接写', '写出来', '初稿', '成稿', '写正文', '写内容', '你帮我', '请你写',
  '写这个故事', '写这个开头', '按这个写', '照这个写', '写一章', '写几段', '先写', '开始写',
  'write', 'continue the story', 'keep writing', 'write a', 'rewrite', 'polish', 'expand',
];
const WRITE_INTENT_RE = [
  /选.{0,6}(第一|第二|第三|第四|[一二三四]|[1234])/, // 选了方向/选项
  /就.{0,4}(写|用|选|按|来)/,
  /按.{0,8}(来|写|走|试试)/,
  /用.{0,8}(写|来|试试)/,
  /(这个|那个)方向/,
  /(写|走)(这个|那条|这条|这个)路/,
  /试试(第一|第二|[1234]|[一二三四])/,
];
export function classifyWritingIntent(input) {
  const t = String(input || '');
  if (WRITE_INTENT_WORDS.some(w => t.includes(w))) return true;
  return WRITE_INTENT_RE.some(re => re.test(t));
}

// 清理写作工具/写作模式的输出：去掉标题行（续写稿：/润色稿：/1) 改写稿 等）与「——编辑注：」说明
export function cleanWritingOutput(text) {
  let t = String(text || '').trim();
  if (!t) return t;
  // 去掉「【...】」前缀标题
  t = t.replace(/^【[^】]+】\s*/g, '');
  // 去掉 markdown 标题行（## 续写稿 / ## 1) 续写稿 等）
  t = t.replace(/^#{1,6}\s*(?:[0-9一二三四五六七八九十]+[)）、.、]?\s*)?(?:续写|润色|扩写|缩写|改写|重写|写作|风格迁移|翻译|生成)稿?[ \t]*[:：]?.*$/gm, '');
  // 去掉行首「续写稿：」等标题行（不带 #）
  t = t.replace(/^(?:[0-9一二三四五六七八九十]+[)）、.、]?\s*)?(?:续写|润色|扩写|缩写|改写|重写|写作|风格迁移|翻译|生成)稿?[ \t]*[:：].*$/gm, '');
  // 去掉「1) 改写稿」编号标题行
  t = t.replace(/^(?:[0-9一二三四五六七八九十]+[)）、.、]?\s*)?(?:改写稿|续写稿|润色稿|扩写稿|缩写稿|重写稿)[ \t]*$/gm, '');
  // 去掉「——编辑注：」整行及末尾说明
  t = t.replace(/\n+\s*[-—–]+\s*编辑[注按]?\s*[:：].*$/g, '');
  t = t.replace(/^\s*[-—–]+\s*编辑[注按]?\s*[:：][^\n]*/gm, '');
  // 清理多余空行，但保留段落间的换行
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function buildSmartContext(projectId, chapterId) {
  if (!projectId) return '';
  const d = db();
  const outline = d.outline_nodes.filter(n => n.project_id === projectId).sort((a, b) => a.order_index - b.order_index);
  const cards = d.character_cards.filter(c => c.project_id === projectId);
  const parts = [];
  if (outline.length) {
    const lines = outline.slice(0, 12).map((n, i) => {
      const ch = n.chapter_id ? d.chapters.find(c => c.id === n.chapter_id) : null;
      return (i + 1) + '. ' + (n.title || '未命名') + (ch ? '（第' + (ch.order_index + 1) + '章）' : '') + (n.summary ? '：' + n.summary.slice(0, 80) : '');
    });
    parts.push('【大纲】' + lines.join('\n'));
  }
  if (cards.length) {
    const clines = cards.slice(0, 10).map(c => '- ' + (c.name || '未命名') + '（' + (c.role || '配角') + '）' + (c.description ? '：' + c.description.slice(0, 80) : '') + (c.arc ? '；成长线：' + c.arc.slice(0, 50) : ''));
    parts.push('【人物卡】' + clines.join('\n'));
  }
  return parts.join('\n\n');
}

function coachReply(input, persona, project, chapter, history, userName) {
  // 写作专用 agent：用户明确要 AI 直接写 / 已选定方向 → 只输出正文
  if (classifyWritingIntent(input)) {
    const seed = String(input || '').replace(/[，。！？、；：,.!?;:\s]+/g, ' ').trim().slice(0, 40);
    const title = project?.title || '我的故事';
    let reply = seed
      ? seed + '。那天的风很轻，像有什么话要说，又没说完。我站在原地，忽然想起许多年前的自己——那时还不明白，人生里最好的部分，往往是从一句没说完的话开始的。'
      : '那天的风很轻，像有什么话要说，又没说完。我站在原地，忽然想起许多年前的自己——那时还不明白，人生里最好的部分，往往是从一句没说完的话开始的。';
    reply += '\n\n日子就这样一天天过去，有些事记不起来了，有些事却越来越清楚。后来我才明白，写作不是把过去找回来，而是让那些模糊的东西，第一次有了形状。后来我把这段日子写进了《' + title + '》里，像把一粒种子放进了土里。';
    return { reply, replyType: 'writing' };
  }
  const cat = categorize(input);
  const name = persona?.name || '黎文';
  const hit = extractHit(input);

  // 引导优先：默认给出复述 + 提问
  let reply = '';
  let replyType = 'question';

  if (cat === 'blocked') {
    replyType = 'encouragement';
    reply = `先别急，${name}陪着你。你不需要一次写出整篇——可以先只写一句话，比如“今天，我想写${project?.title || '我的故事'}，因为它……”。卡住的时候，往往是心里已经知道答案，只是还没找到入口。${pick(ENCOURAGEMENT)}`;
  } else if (cat === 'short') {
    replyType = 'question';
    reply = `我听到你说：“${input.slice(0, 30)}${input.length > 30 ? '…' : ''}”。这个开头很有味道。${pick(FEEDBACK_QUESTIONS)}`;
  } else if (cat === 'poetry') {
    replyType = 'feedback';
    reply = `诗歌最怕的不是短，而是没有气息。你这段里“${hit}”已经有画面了。试着把它放进一个更具体的时刻里，比如“${pick(['黄昏', '雨停', '灯亮', '风起'])}的时候”。${pick(ENCOURAGEMENT)}`;
  } else if (cat === 'fiction') {
    replyType = 'suggestion';
    reply = `这个故事的内核很有潜力。目前最值得先想清楚的是：主角最想要什么，谁在拦他。你可以先写一个 200 字的场景：主角第一次做出选择。${pick(SUGGESTIONS)}`;
  } else if (cat === 'memoir') {
    replyType = 'question';
    reply = `这段回忆里，“${hit}”这个细节让我很触动。${pick(FEEDBACK_QUESTIONS)}如果你愿意，可以闭上眼睛回到那一刻，把最先浮上来的画面告诉我。`;
  } else {
    replyType = 'feedback';
    reply = pick(FEEDBACK_OPENERS).replace('{hit}', hit) + ' ' + pick(FEEDBACK_QUESTIONS);
  }

  // 用户称呼：自然地带进回复开头（仅规则兜底时；LLM 由提示词约束）
  if (userName && !reply.startsWith(userName + '，')) reply = userName + '，' + reply;

  // 人设化口吻
  const style = persona?.speaking_style?.tone || '';
  if (style.includes('犀利') || style.includes('直接')) {
    reply = `直说了——${reply.replace(/^先别急，|^这一段里，|^我听到你说/g, m => '')}`;
  } else if (style.includes('轻盈') || style.includes('诗意')) {
    reply = `${reply} 就像潮水，退一步，才能看清石头原来的形状。`;
  }
  return { reply, replyType };
}

// ---------- LLM 提供商（UniLLM 统一接入 / OpenAI 兼容兜底） ----------

export async function callLLM(messages, opts = {}) {
  const s = db().settings.ai;
  const provider = String(process.env.LLM_PROVIDER || s.llm_provider || s.provider || '').toLowerCase();
  let model = String(process.env.LLM_MODEL || s.llm_model || s.model || '').trim();
  // DeepSeek 硬性约束：只允许 v4-flash，禁用 pro/thinking/reasoner 系列
  if (provider === 'deepseek' && !/v4-flash/i.test(model)) {
    console.warn('[AI] DeepSeek 仅允许 v4-flash，自动切换: ' + (model || '未配置') + ' -> deepseek-v4-flash');
    model = 'deepseek-v4-flash';
  }
  const envAI = {
    llm_provider: process.env.LLM_PROVIDER || s.llm_provider,
    llm_api_key: process.env.LLM_API_KEY || s.llm_api_key,
    llm_model: model,
    base_url: process.env.LLM_BASE_URL || s.base_url,
  };
  const hasUniKey = envAI.llm_api_key && envAI.llm_provider && envAI.llm_provider !== 'none';
  const hasLegacyKey = s.api_key && s.provider !== 'none';

  // DeepSeek v4-flash 是推理模型：不显式禁用 thinking 时，token 预算会先被 reasoning_content 烧光，
  // 导致 content 为空（finish_reason=length）。unillm-sdk 0.1.0 无法透传 thinking 参数，
  // 因此 DeepSeek 走 OpenAI 兼容直连并禁用思考；其余厂商继续走 UniLLM。
  if (provider === 'deepseek' && envAI.llm_api_key) {
    const base = (envAI.base_url || 'https://api.deepseek.com').replace(/\/+$/, '');
    try {
      const resp = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + envAI.llm_api_key },
        body: JSON.stringify({ model: model || 'deepseek-v4-flash', messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.max_tokens ?? 800, stream: false, thinking: { type: 'disabled' } }),
      });
      if (!resp.ok) throw new Error('DeepSeek 调用失败 (' + resp.status + '): ' + (await resp.text().catch(() => '')).slice(0, 200));
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      if (text) return text.trim();
      console.warn('[AI] DeepSeek 返回空内容（finish_reason=' + data.choices?.[0]?.finish_reason + '），尝试 UniLLM 兜底');
    } catch (e) {
      console.error('[AI] DeepSeek 直连失败:', e.message);
      if (opts.noFallback) throw e;
    }
  }

  // 优先 UniLLM（多厂商）
  if (hasUniKey) {
    const lib = await loadUnillm();
    if (lib && lib.createLLM) {
      try {
        const llm = lib.createLLM({
          provider: envAI.llm_provider,
          apiKey: envAI.llm_api_key,
          baseUrl: envAI.base_url || undefined,
          model: envAI.llm_model || undefined,
          temperature: opts.temperature ?? 0.8,
          maxTokens: opts.max_tokens ?? 800,
          timeoutMs: 60000,
        });
        const res = await llm.chat(messages, { signal: opts.signal });
        if (res?.text) return res.text.trim();
      } catch (e) {
        console.error('[AI] UniLLM 调用失败:', e.message);
        if (opts.noFallback) throw e;
      }
    }
  }

  // 兼容旧配置：OpenAI 兼容直连
  if (hasLegacyKey && !hasUniKey) {
    const base = (s.base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = base + '/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.api_key },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.max_tokens ?? 800, stream: false }),
    });
    if (!resp.ok) throw new Error('LLM 调用失败 (' + resp.status + '): ' + (await resp.text().catch(() => '')).slice(0, 200));
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? null;
  }
  return null;
}
export async function generateCoachReply({ persona, project, chapter, input, history, wantVoice, userId }) {
  const userPrefs = userId ? (db().users || []).find(u => u.id === userId)?.prefs : null;
  const assistantName = userPrefs?.assistant_name || '缪斯';
  const userName = (userPrefs?.my_name || '').trim();
  // 记忆检索：项目级优先（与当前作品强相关），再按 importance 排序，最多注入 5 条（Prompt Engineering §1/§9）
  const memories = userId ? (db().memories || [])
    .filter(m => m.user_id === userId)
    .sort((a, b) => Number(b.scope === 'project') - Number(a.scope === 'project') || (b.importance || 0) - (a.importance || 0))
    .slice(0, 5) : [];
  const memoryText = memories.length ? memories.map(m => '- [' + (m.scope === 'project' ? '作品' : '用户') + '] ' + m.content).join('\n') : '';

  const s = db().settings.ai;
  const personaName = persona?.name || '黎文';
  const styleNote = persona?.speaking_style?.tone ? `说话风格：${persona.speaking_style.tone}。` : '';

  // 始终先尝试 LLM（UniLLM 多厂商 或 旧版 OpenAI 兼容）
  const hasUni = (process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none';
  const hasLegacy = s.api_key && s.provider !== 'none';
  if (hasUni || hasLegacy) {
    try {
      const writingMode = classifyWritingIntent(input);
      const system = [
        personaPrompt(persona),
        '',
        '【行为准则】你是用户的' + assistantName + '（创作缪斯），不是代写机器。除非用户明确要求“帮我写/续写/扩写”，否则：',
        '1. 先倾听并复述核心内容，让用户感到被理解；',
        '2. 用提问引导用户自己展开细节，一次最多 1–2 个问题；',
        '3. 反馈必须具体：指出哪一段、哪个意象、哪处冲突，并说明为什么；',
        '4. 每次回复结尾给一句真诚的鼓励，不说空话；',
        '5. 回复长度：常规 80–200 字；',
        '6. 不替用户做创作决定，可以给选项并说明各自效果；',
        '7. 始终保持人设。',
        writingMode ? '【写作模式】用户明确要求你直接写作（代写/续写/扩写/润色/选定了方向）。请只输出文章正文本身：不要任何标题、编号、前言、说明、提问、鼓励或“编辑注”。保持作品语言与当前语境，直接续写或改写正文。' : '',
        '',
        userName ? '【称呼】用户希望被称为「' + userName + '」。在合适的时机（如鼓励、回应开头）自然地用这个称呼叫用户，不要每句都叫，也不要生硬重复。' : '',
        '',
        project ? `【项目上下文】作品《${project.title}》（${project.genre || ''}），主题：${project.theme || '未设置'}。` : '',
        languageNote(project?.language),
        chapter ? `当前章节：${chapter.title}。` : '',
        project ? buildSmartContext(project.id, chapter?.id) : '',
        memories.length ? `【记忆上下文】你记得这些关于用户的创作信息：
${memoryText}` : '',
      ].filter(Boolean).join('\n');
      const messages = [
        { role: 'system', content: system },
        ...(history || []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        { role: 'user', content: input },
      ];
      const text = await callLLM(messages);
      if (text) {
        // 写作模式：只输出正文，直接标记为可采纳的写作稿
        if (writingMode) return { reply: cleanWritingOutput(text), replyType: 'writing', source: 'llm' };
        // 尝试结构化判定回复类型
        const lower = text;
        let replyType = 'feedback';
        if (/^.*？\s*$/.test(lower) && !lower.includes('\n')) replyType = 'question';
        else if (lower.includes('试试') || lower.includes('建议') || lower.includes('可以')) replyType = 'suggestion';
        else if (lower.includes('加油') || lower.includes('很棒') || lower.includes('你已经')) replyType = 'encouragement';
        return { reply: text.trim(), replyType, source: 'llm' };
      }
    } catch (e) {
      console.error('[AI] LLM 调用失败，降级到规则引擎:', e.message);
    }
  }
  const r = coachReply(input, persona, project, chapter, history, userName);
  console.warn('[AI] 本次未调用 LLM（无有效 key 或调用失败），回退内置规则引擎。hasUni=' + hasUni + ' hasLegacy=' + hasLegacy);
  if (memoryText) r.reply = r.reply.replace('如果你愿意，可以闭上眼睛回到那一刻', '记得你说过：' + memoryText.split('\n')[0].replace('- ', '') + '。如果你愿意，可以闭上眼睛回到那一刻');
  return { ...r, source: 'rules' };
}

export async function runWritingTool(mode, text, instruction, language) {
  const s = db().settings.ai;
  const hasUni = (process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none';
  const hasLegacy = s.api_key && s.provider !== 'none';
  if (hasUni || hasLegacy) {
    try {
      const modeMap = {
        polish: '润色',
        expand: '扩写',
        condense: '缩写',
        continue: '续写',
        restyle: '风格迁移',
      };
      const userContent = `请对以下文本进行${modeMap[mode] || mode}${instruction ? `，要求：${instruction}` : ''}。\n\n原文：\n${text}`;
            const sysByMode = {
        polish: '你是专业的中文文学编辑。对原文润色：保持原意与语气，保留作者核心意象与个人风格，修正病句与冗余。输出：\n1) 改写稿；\n2) 以“——编辑注：”开头给出 2–3 条改动说明（指出改了什么、为什么）。',
        expand: '你是专业的中文文学编辑。扩写原文：丰富细节与画面，保持原有语气与核心信息，不改变情节走向。输出：\n1) 扩写稿；\n2) 以“——编辑注：”开头给一句说明（你补充了什么）。',
        condense: '你是专业的中文文学编辑。缩写原文：保留核心情节与信息，删去冗余修饰。输出：\n1) 缩写稿；\n2) 以“——编辑注：”开头给一句说明（删减了什么）。',
        continue: '你是专业的中文文学编辑。延续上文的情节与语气续写 300–500 字：不引入与已定设定冲突的新角色，结尾留一个自然的悬念或推进。输出：\n1) 续写稿；\n2) 以“——编辑注：”开头给一句接续理由。',
        restyle: '你是专业的中文文学编辑。将原文改为指定风格（如冷峻、诗意、克制）：只变表达，不变情节与信息。输出：\n1) 改写稿；\n2) 以“——编辑注：”开头给出 2–3 处原句→改写句对照说明。',
      };
      let sys = sysByMode[mode] || sysByMode.polish;
      const lang = languageNote(language);
      if (lang) sys = lang + '\n' + sys;
      const result = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: userContent }], { max_tokens: 1200, temperature: 0.7 });
      if (result) return { result: cleanWritingOutput(result), source: 'llm' };
    } catch (e) {
      console.error('[AI] 写作工具降级:', e.message);
    }
  }
  // 规则兜底
  let result = text;
  if (mode === 'polish') {
    result = text.replace(/\s{2,}/g, ' ').trim();
    result = result.replace(/，(因为|所以)/g, '，$1').trim();
  } else if (mode === 'expand') {
    result = `${text.trim()}\n\n在那之后，空气里还留着一点什么——说不清，但让人忍不住回头。`;
  } else if (mode === 'condense') {
    result = text.trim().split(/(?<=[。！？])/).slice(0, Math.max(1, Math.ceil(text.length / 40))).join('');
  } else if (mode === 'continue') {
    result = `${text.trim()}\n\n而那天之后的事，谁也没有预料到——\n`;
  } else if (mode === 'restyle') {
    result = `【按“${instruction || '冷峻克制'}”的风格重写】\n${text.trim()}`;
  }
  return { result: cleanWritingOutput(result), source: 'rules' };
}

export function consistencyCheck(text, characters = [], timeline = []) {
  const issues = [];
  const names = characters.map(c => c.name).filter(Boolean);
  for (const n of names) {
    const re = new RegExp(n, 'g');
    const matches = (text.match(re) || []).length;
    if (matches > 0) {
      const card = characters.find(c => c.name === n);
      if (card?.role && !text.includes(card.role)) {
        // 人物在正文出现但身份交代不明（弱提示）
        issues.push({ level: 'info', message: '人物「' + n + '」在正文中出现，建议在首次出现时交代身份（' + card.role + '）。' });
      }
    }
  }
  // 时间线冲突：正文提到的时间点与时间线事件顺序对比（简化：检查年份/时间表述是否乱序）
  if (timeline.length > 1) {
    const sorted = [...timeline].sort((a, b) => (a.when || '').localeCompare(b.when || ''));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].when && sorted[i - 1].when && sorted[i].when === sorted[i - 1].when) {
        issues.push({ level: 'warn', message: '时间线「' + sorted[i].when + '」有多个事件，请确认先后顺序与因果。' });
      }
    }
  }
  // 代词与重复：检测明显的重复段落（>30 字完全相同）
  const seen = new Set();
  const paras = text.split(/\n+/).filter(p => p.trim().length > 30);
  for (const p of paras) {
    const key = p.trim().slice(0, 30);
    if (seen.has(key)) issues.push({ level: 'warn', message: '存在重复段落：「' + p.trim().slice(0, 25) + '…」，建议合并或删减。' });
    seen.add(key);
  }
  if (!issues.length) issues.push({ level: 'ok', message: '未发现明显的人物、时间线或重复问题。' });
  return issues;
}

// ---------- 记忆提取（简单关键词记忆，M3 简化版） ----------
export function extractMemory(input, projectId) {
  const items = [];
  const m = input.match(/(我|我们|他|她|主角)(很|非常|特别)?(喜欢|热爱|害怕|讨厌|想要|希望|相信|记得)(.{2,20})/);
  if (m) items.push({ scope: projectId ? 'project' : 'user', key: '偏好/态度', content: `${m[1]}${m[2] || ''}${m[3]}${m[4]}`, importance: 3 });
  const n = input.match(/(决定|确定|定下)[^。！？]{2,30}/);
  if (n) items.push({ scope: projectId ? 'project' : 'user', key: '创作决定', content: n[0], importance: 4 });
  return items;
}
