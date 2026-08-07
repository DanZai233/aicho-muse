import { useEffect, useRef, useState, useCallback } from 'react';
import { marked } from 'marked';
import { Button } from './ui';

marked.setOptions({ breaks: true, gfm: true });

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  placeholder?: string;
  fontSize?: 'md' | 'lg';
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

export default function MarkdownEditor({ value, onChange, onSave, placeholder, fontSize = 'lg' }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const lastRef = useRef(value);
  const saveTimer = useRef<any>(null);

  // 自动保存（防抖 1.2s）
  useEffect(() => {
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSave();
      setSaveState('saved');
    }, 1200);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink/5 bg-white/70 px-3 py-1.5">
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
            {saveState === 'saved' ? '已保存 ✓' : '保存中…'}
          </span>
          <div className="flex rounded-lg bg-ink/5 p-0.5 text-xs">
            <button onClick={() => setMode('edit')} className={`rounded-md px-2.5 py-1 transition ${mode === 'edit' ? 'bg-white text-ink shadow-sm' : 'text-ink/50'}`}>编辑</button>
            <button onClick={() => setMode('preview')} className={`rounded-md px-2.5 py-1 transition ${mode === 'preview' ? 'bg-white text-ink shadow-sm' : 'text-ink/50'}`}>预览</button>
          </div>
        </div>
      </div>

      {/* 编辑区 */}
      {mode === 'edit' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder || '在这里写下你的故事…（支持 Markdown）'}
          spellCheck={false}
          className={`font-creative flex-1 resize-none bg-transparent px-6 py-4 leading-8 outline-none ${fontSize === 'lg' ? 'text-base' : 'text-sm'}`}
        />
      ) : (
        <div
          className="md-preview font-creative flex-1 overflow-y-auto bg-white/30 px-6 py-4 text-base leading-8"
          dangerouslySetInnerHTML={{ __html: html() }}
        />
      )}
    </div>
  );
}
