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



// ---------- 规则引擎：内置创作教练（无 API Key 时的兜底） ----------

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
  return `你是${persona.name}：${persona.tagline}。背景：${persona.background}。性格：${persona.personality.join('、')}。说话风格：${persona.speaking_style?.tone || '自然'}，偏好：${(persona.speaking_style?.preferences || []).join('、')}，避免：${(persona.speaking_style?.avoid || []).join('、')}。`;
}

function coachReply(input, persona, project, chapter, history) {
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

async function callLLM(messages, opts = {}) {
  const s = db().settings.ai;
  const envAI = {
    llm_provider: process.env.LLM_PROVIDER || s.llm_provider,
    llm_api_key: process.env.LLM_API_KEY || s.llm_api_key,
    llm_model: process.env.LLM_MODEL || s.llm_model,
    base_url: process.env.LLM_BASE_URL || s.base_url,
  };
  const hasUniKey = envAI.llm_api_key && envAI.llm_provider && envAI.llm_provider !== 'none';
  const hasLegacyKey = s.api_key && s.provider !== 'none';

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
      body: JSON.stringify({ model: s.model || 'gpt-4o-mini', messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.max_tokens ?? 800, stream: false }),
    });
    if (!resp.ok) throw new Error('LLM 调用失败 (' + resp.status + '): ' + (await resp.text().catch(() => '')).slice(0, 200));
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? null;
  }
  return null;
}

export async function generateCoachReply({ persona, project, chapter, input, history, wantVoice, userId }) {
  const memories = userId ? (db().memories || []).filter(m => m.user_id === userId).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 5) : [];
  const memoryText = memories.length ? memories.map(m => '- ' + m.content).join('\n') : '';

  const s = db().settings.ai;
  const personaName = persona?.name || '黎文';
  const styleNote = persona?.speaking_style?.tone ? `说话风格：${persona.speaking_style.tone}。` : '';

  // 始终先尝试 LLM（UniLLM 多厂商 或 旧版 OpenAI 兼容）
  const hasUni = (process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none';
  const hasLegacy = s.api_key && s.provider !== 'none';
  if (hasUni || hasLegacy) {
    try {
      const system = [
        personaPrompt(persona),
        '',
        '【行为准则】你是用户的创作教练，不是代写机器。除非用户明确要求“帮我写/续写/扩写”，否则：',
        '1. 先倾听并复述核心内容，让用户感到被理解；',
        '2. 用提问引导用户自己展开细节，一次最多 1–2 个问题；',
        '3. 反馈必须具体：指出哪一段、哪个意象、哪处冲突，并说明为什么；',
        '4. 每次回复结尾给一句真诚的鼓励，不说空话；',
        '5. 回复长度：常规 80–200 字；',
        '6. 不替用户做创作决定，可以给选项并说明各自效果；',
        '7. 始终保持人设。',
        '',
        project ? `【项目上下文】作品《${project.title}》（${project.genre || ''}），主题：${project.theme || '未设置'}。` : '',
        chapter ? `当前章节：${chapter.title}。` : '',
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
  const r = coachReply(input, persona, project, chapter, history);
  if (memoryText) r.reply = r.reply.replace('如果你愿意，可以闭上眼睛回到那一刻', '记得你说过：' + memoryText.split('\n')[0].replace('- ', '') + '。如果你愿意，可以闭上眼睛回到那一刻');
  return { ...r, source: 'rules' };
}

export async function runWritingTool(mode, text, instruction) {
  const s = db().settings.ai;
  if (s.api_key && s.provider !== 'none') {
    try {
      const modeMap = {
        polish: '润色',
        expand: '扩写',
        condense: '缩写',
        continue: '续写',
        restyle: '风格迁移',
      };
      const userContent = `请对以下文本进行${modeMap[mode] || mode}${instruction ? `，要求：${instruction}` : ''}。\n\n原文：\n${text}`;
      const sys = '你是一位专业的中文文学编辑。输出处理后的文本，保持原有语气与核心信息；若为润色，在文末用“——编辑注：”给出一条简短说明。';
      const result = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: userContent }], { max_tokens: 1200, temperature: 0.7 });
      if (result) return { result: result.trim(), source: 'llm' };
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
  return { result, source: 'rules' };
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
