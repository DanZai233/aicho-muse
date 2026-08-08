// 品牌落地页：未登录用户访问 / 时展示
// 已登录用户由 App 路由直接跳到工作台
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

const FEATURES = [
  { icon: '🎙', title: '语音口述创作', desc: '想到什么说什么，语音转文字，AI 帮你把碎片变成段落。' },
  { icon: '🧑‍🎨', title: '自定义人设伙伴', desc: '性格、说话风格、声线全部可调，也可从官方预设里挑一位。' },
  { icon: '✍️', title: '专属写作 Agent', desc: '提问引导、续写润色、段落生成，AI 建议可选择性采纳。' },
  { icon: '📖', title: '一本书从封面长出来', desc: '作品结构、章节、大纲、人物、时间线，完整创作工作台。' },
];

const PERSONA_PREVIEW = ['芙宁娜', '萧逸', '李泽言', '纳西妲', '胡桃', '爱莉希雅', '陆沉', '钟离'];

export default function Brand() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-paper">M</div>
            <span className="font-serif text-lg font-semibold tracking-wide">缪斯 Muse</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-lg px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/5 hover:text-ink">登录</Link>
            <Link to="/shares" className="rounded-lg px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/5 hover:text-ink">拾卷</Link>
            <Link to="/login" className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-paper transition hover:bg-accent/90">免费开始</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent font-serif text-3xl font-bold text-paper shadow-lift">M</div>
          <h1 className="mx-auto max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            让缪斯陪你把灵感
            <span className="text-accent">写成作品</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ink/55">
            自传、小说、散文、诗歌……用语音或文字口述，专属 AI 创作伙伴提问、引导、续写，陪你一本书一本书地长出来。
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/login"><Button className="px-8 py-2.5 text-base">开始创作 ✨</Button></Link>
            <Link to="/login"><Button variant="subtle" className="px-6 py-2.5 text-base">登录</Button></Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-ink/35">官方创作伙伴 ·</span>
            {PERSONA_PREVIEW.map(n => (
              <span key={n} className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/55">{n}</span>
            ))}
            <span className="text-xs text-ink/35">等 20+ 位</span>
          </div>
        </div>
      </section>

      {/* 功能 */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border border-ink/5 bg-surface p-5 shadow-soft">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-serif text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-ink/50">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 创作流程 */}
      <section className="border-t border-ink/5 bg-accentlight/20">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center font-serif text-2xl font-semibold">一本书，是这样长出来的</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[
              ['① 口述灵感', '把心里那个画面、那段回忆，用语音或文字说出来。'],
              ['② 缪斯引导', '创作 Agent 提问、鼓励、给建议，帮你把碎片理成方向。'],
              ['③ 续写润色', '随时让 AI 续写一段、润色一段，建议以 diff 形式展示，你来决定是否采纳。'],
              ['④ 成书', '章节、大纲、人物、时间线完整沉淀，导出成文稿。'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-surface/80 p-5">
                <p className="font-serif text-sm font-semibold">{t}</p>
                <p className="mt-1.5 text-xs leading-5 text-ink/50">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="font-serif text-2xl font-semibold">你的故事，值得被认真听见</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink/50">免费开始，无需信用卡。今天就把第一句话写下来。</p>
        <Link to="/login"><Button className="mt-6 px-8 py-2.5 text-base">开始创作 ✨</Button></Link>
        <p className="mt-6 text-xs text-ink/30">Muse · imuse.chat</p>
      </section>
    </div>
  );
}
