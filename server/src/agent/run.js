// 写作 Agent：主循环
// 流程：构建系统提示词 → 调 LLM → 解析工具调用 → 执行工具 → 返回结构化回复
// 同时将「用户输入 / AI 回复 / 工具调用」记录到 agent_logs 表（供审计与回看）
import { callLLM, cleanWritingOutput, classifyWritingIntent } from '../ai.js';
import { buildAgentSystemPrompt } from './prompts.js';
import { extractToolCall, isWritingTool } from './parse.js';
import { TOOL_SPECS } from './tools.js';
import { db, saveDb, uuid } from '../db.js';

// 记录一次 agent 交互（用户输入 + AI 回复 + 工具选择 + 元数据）
export function logAgentRun({ userId, conversationId, projectId, chapterId, input, tool, params, output, replyType, source, error }) {
  try {
    const row = {
      id: uuid(),
      user_id: userId || null,
      conversation_id: conversationId || null,
      project_id: projectId || null,
      chapter_id: chapterId || null,
      input: String(input || '').slice(0, 4000),
      tool: tool || null,
      params: params || null,
      output: String(output || '').slice(0, 8000),
      reply_type: replyType || null,
      source: source || 'llm',
      error: error || null,
      created_at: new Date().toISOString(),
    };
    db().agent_logs.push(row);
    saveDb();
    return row;
  } catch (e) {
    console.error('[Agent] 记录 agent_logs 失败:', e.message);
    return null;
  }
}

// 执行工具：返回 { content, replyType }
function executeTool(toolCall, input, project, chapter) {
  const tool = toolCall?.tool;
  const params = toolCall?.params || {};
  const spec = TOOL_SPECS[tool];

  if (tool === 'ask_question') {
    const q = String(params.question || '').trim() || '能再多讲讲这一段吗？';
    return { content: q, replyType: spec.replyType };
  }
  if (tool === 'guide') {
    const advice = String(params.advice || '').trim();
    if (advice) return { content: advice, replyType: spec.replyType };
    // 兜底：LLM 没给 advice 时用通用引导
    return { content: '别着急，先把最打动你的那个画面写下来，哪怕只有一句话。然后我们再看怎么展开。', replyType: spec.replyType };
  }
  if (isWritingTool(tool) || tool === 'write_paragraph') {
    let text = String(params.text || '').trim();
    const kind = params.kind || 'continue';
    // 清洗：去掉可能的标题行/编辑注
    text = cleanWritingOutput(text);
    if (!text) {
      // 兜底：没生成正文时给一段通用续写
      text = project?.title
        ? '风从很远的地方吹来，带着《' + project.title + '》里那些未说完的话。故事走到这里，忽然安静了一下——像一个人站在路口，等某个答案落下来。'
        : '那一刻，所有的话都停在嘴边。他抬头看了看天，云正慢慢地走，像时间一样不肯回头。';
    }
    return { content: text, replyType: 'writing', kind };
  }
  // 未知工具 → 按引导处理（不产出正文）
  return { content: '我在听，能再说细一点吗？特别是你最先想到的那个画面。', replyType: 'guide' };
}

