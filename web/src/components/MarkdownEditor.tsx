import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { SaveState } from '../lib/chapterSaves';
import { marked } from 'marked';
import { Button } from './ui';

marked.setOptions({ breaks: true, gfm: true });

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSave: () => Promise<void>;
  saveState: SaveState;
  onConflict: () => void;
  placeholder?: string;
  fontSize?: 'md' | 'lg';
  remoteCursors?: ReactNode;
  // 实时光标：外部注入 textarea 引用（供坐标测量），并在选区/滚动变化时回调（内部已节流）
  taRef?: React.RefObject<HTMLTextAreaElement>;
  onActivity?: (offset: number, selection: { start: number; end: number } | null, scrollTop: number) => void;
};

const TOOLS = [
  { key: 'bold', label: '加粗', icon: 'B', fmt: ['**', '**'] },
  { key: 'italic', label: '斜体', icon: 'I', fmt: ['*', '*'] },
  { key: 'h2', label: '标题', icon: 'H', line: '## ' },
  { key: 'h3', label: '小标题', icon: 'H3', line: '### ' },
  { key: 'ul', label: '无序列表', icon: '•', line: '- ' },
  { key: 'ol', label: '有序列表', icon: '1.', line: '1. ' },
  { key: 'quote', label: '引用', icon: '❝', line: '> ' },
  { key: 'link', label: '链接', icon: '🔗', fmt: ['[', '](https://)'] },
  { key: 'image', label: '图片', icon: '🖼', fmt: ['![', '](https://)'] },
  { key: 'code', label: '代码块', icon: '{}', block: '```\n', blockEnd: '\n```' },
  { key: 'hr', label: '分割线', icon: '—', line: '---\n' },
];

export default function MarkdownEditor({ value, onChange, onSave, saveState, onConflict, placeholder, fontSize = 'lg', remoteCursors, taRef: externalTaRef, onActivity }: Props) {
  const innerTaRef = useRef<HTMLTextAreaElement>(null);
  const taRef = externalTaRef || innerTaRef;
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const lastRef = useRef(value);
  // External refreshes synchronize the baseline without recording a phantom local edit.
  useEffect(() => { lastRef.current = value; }, [value]);

  const handleChange = (v: string) => {
    // 撤销栈
    if (v !== lastRef.current) {
      undoRef.current.push(lastRef.current);
      if (undoRef.current.length > 100) undoRef.current.shift();
      redoRef.current = [];
      lastRef.current = v;
    }
    onChange(v);
  };

  const insertInline = (before: string, after: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || '文本';
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    handleChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  const insertLine = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.slice(lineStart, start);
    const next = value.slice(0, lineStart) + prefix + (line || '') + value.slice(start);
    handleChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); });
  };

  const insertBlock = (before: string, after: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || '代码';
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    handleChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + sel.length); });
  };

  const runTool = (t: (typeof TOOLS)[number]) => {
    if (t.fmt) insertInline(t.fmt[0], t.fmt[1]);
    else if (t.line) insertLine(t.line);
    else if (t.block) insertBlock(t.block!, t.blockEnd!);
  };

  const undo = () => {
    if (!undoRef.current.length) return;
    redoRef.current.push(value);
    const prev = undoRef.current.pop()!;
    lastRef.current = prev;
    onChange(prev);
  };
  const redo = () => {
    if (!redoRef.current.length) return;
    undoRef.current.push(value);
    const next = redoRef.current.pop()!;
    lastRef.current = next;
    onChange(next);
  };

  const html = useCallback(() => marked.parse(value || '') as string, [value]);

  // 光标活动上报：编辑、点击、键盘、滚动
  const reportActivity = useCallback(() => {
    const ta = taRef.current;
    if (!ta || !onActivity) return;
    const selection = ta.selectionStart !== ta.selectionEnd
      ? { start: ta.selectionStart, end: ta.selectionEnd }
      : null;
    onActivity(ta.selectionStart, selection, ta.scrollTop);
  }, [onActivity, taRef]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink/5 bg-surface/70 px-3 py-1.5">
        {TOOLS.map(t => (
          <button key={t.key} title={t.label} onMouseDown={e => e.preventDefault()} onClick={() => runTool(t)}
            className="flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm text-ink/60 transition hover:bg-accentlight/70 hover:text-ink">
            <span className="font-serif font-semibold">{t.icon}</span>
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-ink/10" />
        <button title="撤销" onMouseDown={e => e.preventDefault()} onClick={undo}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-ink/60 hover:bg-accentlight/70 hover:text-ink">↶</button>
        <button title="重做" onMouseDown={e => e.preventDefault()} onClick={redo}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-ink/60 hover:bg-accentlight/70 hover:text-ink">↷</button>
        <div className="ml-auto flex items-center gap-1">
          <span className={`mr-2 text-xs ${saveState === 'saved' ? 'text-ink/35' : 'text-amber-600'}`}>
            {saveState === 'saved' ? '已保存 ✓' : saveState === 'saving' ? '保存中…' : saveState === 'conflict' ? '保存冲突 · 本地草稿已保留' : '保存失败 · 本地草稿已保留'}
          </span>
          {saveState === 'conflict' ? <button onClick={onConflict} className="text-xs text-accent">核对冲突</button> : null}
          {saveState === 'error' ? <button onClick={() => onSave().catch(() => {})} className="text-xs text-accent">重试保存</button> : null}
          <div className="flex rounded-lg bg-ink/5 p-0.5 text-xs">
            <button onClick={() => setMode('edit')} className={`rounded-md px-2.5 py-1 transition ${mode === 'edit' ? 'bg-surface text-ink shadow-sm' : 'text-ink/50'}`}>编辑</button>
            <button onClick={() => setMode('preview')} className={`rounded-md px-2.5 py-1 transition ${mode === 'preview' ? 'bg-surface text-ink shadow-sm' : 'text-ink/50'}`}>预览</button>
          </div>
        </div>
      </div>

      {/* 编辑区 */}
      {mode === 'edit' ? (
        <div className="relative min-h-0 flex-1">
          <textarea
            ref={taRef}
            value={value}
            onChange={e => { handleChange(e.target.value); requestAnimationFrame(reportActivity); }}
            onKeyUp={reportActivity}
            onClick={reportActivity}
            onSelect={reportActivity}
            onScroll={reportActivity}
            placeholder={placeholder || '在这里写下你的故事…（支持 Markdown）'}
            spellCheck={false}
            className={`font-creative h-full w-full resize-none bg-transparent px-6 py-4 leading-8 outline-none ${fontSize === 'lg' ? 'text-base' : 'text-sm'}`}
          />
          {remoteCursors}
        </div>
      ) : (
        <div
          className="md-preview font-creative flex-1 overflow-y-auto bg-surface/30 px-6 py-4 text-base leading-8"
          dangerouslySetInnerHTML={{ __html: html() }}
        />
      )}
    </div>
  );
}
