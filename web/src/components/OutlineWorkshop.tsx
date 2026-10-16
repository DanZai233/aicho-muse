import { useState } from 'react';
import { api, type Project, type WritingBrief, type Chapter } from '../lib/api';
import { Button, Input, Modal } from './ui';

type PlanNode = { title: string; summary: string };
export type OutlineSource = { id: string; title: string; summary: string };
export function OutlinePlanner({ project, onClose, onAdopted }: { project: Project; onClose: () => void; onAdopted: () => void }) {
  const [brief, setBrief] = useState<WritingBrief>(project.writing_brief || { purpose: project.theme || '', audience: project.target_audience || '', style: '', coverage: '', constraints: '' });
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [plan, setPlan] = useState<{ nodes: PlanNode[]; plan_id: string; brief: WritingBrief } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [stage, setStage] = useState<'interview' | 'preview'>('interview');
  const fields: { key: keyof WritingBrief; label: string; placeholder: string }[] = [
    { key: 'purpose', label: '1. 这本书想讲什么，帮读者解决什么问题？', placeholder: '例如：让低精力的人在城市里把日子过得轻松一点，不逼自己变成自律达人。' },
    { key: 'audience', label: '2. 你想写给谁？他们的生活是什么样的？', placeholder: '例如：独居、预算有限、下班只想躺着的年轻人。' },
    { key: 'style', label: '3. 想用什么口吻和形式写？', placeholder: '例如：温柔幽默，像朋友说话；每节有场景、实用步骤和小清单。' },
    { key: 'coverage', label: '4. 一定要写哪些内容？（可选）', placeholder: '例如：租房、吃饭、通勤、工作边界、社交、低成本快乐；每章有电量 10% 版本。' },
    { key: 'constraints', label: '5. 有哪些不想写的内容或需要注意的边界？（可选）', placeholder: '例如：不说教，不鼓吹消费，不虚构专业研究，不把健康问题简单归结为心态。' },
  ];
  async function generate() {
    setBusy(true); setError('');
    try {
      const d = await api.post<{ nodes: PlanNode[]; plan_id: string; brief: WritingBrief }>('/projects/' + project.id + '/outline-plan', { ...brief, chapter_count: count });
      setPlan(d); setSelected(d.nodes.map((_, i) => i)); setStage('preview');
    } catch (e: any) { setError(e.message || '生成失败，填写内容已保留'); }
    finally { setBusy(false); }
  }
  async function adopt() {
    if (!plan) return;
    setBusy(true); setError('');
    try {
      await api.post('/projects/' + project.id + '/outline-plan/adopt', { ...plan, nodes: plan.nodes.filter((_, i) => selected.includes(i)) });
      onAdopted(); onClose();
    } catch (e: any) { setError(e.message || '保存失败，请重试'); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="先聊方向，再生成详细大纲">
    <div className="space-y-4">
      {stage === 'interview' ? <>
        <p className="text-sm text-ink/55">先回答几个问题，让大纲贴近你真正想写的书。生成后可以修改、挑选，再加入作品。</p>
        {fields.map(f => <Input disabled={busy} key={f.key} label={f.label} value={brief[f.key]} onChange={v => setBrief(b => ({ ...b, [f.key]: v }))} textarea rows={2} placeholder={f.placeholder} />)}
        <label className="block text-sm">希望规划几章？<select disabled={busy} aria-label="大纲章节数量" className="ml-3 rounded-lg bg-paper px-3 py-2" value={count} onChange={e => setCount(Number(e.target.value))}>{[6, 8, 10, 12, 16, 20].map(n => <option key={n} value={n}>{n} 章</option>)}</select></label>
        <Button onClick={generate} disabled={busy || !brief.purpose.trim() || !brief.audience.trim() || !brief.style.trim()}>{busy ? '正在构思详细大纲…' : '按这些想法生成大纲'}</Button>
      </> : plan && <>
        <p className="text-sm text-ink/55">每章包含目标、小节、例子与写作要点。可直接修改下方内容；选中的章节会追加到大纲中。</p>
        {plan.nodes.map((n, i) => <div key={i} className="space-y-2 rounded-xl border border-ink/10 p-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(i)} onChange={e => setSelected(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))} />第 {i + 1} 章</label>
          <Input disabled={busy} label="章节标题" value={n.title} onChange={v => setPlan(p => p && ({ ...p, nodes: p.nodes.map((x, j) => j === i ? { ...x, title: v } : x) }))} />
          <Input disabled={busy} label="详细大纲" value={n.summary} onChange={v => setPlan(p => p && ({ ...p, nodes: p.nodes.map((x, j) => j === i ? { ...x, summary: v } : x) }))} textarea rows={8} />
        </div>)}
        <div className="flex gap-2"><Button onClick={adopt} disabled={busy || !selected.length}>{busy ? '保存中…' : `添加选中的 ${selected.length} 章大纲`}</Button><Button variant="ghost" disabled={busy} onClick={() => setStage('interview')}>调整想法 / 重新生成</Button></div>
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  </Modal>;
}

export function OutlineDraft({ node, onClose, onAdopted }: { node: OutlineSource; onClose: () => void; onAdopted: (chapter: Chapter) => void }) {
  const [words, setWords] = useState(1200), [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<{ content: string; source: { title: string; summary: string }; draft_id: string } | null>(null);
  async function generate() {
    setBusy(true); setError('');
    try { setDraft(await api.post('/outline/' + node.id + '/draft', { word_count: words, instructions })); }
    catch (e: any) { setError(e.message || '生成失败'); }
    finally { setBusy(false); }
  }
  async function adopt() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const d = await api.post<{ chapter: Chapter }>('/outline/' + node.id + '/draft/adopt', draft);
      onAdopted(d.chapter); onClose();
    } catch (e: any) { setError(e.message || '保存失败，预览已保留'); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={'按大纲写正文 · ' + node.title}>
    <div className="space-y-4">
      <details><summary className="cursor-pointer text-sm text-accent">查看本章大纲</summary><p className="mt-2 whitespace-pre-wrap text-sm text-ink/65">{node.summary}</p></details>
      <p className="text-xs text-ink/50">会结合全书大纲、写作约定、人物设定与前章结尾生成草稿。先预览，再保存为独立新章节。</p>
      <label className="block text-sm">本章目标字数<select disabled={busy} aria-label="正文目标字数" value={words} onChange={e => setWords(Number(e.target.value))} className="ml-3 rounded-lg bg-paper px-3 py-2">{[600, 1200, 2000, 3000, 4000].map(n => <option key={n} value={n}>约 {n} 字</option>)}</select></label>
      <Input disabled={busy} label="这章还有什么要求？（可选）" value={instructions} onChange={setInstructions} textarea rows={3} placeholder="例如：从一个下班后的场景开始，给出花钱少、不用开火的吃饭方案。" />
      <Button onClick={generate} disabled={busy}>{busy ? '处理中…' : draft ? '重新生成正文' : '生成本章正文'}</Button>
      {draft && <><Input disabled={busy} label="正文预览（可修改）" textarea rows={18} value={draft.content} onChange={content => setDraft(d => d && ({ ...d, content }))} /><Button onClick={adopt} disabled={busy || !draft.content.trim()}>保存为新章节并打开</Button></>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  </Modal>;
}
