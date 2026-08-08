// 文本光标坐标计算（mirror-div 技术）
// 输入：textarea DOM、文本中偏移量（offset）
// 输出：相对于 textarea 内容区左上角的 { x, y }（含滚动偏移校正）
// 远程协作者仅上报 offset，由本地文档渲染坐标，因此不依赖真实 DOM 事件

let mirror: HTMLPreElement | null = null;
let mirrorStyle: CSSStyleDeclaration | null = null;

function getMirror() {
  if (mirror) return mirror;
  mirror = document.createElement('pre');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'white-space:pre-wrap',
    'word-wrap:break-word',
    'overflow-wrap:break-word',
    'pointer-events:none',
    'z-index:-1',
    'margin:0',
  ].join(';');
  document.body.appendChild(mirror);
  mirrorStyle = mirror.style as unknown as CSSStyleDeclaration;
  return mirror;
}

function syncStyle(ta: HTMLTextAreaElement) {
  const m = getMirror();
  const cs = window.getComputedStyle(ta);
  // 复制影响文本排版的样式
  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'textTransform', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'width',
  ];
  if (!mirrorStyle) return;
  for (const p of props) {
    (mirrorStyle as any)[p] = cs.getPropertyValue(p) || (cs as any)[p];
  }
  mirrorStyle.width = cs.boxSizing === 'border-box'
    ? `calc(${cs.width} - ${cs.paddingLeft} - ${cs.paddingRight} - ${cs.borderLeftWidth} - ${cs.borderRightWidth})`
    : cs.width;
}

// 把文本 offset 映射到 mirror 里的字符位置：统一用 'x' 占位（保持行数/折行）
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type CaretPos = { x: number; y: number; height: number };

export function measureCaret(ta: HTMLTextAreaElement, offset: number): CaretPos {
  syncStyle(ta);
  const m = getMirror();
  const text = ta.value || '';
  const before = text.slice(0, Math.max(0, offset));
  const lineEnd = before.lastIndexOf('\n');
  const lineStart = lineEnd + 1;
  // 仅保留光标所在行之前的内容 + 当前行，避免过大的 mirror 拖慢
  const prefix = before.slice(0, lineStart);
  const line = before.slice(lineStart);
  // mirror 内容：前文 + 当前行 + 标记字符
  m.innerHTML = escapeHtml(prefix)
    + (line ? '' : '<br>')
    + `<span id="caret-marker">${escapeHtml(line) || ''}<span style="display:inline-block;width:0;height:1em"></span></span>`;

  const marker = m.querySelector('#caret-marker') as HTMLElement | null;
  const rect = ta.getBoundingClientRect();
  // 让 mirror 精确覆盖在 textarea 上方（fixed 定位，视口坐标），
  // 这样 marker.offsetLeft/Top 就是相对 textarea 内容区的坐标，
  // 不再需要视口差值换算（旧实现把 mirror 留在 body 底部，减出了负坐标）。
  m.style.left = rect.left + 'px';
  m.style.top = rect.top + 'px';

  const lineHeight = parseFloat(mirrorStyle?.lineHeight || '0');
  const height = (lineHeight && !isNaN(lineHeight)) ? lineHeight : parseFloat(mirrorStyle?.fontSize || '16') * 1.5;

  const x = marker?.offsetLeft || 0;
  // 内容区坐标：marker.offsetTop 已含 paddingTop；再减去 textarea 的滚动偏移
  let y = (marker?.offsetTop || 0) + (line ? 0 : lineHeight * 0.85) - ta.scrollTop;

  return { x, y, height };
}
