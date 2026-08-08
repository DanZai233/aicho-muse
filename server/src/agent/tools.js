// 写作 Agent 工具注册表
// 每种工具定义：执行所需参数 + 回复类型 + 展示标签
// 核心原则：只有产出「文章正文」的工具（writing）才进入 diff；
// 提问/引导等对话工具不进入 diff，避免问答内容污染正文。

export const TOOL_SPECS = {
  ask_question: {
    name: 'ask_question',
    label: '提问',
    description: '向用户提出 1–2 个引导性问题，帮助回忆细节、挖掘素材或理清思路。不产出正文。',
    replyType: 'question',
    params: { question: '要问的问题（1–2 个，简洁有力）' },
  },
  guide: {
    name: 'guide',
    label: '引导',
    description: '给出创作方向、写作建议或鼓励，帮助用户推进作品。可以给选项或步骤，但不产出正式正文。',
    replyType: 'guide',
    params: { advice: '给用户的引导性建议（2–5 句）' },
  },
  write_paragraph: {
    name: 'write_paragraph',
    label: '段落生成',
    description: '直接生成一段可采纳的文章正文：续写、新段落或改写指定段落。只输出正文本身，无标题、无解释、无提问。',
    replyType: 'writing',
    params: {
      text: '生成的正文段落（中文，100–500 字，可直接采纳）',
      kind: '"continue" 续写 / "new" 新段落 / "polish" 改写',
    },
  },
};

// 工具清单（按推荐顺序，供提示词使用）
export const AGENT_TOOLS = Object.values(TOOL_SPECS);

export function toolLabel(name) {
  return TOOL_SPECS[name]?.label || name;
}
