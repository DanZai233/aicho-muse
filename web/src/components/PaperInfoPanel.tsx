import { useState } from 'react';
import { api, Project, CITATION_STYLE_LABEL } from '../lib/api';
import { Button, Input } from './ui';

export default function PaperInfoPanel({ project, onSaved }: {
  project: Project;
  onSaved: (p: Project) => void;
}) {
  const [abstract, setAbstract] = useState(project.abstract || '');
  const [keywords, setKeywords] = useState((project.keywords || []).join('、'));
  const [style, setStyle] = useState(project.citation_style || 'gb7714');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const d = await api.patch<{ project: Project }>('/projects/' + project.id, {
        abstract,
        keywords: keywords.split(/[,，;；]/).map(s => s.trim()).filter(Boolean),
        citation_style: style,
      });
      onSaved(d.project);
      setMsg('已保存 ✓');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) { setMsg(e.message || '保存失败'); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-b border-ink/10 bg-surface/50 px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input label="论文摘要（Abstract）" value={abstract} onChange={setAbstract} textarea rows={2} placeholder="研究背景、问题、方法、主要结论…" />
          </div>
          <div className="min-w-40 flex-1">
            <Input label="关键词（逗号分隔）" value={keywords} onChange={setKeywords} placeholder="例如：机器学习, 创作助手" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">引用格式</span>
            <select value={style} onChange={e => setStyle(e.target.value as 'gb7714' | 'apa' | 'mla')}
              className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none">
              {Object.entries(CITATION_STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <Button variant="subtle" onClick={save} disabled={busy} className="text-xs">{busy ? '保存中…' : '保存论文信息'}</Button>
        </div>
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        <p className="text-[11px] leading-4 text-ink/40">
          论文模式下，助手会按学术规范给你反馈：论证主线、章节结构（引言→文献综述→方法→结果→讨论→结论）、引用标注 [1] 与文末参考文献。
        </p>
      </div>
    </div>
  );
}
