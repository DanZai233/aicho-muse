// 跟随式新手引导：不是简单弹窗，而是引导用户到对应页面、真实完成对应创建操作。
// ① 设置称呼 → ② 创建/挑选人设 → ③ 挑选/试听音色（可选）→ ④ 新建第一本书
// 每一步由页面在操作成功后调用 completeTourStep() 自动推进；
// 用户随时可跳过，跳过时提示可到右下角找 Muse 助手。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getTourProgress,
  isTourDone,
  isStepDone,
  markTourDone,
  onTourReset,
  onTourStep,
  resetTour,
  type TourStepKey,
} from '../lib/tour';
import { Button } from './ui';

type GuideStep = {
  key: TourStepKey;
  page: string;
  title: string;
  desc: string;
  target?: string;
  actionLabel: string;
};

const STEPS: GuideStep[] = [
  {
    key: 'settings',
    page: '/settings',
    title: '① 建立你们的称呼',
    desc: '先设置「你如何称呼缪斯」和「缪斯如何称呼你」。保存后，AI 回复会自动带上这个称呼，让陪伴更亲近。',
    target: 'tour-names',
    actionLabel: '下一步 → 认识人设',
  },
  {
    key: 'persona',
    page: '/personas',
    title: '② 挑选一位创作伙伴',
    desc: '可以从官方预设里挑一位，也可以点「新建人设」亲手打造。完成后我们会继续下一步。',
    target: 'tour-persona-create',
    actionLabel: '下一步 → 听听声音',
  },
  {
    key: 'voice',
    page: '/voices',
    title: '③ 挑选/试听音色（可选）',
    desc: '为你的伙伴选一个声音：官方预设已绑定音色，也可以去音频广场搜索、试听、收藏。',
    target: 'tour-voice-tabs',
    actionLabel: '下一步 → 开始创作',
  },
  {
    key: 'book',
    page: '/',
    title: '④ 开始你的第一本书',
    desc: '在首页「新建作品」里起书名、选体裁、挑封面。创建成功后，就进入创作空间啦。',
    target: 'tour-create-book',
    actionLabel: '开始创作 ✨',
  },
];

export default function OnboardingTour() {
  const nav = useNavigate();
  const loc = useLocation();
  const [active, setActive] = useState<TourStepKey | null>(() => {
    if (isTourDone()) return null;
    const progress = getTourProgress();
    const first = STEPS.find((s) => !progress.includes(s.key));
    return first ? first.key : null;
  });
  const [dismissed, setDismissed] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [justSkipped, setJustSkipped] = useState(false);
  const finishedRef = useRef(false);

  const step = useMemo(() => STEPS.find((s) => s.key === active) || null, [active]);

  // 当前页面匹配时展示引导卡（高亮目标元素）
  useEffect(() => {
    if (!step || dismissed) return;
    const onPage = step.page === '/' ? loc.pathname === '/' : loc.pathname === step.page;
    setShowCard(onPage);
    if (onPage) {
      const t = step.target ? document.querySelector('[data-tour="' + step.target + '"]') as HTMLElement | null : null;
      if (t) {
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prev = t.style.boxShadow;
        t.style.boxShadow = '0 0 0 3px var(--accent, #8b7d6b), 0 0 24px rgba(139,125,107,0.5)';
        t.style.borderRadius = '12px';
        const timer = setTimeout(() => { t.style.boxShadow = prev; }, 2600);
        return () => { clearTimeout(timer); t.style.boxShadow = prev; };
      }
    }
  }, [step, dismissed, loc.pathname, showCard]);

  // 某一步真实完成 → 自动推进
  useEffect(() => onTourStep((k) => {
    if (finishedRef.current) return;
    const idx = STEPS.findIndex((s) => s.key === k);
    if (idx < 0) return;
    const next = STEPS[idx + 1];
    if (!next) {
      markTourDone();
      finishedRef.current = true;
      setActive(null);
      setShowCard(false);
      return;
    }
    setDismissed(false);
    setJustSkipped(false);
    setActive(next.key);
    nav(next.page);
    setTimeout(() => setShowCard(true), 350);
  }), [nav]);

  // 用户点开设置重新引导
  useEffect(() => onTourReset(() => {
    finishedRef.current = false;
    setJustSkipped(false);
    setDismissed(false);
    const first = STEPS[0];
    setActive(first.key);
    setShowCard(false);
    nav(first.page);
    setTimeout(() => setShowCard(true), 350);
  }), [nav]);

  const skip = () => {
    markTourDone();
    finishedRef.current = true;
    setActive(null);
    setShowCard(false);
    setJustSkipped(true);
  };

  const goNext = () => {
    const idx = step ? STEPS.findIndex((s) => s.key === step.key) : -1;
    const next = STEPS[idx + 1];
    if (!next) {
      markTourDone();
      finishedRef.current = true;
      setActive(null);
      setShowCard(false);
      return;
    }
    setDismissed(false);
    setShowCard(false);
    setActive(next.key);
    nav(next.page);
    setTimeout(() => setShowCard(true), 350);
  };

  if (!step || dismissed) {
    if (justSkipped && !isTourDone()) {
      return null;
    }
    return null;
  }

  return (
    <>
      {showCard && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={skip}>
          <div
            className="w-full max-w-md rounded-2xl border border-accent/20 bg-surface p-6 shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-serif text-lg font-bold text-paper">M</div>
              <button onClick={skip} className="text-xs text-ink/40 hover:text-ink">跳过引导</button>
            </div>
            <h3 className="font-serif text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink/60">{step.desc}</p>
            <div className="mt-5 flex items-center justify-between">
              <div className="flex gap-1">
                {STEPS.map((s, i) => (
                  <span key={s.key} className={'h-1.5 rounded-full transition-all ' + (i <= STEPS.findIndex((x) => x.key === step.key) ? 'w-6 bg-accent' : 'w-1.5 bg-ink/15')} />
                ))}
              </div>
              <button
                onClick={goNext}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-paper transition hover:bg-accent/90"
              >
                {step.actionLabel}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-ink/35">
              完成这一步后会自动进入下一步；随时可跳过，有问题可在右下角找 Muse 助手帮忙。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
