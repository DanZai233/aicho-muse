import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { spreadStart } from './reader';

type TextEntry = { node: Text; start: number; length: number };
function textEntries(root: HTMLElement) {
  const entries: TextEntry[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null, length = 0;
  while ((node = walker.nextNode())) {
    const size = node.textContent?.length || 0;
    if (size) { entries.push({ node: node as Text, start: length, length: size }); length += size; }
  }
  return { entries, length };
}
function pageOfOffset(root: HTMLElement, entries: TextEntry[], offset: number, stride: number) {
  let entry = entries.find(e => e.start + e.length > offset) || entries[entries.length - 1];
  if (!entry) return 0;
  // Whitespace-only nodes between blocks may have no rendered rectangle.
  if (!entry.node.textContent?.trim()) entry = entries.find(e => e.start >= entry!.start && e.node.textContent?.trim()) || entry;
  const local = Math.min(entry.length - 1, Math.max(0, offset - entry.start));
  const range = document.createRange(); range.setStart(entry.node, local); range.setEnd(entry.node, local + 1);
  const rect = range.getClientRects()[0];
  return rect ? Math.max(0, Math.floor((rect.left - root.getBoundingClientRect().left + 1) / stride)) : 0;
}
function offsetOfPage(root: HTMLElement, page: number, stride: number) {
  if (page <= 0) return 0;
  const { entries, length } = textEntries(root);
  let lo = 0, hi = Math.max(0, length - 1);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pageOfOffset(root, entries, mid, stride) < page) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// CSS columns paginate real rendered Markdown, including inline formatting and images.
// A text offset anchors the page across font changes, resize and reopening the book.
export function useBookPagination(chapterKey: string, spread: number, typographyKey: string, initialOffset: number) {
  const viewportRef = useRef<HTMLDivElement>(null), flowRef = useRef<HTMLDivElement>(null);
  const anchor = useRef(initialOffset);
  const [layout, setLayout] = useState({ page: 0, total: 1, stride: 0, ready: false });
  const layoutRef = useRef(layout); layoutRef.current = layout;
  useLayoutEffect(() => { anchor.current = initialOffset; }, [chapterKey, initialOffset]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current, flow = flowRef.current;
    if (!viewport || !flow) return;
    let frame = 0, disposed = false;
    function measure() {
      if (disposed || !viewport || !flow || viewport.clientWidth < 1 || viewport.clientHeight < 1) return;
      const gap = spread === 2 ? 64 : 32;
      flow.style.width = viewport.clientWidth + 'px'; flow.style.columnCount = String(spread); flow.style.columnGap = gap + 'px';
      const stride = (viewport.clientWidth - gap * (spread - 1)) / spread + gap;
      const range = document.createRange(); range.selectNodeContents(flow);
      const origin = flow.getBoundingClientRect().left;
      let right = 1;
      for (const rect of range.getClientRects()) right = Math.max(right, rect.right - origin);
      const total = Math.max(1, Math.ceil((Math.min(flow.scrollWidth, right) + gap - 1) / stride));
      const { entries, length } = textEntries(flow);
      const wanted = anchor.current >= length ? total - 1 : pageOfOffset(flow, entries, anchor.current, stride);
      const page = spreadStart(wanted, total, spread);
      setLayout({ page, total, stride, ready: true });
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
    measure();
    const observer = new ResizeObserver(schedule); observer.observe(viewport);
    flow.addEventListener('load', schedule, true);
    document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); flow.removeEventListener('load', schedule, true); };
  }, [chapterKey, spread, typographyKey, initialOffset]);
  const goToPage = useCallback((target: number) => {
    const current = layoutRef.current, flow = flowRef.current;
    const page = spreadStart(target, current.total, spread);
    if (flow) anchor.current = offsetOfPage(flow, page, current.stride);
    setLayout(prev => ({ ...prev, page }));
  }, [spread]);
  return { ...layout, viewportRef, flowRef, goToPage, getOffset: () => anchor.current };
}
