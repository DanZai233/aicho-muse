// 新手引导：跨页面分步导航，引导新用户完成
// ① 个人设置（称呼/偏好）→ ② 人设（创建或挑选）→ ③ 音色（可选）→ ④ 开始创作
// 进度存 localStorage（am_tour_done），首次进入主页自动弹出；可随时跳过/重开
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export type TourStep = {
  key: string;
  page: string; // 路由路径
  title: string;
  desc: string;
  target?: string; // 页内高亮目标元素 data-tour 值
  cta: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    key: 'settings', page: '/settings', title: '① 建立你们的称呼',
    desc: '先设置「你如何称呼缪斯」和「缪斯如何称呼你」。设置后，AI 回复会自动带上这个称呼，让陪伴更亲近。',
    target: 'tour-names', cta: '下一步 → 认识人设',
  },
  {
    key: 'persona', page: '/personas', title: '② 挑选一位创作伙伴',
    desc: '这里可以新建属于你的人设，也可以从「官方预设」或「公开分享」里挑选现成的——现在有原神、乙游等 16+ 位角色可选。',
    target: 'tour-persona-create', cta: '下一步 → 听听声音',
  },
  {
    key: 'voice', page: '/voices', title: '③ 挑选/试听音色（可选）',
    desc: '为你的伙伴选一个声音：官方预设音色已绑定，也可以去音频广场搜索、试听、收藏。',
    target: 'tour-voice-tabs', cta: '下一步 → 开始创作',
  },
  {
    key: 'home', page: '/', title: '④ 开始你的第一本书',
    desc: '在首页「新建一本书」，起个书名、选体裁、挑封面。之后进入创作空间，随时可以和缪斯对话、让 AI 给建议、把内容采纳进文章。',
    target: 'tour-create-book', cta: '开始创作 ✨',
  },
];

const KEY = 'am_tour_done';

export function isTourDone() { return localStorage.getItem(KEY) === '1'; }
export function markTourDone() { localStorage.setItem(KEY, '1'); }
export function resetTour() { localStorage.removeItem(KEY); }

export default function OnboardingTour() {
  const nav = useNavigate();
  const loc = useLocation();
  const [stepIdx, setStepIdx] = useState(() => (isTourDone() ? -1 : 0));
  const [show, setShow] = useState(() => !isTourDone());
  const step = stepIdx >= 0 ? TOUR_STEPS[stepIdx] : null;

  // 进入对应页面后展示引导卡（若有高亮目标）
  useEffect(() => {
    if (!step || show) return;
    setShow(true);
  }, [loc.pathname, step, show]);

  // 高亮目标元素：滚动到可视区域并加高亮环
  useEffect(() => {
    if (!step?.target || !show) return;
    const t = document.querySelector('[data-tour="' + step.target + '"]') as HTMLElement | null;
    if (!t) return;
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = t.style.boxShadow;
    t.style.boxShadow = '0 0 0 3px var(--accent, #8b7d6b), 0 0 24px rgba(139,125,107,0.45)';
    t.style.borderRadius = '12px';
    const timer = setTimeout(() => { t.style.boxShadow = prev; }, 2500);
    return () => { clearTimeout(timer); t.style.boxShadow = prev; };
  }, [step, show]);

  const goNext = () => {
    setShow(false);
    if (stepIdx >= TOUR_STEPS.length - 1) {
      markTourDone();
      setStepIdx(-1);
      nav('/');
      return;
    }
    const next = TOUR_STEPS[stepIdx + 1];
    setStepIdx(i => i + 1);
    nav(next.page);
    // 等页面渲染后显示
    setTimeout(() => setShow(true), 350);
  };

  const skip = () => {
    markTourDone();
    setStepIdx(-1);
    setShow(false);
  };

  // 首页仍有旧引导卡，隐藏它（新引导接管）
  useEffect(() => {
    if (stepIdx >= 0) document.body.classList.add('tour-active');
    else document.body.classList.remove('tour-active');
    return () => document.body.classList.remove('tour-active');
  }, [stepIdx]);

  if (!step || !show) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={skip}>
      <div
        className="w-full max-w-md rounded-2xl border border-accent/20 bg-surface p-6 shadow-2xl animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-serif text-lg font-bold text-paper">M</div>
          <button onClick={skip} className="text-xs text-ink/40 hover:text-ink">跳过引导</button>
        </div>
        <h3 className="font-serif text-lg font-semibold">{step.title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink/60">{step.desc}</p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1">
            {TOUR_STEPS.map((s, i) => (
              <span key={s.key} className={'h-1.5 rounded-full transition-all ' + (i === stepIdx ? 'w-6 bg-accent' : 'w-1.5 bg-ink/15')} />
            ))}
          </div>
          <button
            onClick={goNext}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-paper transition hover:bg-accent/90"
          >
            {step.cta}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-ink/35">引导会自动带你到对应的页面，可随时跳过；之后可在设置里重新打开。</p>
      </div>
    </div>
  );
}
