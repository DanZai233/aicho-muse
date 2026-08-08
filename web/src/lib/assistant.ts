// 统一 AI 助手：API 类型与调用
import { api } from './api';

export type AssistantAction = { label: string; to: string };
export type AskResult = { answer: string; actions: AssistantAction[] };

export type ProjectBrief = {
  id: string;
  title: string;
  genre: string;
  theme: string;
  chapter_count: number;
  word_count: number;
  summary: string;
  has_summary: boolean;
  status: string;
};

export async function askAssistant(question: string, projectId?: string): Promise<AskResult> {
  const d = await api.post<AskResult>('/assistant/ask', { question, projectId });
  return d;
}

export async function listProjectBriefs(): Promise<ProjectBrief[]> {
  const d = await api.get<{ list: ProjectBrief[] }>('/assistant/projects');
  return d.list;
}

export async function summarizeProject(projectId: string): Promise<{ brief: ProjectBrief; generated: boolean }> {
  const d = await api.post<{ brief: ProjectBrief; generated: boolean }>('/assistant/projects/' + projectId + '/summarize', {});
  return d;
}