// Agent 主入口
export async function runWritingAgent({ persona, project, chapter, input, history, userId, conversationId, referenceDocs, linkedProjectIds }) {
  const userPrefs = userId ? (db().users || []).find(u => u.id === userId)?.prefs : null;
  const assistantName = userPrefs?.assistant_name || '缪斯';
  const userName = (userPrefs?.my_name || '').trim();
  const writingMode = classifyWritingIntent(input);

  // 记忆检索：按书隔离——只取「用户级记忆 + 当前作品记忆 + 本会话显式接入的其他作品记忆」，
  // 未接入的作品绝不混入。跨书记忆标注书名，让 AI 知道来源。
  const linkIds = Array.isArray(linkedProjectIds) ? linkedProjectIds.filter(Boolean) : [];
  const allUserProjects = (db().projects || []).filter(p => p.user_id === userId || (p.collaborators || []).some(c => c.user_id === userId));
  const oldProjectMemoryCount = (db().memories || []).filter(m => m.user_id === userId && m.scope === 'project' && !m.project_id).length;
  const titleOf = (pid) => allUserProjects.find(p => p.id === pid)?.title || '';
  const memories = userId ? (db().memories || [])
    .filter(m => {
      if (m.user_id !== userId) return false;
      if (m.scope === 'project') {
        if (m.project_id) return m.project_id === project?.id || linkIds.includes(m.project_id);
        return allUserProjects.length <= 1;   // 旧数据兜底：仅一本书时安全
      }
      return true;                            // 用户级记忆跨作品保留
    })
    .sort((a, b) => Number(b.scope === 'project') - Number(a.scope === 'project') || (b.importance || 0) - (a.importance || 0))
    .slice(0, 8)
    .map(m => {
      // 跨书记忆打上书名标签，便于 AI 区分来源
      if (m.project_id && m.project_id !== project?.id) {
        return { ...m, content: m.content, _tag: titleOf(m.project_id) || '其他作品' };
      }
      return m;
    }) : [];

  const s = db().settings.ai;
  const hasUni = (process.env.LLM_API_KEY || s.llm_api_key) && (process.env.LLM_PROVIDER || s.llm_provider) && (process.env.LLM_PROVIDER || s.llm_provider) !== 'none';
  const hasLegacy = s.api_key && s.provider !== 'none';

  if (hasUni || hasLegacy) {
    try {
      const system = buildAgentSystemPrompt({ persona, project, chapter, assistantName, userName, memories, writingMode, referenceDocs });
      const messages = [
        { role: 'system', content: system },
        ...(history || []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        { role: 'user', content: input },
      ];
      const raw = await callLLM(messages, { temperature: writingMode ? 0.7 : 0.6, max_tokens: writingMode ? 1200 : 700 });
      const toolCall = extractToolCall(raw);
      // 解析失败兜底：写作模式 → writing；否则 → 视为对话回复
      if (!toolCall) {
        const replyType = writingMode ? 'writing' : 'guide';
        const content = writingMode ? cleanWritingOutput(raw) : String(raw || '').trim();
        if (content) {
          logAgentRun({ userId, conversationId, projectId: project?.id, chapterId: chapter?.id, input, tool: null, params: null, output: content, replyType, source: 'llm-fallback', error: toolCall ? null : 'unparseable' });
          return { reply: content, replyType, source: 'llm-fallback', tool: null, params: null };
        }
      } else {
        const { content, replyType } = executeTool(toolCall, input, project, chapter);
        logAgentRun({ userId, conversationId, projectId: project?.id, chapterId: chapter?.id, input, tool: toolCall.tool, params: toolCall.params, output: content, replyType, source: 'llm-agent' });
        return { reply: content, replyType, source: 'llm-agent', tool: toolCall.tool, params: toolCall.params };
      }
    } catch (e) {
      console.error('[Agent] LLM 调用失败，降级规则:', e.message);
      // 记录失败
      logAgentRun({ userId, conversationId, projectId: project?.id, chapterId: chapter?.id, input, tool: null, params: null, output: '', replyType: 'guide', source: 'rules-fallback', error: e.message });
    }
  }

  // 规则兜底：写作意图 → 生成段落；否则 → 引导提问
  if (writingMode) {
    const reply = '风从很远的地方吹来，带着那些未说完的话。故事走到这里，忽然安静了一下——像一个人站在路口，等某个答案落下来。';
    logAgentRun({ userId, conversationId, projectId: project?.id, chapterId: chapter?.id, input, tool: 'write_paragraph', params: { kind: 'continue' }, output: reply, replyType: 'writing', source: 'rules' });
    return { reply, replyType: 'writing', source: 'rules', tool: 'write_paragraph', params: { kind: 'continue' } };
  }
  const reply = '我在听，能再说细一点吗？特别是你最先想到的那个画面。';
  logAgentRun({ userId, conversationId, projectId: project?.id, chapterId: chapter?.id, input, tool: 'ask_question', params: {}, output: reply, replyType: 'question', source: 'rules' });
  return { reply, replyType: 'question', source: 'rules', tool: 'ask_question', params: {} };
}
