export type ReaderSettings = {
  layout: 'single' | 'double'; direction: 'left' | 'right' | 'up';
  fontSize: number; lineHeight: number; font: 'serif' | 'sans'; theme: 'paper' | 'white' | 'green' | 'night';
};
export type ReadingPosition = { chapter: number; offset: number; version: number };
export const DEFAULT_READER_SETTINGS: ReaderSettings = { layout: 'single', direction: 'left', fontSize: 20, lineHeight: 1.9, font: 'serif', theme: 'paper' };
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function normalizeReaderSettings(value: unknown): ReaderSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ReaderSettings>;
  return { layout: v.layout === 'double' ? 'double' : 'single', direction: v.direction === 'right' || v.direction === 'up' ? v.direction : 'left',
    fontSize: Math.round(number(v.fontSize, 20, 14, 32)), lineHeight: number(v.lineHeight, 1.9, 1.4, 2.4),
    font: v.font === 'sans' ? 'sans' : 'serif', theme: ['paper', 'white', 'green', 'night'].includes(v.theme || '') ? v.theme! : 'paper' };
}
export function readReaderSettings(): ReaderSettings {
  try { return normalizeReaderSettings(JSON.parse(localStorage.getItem('muse:reader-settings') || 'null')); } catch { return { ...DEFAULT_READER_SETTINGS }; }
}
export function readReadingPosition(id: string, version: number): ReadingPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem('muse:reading:' + id) || 'null');
    if (!value || value.version !== version || !Number.isSafeInteger(value.chapter) || value.chapter < 0 || !Number.isSafeInteger(value.offset) || value.offset < 0) return null;
    return value;
  } catch { return null; }
}
export function saveReaderValue(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Reading still works if storage is unavailable. */ }
}
export function spreadStart(page: number, total: number, spread: number) {
  const safe = Math.max(0, Math.min(Math.max(0, total - 1), Math.floor(page)));
  return Math.floor(safe / spread) * spread;
}
