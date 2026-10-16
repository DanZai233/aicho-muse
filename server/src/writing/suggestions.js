import { uuid } from '../db.js';
export const COLLECTIONS = { outline: 'outline_nodes', characters: 'character_cards', timeline: 'timeline_events' };
export const RESULT_KEYS = { outline: 'node', characters: 'card', timeline: 'event' };
export function normalizeSuggestion(input, kind, items) {
  const fields = kind === 'outline' ? ['title', 'summary'] : kind === 'characters' ? ['name', 'role', 'description', 'arc'] : ['when', 'event'];
  const out = { type: ['add', 'update', 'note'].includes(input?.type) ? input.type : 'note', suggestion_id: typeof input?.suggestion_id === 'string' ? input.suggestion_id.slice(0, 100) : uuid() };
  for (const field of [...new Set([...fields, 'summary', 'description', 'event', 'reason'])]) out[field] = typeof input?.[field] === 'string' ? input[field].slice(0, 12000) : '';
  if (out.type === 'update') {
    const target = items.find(item => item.id === input.id);
    if (target) out.id = target.id;
    else { out.type = 'add'; out.reason = '未找到可调整的现有条目，改为新增。' + out.reason; }
  }
  return out;
}
