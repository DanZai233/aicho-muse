export const GENRE_LABEL = {
  biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本', paper: '论文',
  guide: '生活指南', self_help: '心理与自我关怀', nonfiction: '纪实非虚构', essay: '随笔杂文', popular_science: '科普', travel: '旅行与城市漫游',
};
export const GENRES = Object.keys(GENRE_LABEL);
export function writingContext(project) {
  return `作品：《${project.title}》\n类型：${GENRE_LABEL[project.genre] || project.genre}\n主题：${project.theme || '待明确'}\n读者：${project.target_audience || '待明确'}\n语言：${project.language || 'zh-CN'}`;
}
export const EDITOR_RULES = '尊重作品类型。生活指南、心理自我关怀和实用非虚构按生活场景、具体问题和可执行办法组织，不强行编造主角、反派、冲突或故事线。提供低成本、低精力的替代方案，避免羞辱、鸡汤和保证效果。不要虚构研究、引文或事实；涉及健康、法律等内容说明适用边界，不作诊断。';
