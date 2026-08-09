// 统一 AI 助手：上下文构建
// 聚合用户的知识库（长期记忆）+ 作品库（摘要/简介/章节信息），供问答使用
import { db } from '../db.js';

const GENRE_LABEL = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };
const CHAPTER_SNIPPET = 800; // 每章最多喂给模型的字数

// 单部作品的简要信息（不含全文）
export function projectBrief(p, chapters) {
  const words = chapters.reduce((s, c) => s + (c.content || '').length, 0);
  return {
    id: p.id,
    title: p.title,
    genre: GENRE_LABEL[p.genre] || p.genre || '',
    theme: p.theme || '',
    language: p.language || 'zh-CN',
    status: p.status || 'drafting',
    chapter_count: chapters.length,
    word_count: words,
    summary: p.summary || '',
    subtitle: p.subtitle || '',
    author_name: p.author_name || '',
    updated_at: p.updated_at,
  };
}

// 当前用户可见的作品列表（owner + 协作者）
export function listUserProjects(userId) {
  const d = db();
  return d.projects.filter(p => p.user_id === userId || (p.collaborators || []).some(c => c.user_id === userId));
}

// 单部作品的章节上下文（截断，供「文章内容问答」）
export function projectChapterContext(projectId, limit = 3) {
  const d = db();
  const chapters = d.chapters.filter(c => c.project_id === projectId).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  return chapters.slice(0, limit).map(c => ({
    id: c.id,
    title: c.title,
    content: (c.content || '').slice(0, CHAPTER_SNIPPET),
    word_count: (c.content || '').length,
  }));
}

// 知识库上下文：用户长期记忆（按作品隔离）+ 人设资料
// focusProjectId 传入时，项目级记忆只取该作品；用户级记忆始终保留
export function knowledgeContext(userId, focusProjectId) {
  const d = db();
  const allUserProjects = d.projects.filter(p => p.user_id === userId || (p.collaborators || []).some(c => c.user_id === userId));
  const memories = (d.memories || [])
    .filter(m => {
      if (m.user_id !== userId) return false;
      if (m.scope === 'project') {
        if (m.project_id) return m.project_id === focusProjectId;
        return allUserProjects.length <= 1; // 旧数据兜底：仅一本书时安全
      }
      return true;
    })
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 20)
    .map(m => m.content || '');
  const personas = (d.personas || []).filter(p => p.user_id === userId || p.is_preset || p.is_public)
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      tagline: p.tagline || '',
      personality: (p.personality || []).join('、'),
      values: (p.values || []).join('、'),
    }));
  return { memories, personas };
}

// 拼装完整上下文文本（模型友好）
export function buildContextText(userId, focusProjectId) {
  const projects = listUserProjects(userId);
  const briefs = projects.map(p => {
    const chs = db().chapters.filter(c => c.project_id === p.id);
    const b = projectBrief(p, chs);
    return `- 《${b.title}》[${b.genre}]${b.theme ? '，主题：' + b.theme : ''}，${b.chapter_count} 章 ${b.word_count} 字${b.summary ? '，摘要：' + b.summary : ''}`;
  });
  const kb = knowledgeContext(userId, focusProjectId);
  const memoryText = kb.memories.length ? kb.memories.map(m => '- ' + m).join('\n') : '（暂无）';
  const personaText = kb.personas.length
    ? kb.personas.map(p => `- ${p.name}${p.tagline ? '（' + p.tagline + '）' : ''}${p.personality ? ' 性格：' + p.personality : ''}`).join('\n')
    : '（暂无）';

  let focus = '';
  if (focusProjectId) {
    const p = projects.find(x => x.id === focusProjectId);
    if (p) {
      const chs = db().chapters.filter(c => c.project_id === p.id);
      const snippets = projectChapterContext(focusProjectId).map(c => `[第 ${c.title}] ${c.content}`).join('\n');
      focus = `\n【当前作品：《${p.title}》】\n${projectBrief(p, chs).summary ? '摘要：' + projectBrief(p, chs).summary + '\n' : ''}章节片段：\n${snippets}`;
    }
  }

  return `
【作品库】
${briefs.length ? briefs.join('\n') : '（还没有作品）'}
【知识库：创作记忆】
${memoryText}
【知识库：人设资料】
${personaText}
${focus}
`.trim();
}
