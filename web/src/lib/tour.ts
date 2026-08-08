// 新手引导进度：跨页面记录真实完成的操作步骤
// 页面在对应操作成功时调用 completeTourStep(key)，OnboardingTour 监听事件自动推进；
// 进度存 localStorage（am_tour_progress），整体完成标记 am_tour_done。
export type TourStepKey = 'settings' | 'persona' | 'voice' | 'book';

const KEY = 'am_tour_done';
const PROGRESS_KEY = 'am_tour_progress';
const EVENT = 'am:tour-step';
const RESET_EVENT = 'am:tour-reset';

const VALID: TourStepKey[] = ['settings', 'persona', 'voice', 'book'];

export function getTourProgress(): TourStepKey[] {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((k) => VALID.includes(k)) : [];
  } catch {
    return [];
  }
}

export function isStepDone(k: TourStepKey) {
  return getTourProgress().includes(k);
}

export function completeTourStep(k: TourStepKey) {
  const cur = getTourProgress();
  if (!cur.includes(k)) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...cur, k]));
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: k }));
}

export function isTourDone() {
  return localStorage.getItem(KEY) === '1';
}

export function markTourDone() {
  localStorage.setItem(KEY, '1');
}

export function resetTour() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PROGRESS_KEY);
  window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

export function onTourStep(cb: (k: TourStepKey) => void) {
  const fn = (e: Event) => cb((e as CustomEvent).detail as TourStepKey);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export function onTourReset(cb: () => void) {
  window.addEventListener(RESET_EVENT, cb);
  return () => window.removeEventListener(RESET_EVENT, cb);
}
