import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ShareInfo } from '../../lib/api';
import { readReaderSettings, readReadingPosition, saveReaderValue } from '../../lib/reader';
import { useBookPagination } from '../../lib/useBookPagination';
import MarkdownPreview from '../MarkdownPreview';
import ReaderSettings from './ReaderSettings';
import './reader.css';

export default function BookReader({ share, initialChapter, onClose }: { share: ShareInfo; initialChapter: number; onClose: (chapter: number) => void }) {
  const chapters = share.chapters || [];
  const [settings, setSettings] = useState(readReaderSettings);
  const [location, setLocation] = useState(() => {
    const saved = readReadingPosition(share.id, share.version);
    return { chapter: Math.max(0, Math.min(chapters.length - 1, saved?.chapter ?? initialChapter)), offset: saved?.offset || 0 };
  });
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  const [panel, setPanel] = useState<'contents' | 'settings' | null>(null);
  const [immersive, setImmersive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null), closeRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const wheelLock = useRef(0);
  const spread = wide && settings.layout === 'double' ? 2 : 1;
  const chapter = chapters[location.chapter];
  const typographyKey = [settings.fontSize, settings.lineHeight, settings.font, settings.layout].join(':');
  const pagination = useBookPagination(String(location.chapter), spread, typographyKey, location.offset);
  const { page, total, stride, viewportRef, flowRef, goToPage, ready } = pagination;
  const lastPage = Math.min(total, page + spread);
  const atStart = location.chapter === 0 && page === 0;
  const atEnd = location.chapter === chapters.length - 1 && lastPage >= total;
  const next = useCallback(() => {
    if (page + spread < total) goToPage(page + spread);
    else if (location.chapter < chapters.length - 1) setLocation({ chapter: location.chapter + 1, offset: 0 });
  }, [page, spread, total, goToPage, location.chapter, chapters.length]);
  const previous = useCallback(() => {
    if (page > 0) goToPage(page - spread);
    else if (location.chapter > 0) setLocation({ chapter: location.chapter - 1, offset: Number.MAX_SAFE_INTEGER });
  }, [page, spread, goToPage, location.chapter]);
  const exit = useCallback(() => onClose(location.chapter), [onClose, location.chapter]);
  const closePanel = useCallback(() => { setPanel(null); rootRef.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus(); }, []);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const change = () => setWide(query.matches); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => { saveReaderValue('muse:reader-settings', settings); }, [settings]);
  useEffect(() => {
    if (ready) saveReaderValue('muse:reading:' + share.id, { chapter: location.chapter, offset: pagination.getOffset(), version: share.version });
  }, [page, total, ready, location.chapter, share.id, share.version, typographyKey]);
  useLayoutEffect(() => {
    const oldOverflow = document.body.style.overflow, oldFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    // The reader lives in a portal; background controls must not receive keyboard focus.
    const siblings = [...document.body.children].filter(el => el !== rootRef.current && el instanceof HTMLElement) as HTMLElement[];
    const previousState = siblings.map(el => ({ inert: el.hasAttribute('inert'), hidden: el.getAttribute('aria-hidden') }));
    siblings.forEach(el => { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });
    return () => {
      document.body.style.overflow = oldOverflow;
      siblings.forEach((el, i) => { if (!previousState[i].inert) el.removeAttribute('inert'); if (previousState[i].hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', previousState[i].hidden!); });
      oldFocus?.focus();
    };
  }, []);
  useEffect(() => {
    if (panel) panelRef.current?.querySelector<HTMLElement>('button,select,input')?.focus();
  }, [panel]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); if (panel) closePanel(); else exit(); return; }
      if (event.key === 'Tab') {
        const scope = panel ? panelRef.current : rootRef.current;
        const controls = scope ? [...scope.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.tabIndex >= 0 && el.getClientRects().length) : [];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      const target = event.target as HTMLElement;
      if (panel || target.closest('input,select,textarea,a') || event.altKey || event.ctrlKey || event.metaKey || window.getSelection()?.toString()) return;
      // Space on a button activates that button instead of also turning the page.
      if (event.key === ' ' && target.closest('button')) return;
      const nextArrow = settings.direction === 'up' ? 'ArrowDown' : settings.direction === 'right' ? 'ArrowLeft' : 'ArrowRight';
      const prevArrow = settings.direction === 'up' ? 'ArrowUp' : settings.direction === 'right' ? 'ArrowRight' : 'ArrowLeft';
      if (event.key === nextArrow || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) { event.preventDefault(); next(); }
      if (event.key === prevArrow || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) { event.preventDefault(); previous(); }
      if (event.key === 'Home') { event.preventDefault(); goToPage(0); }
      if (event.key === 'End') { event.preventDefault(); goToPage(total - 1); }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [next, previous, exit, settings.direction, panel, goToPage, total, closePanel]);

  useEffect(() => {
    const viewport = viewportRef.current, flow = flowRef.current;
    if (!viewport || !flow) return;
    const bounds = viewport.getBoundingClientRect();
    for (const element of flow.querySelectorAll<HTMLElement>('a,input,button')) {
      const visible = [...element.getClientRects()].some(rect => rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom);
      if (visible) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', '-1');
    }
  }, [page, total, location.chapter, typographyKey, spread]);

  useEffect(() => {
    if (!ready || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame = settings.direction === 'up' ? 'translateY(6px)' : settings.direction === 'right' ? 'translateX(-6px)' : 'translateX(6px)';
    const animation = viewportRef.current?.animate?.([{ opacity: 0.65, transform: frame }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' });
    return () => animation?.cancel();
  }, [page, location.chapter, ready]);

  if (!chapter) return null;
  const nextIcon = settings.direction === 'up' ? '↓' : settings.direction === 'right' ? '←' : '→';
  const previousIcon = settings.direction === 'up' ? '↑' : settings.direction === 'right' ? '→' : '←';
  const style = { '--reader-font-size': settings.fontSize + 'px', '--reader-line-height': settings.lineHeight, '--reader-font': settings.font === 'serif' ? '"Noto Serif SC", "Songti SC", Georgia, serif' : '"Noto Sans SC", "PingFang SC", system-ui, sans-serif' } as CSSProperties;
  return createPortal(<div ref={rootRef} className={'book-reader' + (immersive ? ' book-reader-immersive' : '')} data-theme={settings.theme} data-direction={settings.direction} style={style} role="dialog" aria-modal="true" aria-label={'书本阅读：' + share.title}>
    <header className="book-reader-toolbar">
      <button ref={closeRef} onClick={exit} className="reader-button" title="退出书本阅读（Esc）" aria-label="退出书本阅读">← <span>返回</span></button>
      <div className="reader-book-title"><strong>{share.title}</strong><span>{chapter.title}</span></div>
      <button className="reader-button" onClick={() => setPanel('contents')} aria-expanded={panel === 'contents'}>目录</button>
      <button className="reader-button reader-immersive-toggle" onClick={() => setImmersive(v => !v)} aria-pressed={immersive} title="隐藏书名，减少干扰">{immersive ? '显示书名' : '专注'}</button>
      <button className="reader-button" onClick={() => setPanel('settings')} aria-expanded={panel === 'settings'}>Aa <span>设置</span></button>
    </header>
    <div className="book-stage">
      <div className="book-paper" data-spread={spread}>
        {spread === 2 && <div className="book-gutter" aria-hidden="true" />}
        <div ref={viewportRef} className="book-viewport" tabIndex={0} aria-label="阅读正文，可用方向键或翻页按钮翻页"
          onTouchStart={e => {
            if ((e.target as HTMLElement).closest('a,input,button,pre,table') || e.touches.length !== 1) { touch.current = null; return; }
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }} onTouchEnd={e => {
            const start = touch.current; touch.current = null;
            if (!start || window.getSelection()?.toString()) return;
            const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
            const primary = settings.direction === 'up' ? -dy : settings.direction === 'right' ? dx : -dx;
            const cross = settings.direction === 'up' ? dx : dy;
            if (Math.abs(primary) > 50 && Math.abs(primary) > Math.abs(cross) * 1.3) { if (primary > 0) next(); else previous(); }
          }} onTouchCancel={() => { touch.current = null; }}
          onWheel={e => {
            if (settings.direction !== 'up' || panel || Math.abs(e.deltaY) < 25 || e.ctrlKey || (e.target as HTMLElement).closest('pre,table')) return;
            if (Date.now() - wheelLock.current > 600) { wheelLock.current = Date.now(); if (e.deltaY > 0) next(); else previous(); }
          }}>
          <div ref={flowRef} className="book-flow" style={{ transform: `translateX(${-page * stride}px)` }}>
            <h2 className="book-chapter-heading">{chapter.title}</h2>
            <MarkdownPreview content={chapter.content || '（这一章还是空白，作者把想象留在了这里。）'} />
          </div>
        </div>
      </div>
    </div>
    <footer className="book-reader-footer">
      <div className="book-navigation">
        <button className="reader-button reader-turn" disabled={atStart || !ready} onClick={previous} aria-label="上一页">{previousIcon} 上一页</button>
        <div className="reader-page-info" aria-live="polite"><strong>{ready ? `第 ${page + 1}${lastPage > page + 1 ? '–' + lastPage : ''} / ${total} 页` : '正在排版…'}</strong><span>第 {location.chapter + 1} / {chapters.length} 章{atEnd ? ' · 全书完' : ''}</span></div>
        <button className="reader-button reader-turn" disabled={atEnd || !ready} onClick={next} aria-label="下一页">下一页 {nextIcon}</button>
      </div>
      <label className="reader-progress"><span>本章进度</span><input type="range" min={0} max={Math.max(0, total - 1)} step={spread} value={page} onChange={e => goToPage(Number(e.target.value))} disabled={total <= 1} aria-label="本章阅读进度" /><span>{Math.round(lastPage / total * 100)}%</span></label>
      <p className="reader-gesture-hint">{settings.direction === 'up' ? '上下滑动或 ↑ ↓ 翻页' : settings.direction === 'right' ? '向右滑动读下一页 · ← → 翻页' : '向左滑动读下一页 · ← → 翻页'} · 自动记住进度</p>
    </footer>
    {panel && <div className="reader-panel-backdrop" onClick={closePanel}>
      <div ref={panelRef} className="reader-panel" role="dialog" aria-modal="true" aria-label={panel === 'settings' ? '阅读设置' : '章节目录'} onClick={e => e.stopPropagation()}>
        <div className="reader-panel-heading"><h2>{panel === 'settings' ? '阅读设置' : '章节目录'}</h2><button className="reader-button" aria-label="关闭面板" onClick={closePanel}>✕</button></div>
        {panel === 'settings' ? <ReaderSettings value={settings} onChange={setSettings} compact={!wide} /> : <nav className="reader-contents" aria-label="章节目录">{chapters.map((c, i) => <button key={i} aria-current={i === location.chapter ? 'page' : undefined} onClick={() => { if (i === location.chapter) goToPage(0); else setLocation({ chapter: i, offset: 0 }); setPanel(null); viewportRef.current?.focus(); }}><span className="reader-chapter-number">{String(i + 1).padStart(2, '0')}</span><span>{c.title || '未命名章节'}</span>{i === location.chapter && <span className="reader-current-label">在读</span>}</button>)}</nav>}
      </div>
    </div>}
  </div>, document.body);
}
