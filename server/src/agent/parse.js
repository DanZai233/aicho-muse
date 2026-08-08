// 写作 Agent：LLM 工具调用输出解析
// 约束模型输出严格 JSON，但容忍代码块、前后缀文字，尽量健壮解析

export function extractToolCall(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // 1. 尝试整体 JSON
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && parsed.tool) return parsed;
  } catch { /* 继续 */ }
  // 2. 提取 ```json ... ``` 块
  const block = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (block) {
    try {
      const parsed = JSON.parse(block[1].trim());
      if (parsed && typeof parsed === 'object' && parsed.tool) return parsed;
    } catch { /* 继续 */ }
  }
  // 3. 提取首个 { ... } 对象
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed && typeof parsed === 'object' && parsed.tool) return parsed;
    } catch { /* 继续 */ }
  }
  // 4. 宽松匹配「tool=xxx」行
  const tm = s.match(/(?:tool|工具)\s*[:=]\s*["']?([a-z_]+)["']?/i);
  if (tm) return { tool: tm[1], params: { text: s, question: s } };
  return null;
}

export function isWritingTool(name) {
  return name === 'write_paragraph' || name === 'polish_paragraph';
}
