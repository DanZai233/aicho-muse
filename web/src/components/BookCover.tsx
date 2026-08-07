import { Project } from '../lib/api';

const GENRE_LABEL: Record<string, string> = { biography: '自传', fiction: '小说', prose: '散文', poetry: '诗歌', script: '剧本' };

export function coverGradient(color: string) {
  const c = color || '#8b7d6b';
  return 'linear-gradient(150deg, ' + c + ' 0%, ' + c + 'cc 52%, ' + c + '99 100%)';
}

export default function BookCover({ project, size = 'md', className = '', showMeta = true }: {
  project: Project; size?: 'sm' | 'md' | 'lg'; className?: string; showMeta?: boolean;
}) {
  const ratio = size === 'sm' ? 'aspect-[3/4] w-14' : size === 'lg' ? 'aspect-[3/4] w-56' : 'aspect-[3/4] w-28';
  const titleCls = size === 'sm' ? 'text-[10px] leading-tight' : size === 'lg' ? 'text-2xl' : 'text-sm';
  const subCls = size === 'sm' ? 'text-[8px]' : size === 'lg' ? 'text-base' : 'text-[11px]';
  const metaCls = size === 'sm' ? 'text-[8px]' : size === 'lg' ? 'text-sm' : 'text-[10px]';
  const spine = size === 'sm' ? 'left-0.5 top-0.5 rounded-[3px]' : 'left-1 top-1 rounded-md';
  const words = project.word_count ?? 0;
  const chapters = project.chapter_count ?? 0;
  const progress = Math.min(100, Math.round((words / Math.max(project.goal_word_count || 20000, 20000)) * 100));

  return (
    <div className={'group relative shrink-0 ' + ratio + ' ' + className}>
      <div className={'absolute ' + spine + ' z-10 h-[calc(100%-6px)] w-[5px] bg-black/20'} />
      <div
        className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-lg rounded-l-[3px] p-2.5 text-paper shadow-lift transition group-hover:shadow-xl sm:p-3"
        style={{ background: coverGradient(project.cover_color) }}
      >
        <div className="absolute inset-0 opacity-25" style={{ background: 'radial-gradient(circle at 22% 18%, rgba(255,255,255,.7), transparent 55%), radial-gradient(circle at 80% 85%, rgba(0,0,0,.35), transparent 50%)' }} />
        <div className="relative flex items-center justify-between">
          <span className={'font-medium tracking-[0.2em] ' + metaCls + ' opacity-80'}>{GENRE_LABEL[project.genre] || project.genre}</span>
          {showMeta && words > 0 && <span className={metaCls + ' opacity-80'}>{words} 字</span>}
        </div>
        <div className="relative">
          <div className={'font-serif font-semibold ' + titleCls}>{project.title || '未命名作品'}</div>
          {project.subtitle && <div className={'mt-1 font-creative opacity-85 ' + subCls}>{project.subtitle}</div>}
        </div>
        <div className="relative space-y-1.5">
          {showMeta && (words > 0 || chapters > 0) && (
            <div className={'flex items-center gap-1.5 ' + metaCls + ' opacity-90'}>
              <span>{chapters} 章</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <span className="block h-full rounded-full bg-white/85" style={{ width: progress + '%' }} />
              </span>
            </div>
          )}
          {project.author_name && <div className={metaCls + ' opacity-75'}>{project.author_name} 著</div>}
        </div>
      </div>
    </div>
  );
}
