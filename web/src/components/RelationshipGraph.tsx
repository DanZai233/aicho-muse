import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Badge } from './ui';

type GNode = { id: string; name: string; role: string; description: string; arc: string; x: number; y: number };
type GEdge = { id: string; source: string; sourceName: string; target: string; targetName: string; type: string; note?: string };
type Cand = { source: string; target: string; type: string; note?: string };

const PALETTE = ['#e05a6e', '#4a90d9', '#2f9e7a', '#c08a2d', '#8e6cc8', '#d96b3b', '#3aa6b8', '#b84a9c'];
function colorFor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }

const REL_TYPES = ['恋人', '挚友', '师徒', '家人', '敌对', '同事', '对手', '暗恋', '恩人', '认识'];

function buildGraph(cards: any[]): { nodes: GNode[]; edges: GEdge[] } {
  const nameToId = new Map(cards.map(c => [c.name || '', c.id]));
  const idToName = new Map(cards.map(c => [c.id, c.name || '未命名人物']));
  const nodes: GNode[] = cards.map(c => ({ id: c.id, name: c.name || '未命名人物', role: c.role || '配角', description: c.description || '', arc: c.arc || '', x: 0, y: 0 }));
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    for (const r of (Array.isArray(c.relationships) ? c.relationships : [])) {
      const rel = r && typeof r === 'object' ? r : { target: r };
      const targetName = String(rel.target || rel.name || '').trim();
      if (!targetName) continue;
      // target 可能是角色名或角色 ID，两种都解析
      let targetId = nameToId.get(targetName);
      if (!targetId && idToName.has(targetName)) targetId = targetName;
      if (!targetId || targetId === c.id) continue;
      const type = String(rel.type || rel.label || rel.relation || '').trim() || '认识';
      const key = c.id + '|' + targetId + '|' + type;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: c.id.slice(0, 6) + '-' + targetId.slice(0, 6) + '-' + type, source: c.id, sourceName: c.name, target: targetId, targetName, type, note: String(rel.note || '').trim() });
    }
  }
  return { nodes, edges };
}

function layout(nodes: GNode[], edges: GEdge[]): GNode[] {
  const W = 800, H = 460;
  const N = nodes.length;
  const pos = nodes.map((n, i) => {
    const ang = (2 * Math.PI * i) / Math.max(1, N) - Math.PI / 2;
    return { x: W / 2 + Math.cos(ang) * 150, y: H / 2 + Math.sin(ang) * 140, vx: 0, vy: 0 };
  });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  for (let iter = 0; iter < 180; iter++) {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 16) { dx += (Math.random() - 0.5) * 8; dy += (Math.random() - 0.5) * 8; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const f = 16000 / d2;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      pos[i].vx += fx; pos[i].vy += fy; pos[j].vx -= fx; pos[j].vy -= fy;
    }
    for (const e of edges) {
      const ai = idx.get(e.source), bi = idx.get(e.target);
      if (ai === undefined || bi === undefined) continue;
      const a = pos[ai], b = pos[bi];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 170) * 0.04;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (let i = 0; i < N; i++) {
      pos[i].vx += (W / 2 - pos[i].x) * 0.004;
      pos[i].vy += (H / 2 - pos[i].y) * 0.004;
      pos[i].vx *= 0.82; pos[i].vy *= 0.82;
      pos[i].x += pos[i].vx; pos[i].y += pos[i].vy;
      pos[i].x = Math.max(34, Math.min(W - 34, pos[i].x));
      pos[i].y = Math.max(34, Math.min(H - 34, pos[i].y));
    }
  }
  return nodes.map((n, i) => ({ ...n, x: pos[i].x, y: pos[i].y }));
}

export default function RelationshipGraph({ projectId, characters, onChanged }: { projectId: string; characters: any[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('认识');
  const [relNote, setRelNote] = useState('');

  const { nodes, edges } = useMemo(() => {
    const g = buildGraph(characters);
    return { nodes: layout(g.nodes, g.edges), edges: g.edges };
  }, [characters]);
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const selected = selectedId ? (nodeMap.get(selectedId) || null) : null;

  const genAI = async () => {
    setBusy(true); setErr('');
    try {
      const d = await api.post<{ edges: Cand[] }>('/projects/' + projectId + '/relationship-graph/generate', {});
      setCands(d.edges || []);
      setPicked(new Set((d.edges || []).map((_, i) => i)));
    } catch (e: any) { setErr(e.message || '生成失败'); }
    finally { setBusy(false); }
  };

  const applyCands = async () => {
    if (!cands) return;
    setBusy(true); setErr('');
    try {
      const sel = cands.filter((_, i) => picked.has(i));
      if (sel.length) await api.post('/projects/' + projectId + '/relationship-graph/apply', { edges: sel });
      setCands(null);
      onChanged();
    } catch (e: any) { setErr(e.message || '应用失败'); }
    finally { setBusy(false); }
  };

  const addRelation = async () => {
    if (!selected || !relTarget) return;
    setBusy(true); setErr('');
    try {
      await api.post('/projects/' + projectId + '/relationship-graph/apply', { edges: [{ source: selected.name, target: relTarget, type: relType, note: relNote }] });
      setRelNote('');
      onChanged();
    } catch (e: any) { setErr(e.message || '添加失败'); }
    finally { setBusy(false); }
  };

  const removeRelation = async (e: GEdge) => {
    setBusy(true); setErr('');
    try {
      const src = characters.find(c => c.id === e.source);
      if (src) {
        const next = (Array.isArray(src.relationships) ? src.relationships : []).filter((r: any) => {
          const t = String((r && (r.target || r.name)) || '').trim();
          const ty = String((r && (r.type || r.label || r.relation)) || '').trim() || '认识';
          const matchT = t === e.target || t === e.targetName || t === (nodeMap.get(e.target)?.name || '');
          return !(matchT && ty === e.type);
        });
        await api.patch('/characters/' + e.source, { relationships: next });
      }
      onChanged();
    } catch (ex: any) { setErr(ex.message || '删除失败'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-xl border border-ink/10 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-ink/40">角色关系图</p>
        <button onClick={genAI} disabled={busy || characters.length < 2} className="text-xs text-accent hover:underline disabled:opacity-40">✨ AI 生成关系</button>
      </div>
      {err && <p className="mb-2 text-xs text-red-500">{err}</p>}
      {characters.length < 2 && <p className="px-2 py-4 text-center text-xs text-ink/30">添加至少两位角色后，即可在这里查看和生成人物关系图</p>}
      {nodes.length >= 2 && (
        <svg viewBox="0 0 800 460" className="h-auto w-full rounded-lg bg-surface/70">
          {edges.map(e => {
            const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const c = colorFor(e.type);
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c} strokeWidth="1.5" opacity="0.5" />
                <rect x={mx - e.type.length * 6 - 5} y={my - 12} width={e.type.length * 12 + 10} height="16" rx="8" fill="#fff" opacity="0.9" />
                <text x={mx} y={my} textAnchor="middle" fontSize="11" fill={c} fontWeight="600">{e.type}</text>
              </g>
            );
          })}
          {nodes.map(n => (
            <g key={n.id} onClick={() => setSelectedId(selectedId === n.id ? null : n.id)} className="cursor-pointer">
              <circle cx={n.x} cy={n.y} r={26} fill={colorFor(n.name)} opacity={selectedId === n.id ? 1 : 0.88} stroke="#fff" strokeWidth="2.5" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="600">{n.name.slice(0, 4)}</text>
            </g>
          ))}
        </svg>
      )}
      {selected && (
        <div className="mt-2 rounded-xl bg-paper/60 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-semibold">{selected.name}</span>
              <Badge color="accent">{selected.role}</Badge>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-xs text-ink/30 hover:text-ink">收起 ✕</button>
          </div>
          {selected.description && <p className="mt-1 text-xs leading-5 text-ink/50">{selected.description}</p>}
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium text-ink/50">已有关系：</p>
            {edges.filter(e => e.source === selected.id || e.target === selected.id).length === 0 && <p className="text-xs text-ink/30">暂无关系，从下方添加</p>}
            {edges.filter(e => e.source === selected.id || e.target === selected.id).map(e => {
              const other = e.source === selected.id ? e.targetName : e.sourceName;
              return (
                <div key={e.id} className="mb-1 flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-xs">
                  <span><b>{selected.name}</b> — {e.type} — <b>{other}</b>{e.note ? <span className="text-ink/40">（{e.note}）</span> : null}</span>
                  <button onClick={() => removeRelation(e)} disabled={busy} className="text-red-400 hover:text-red-600 disabled:opacity-40">✕</button>
                </div>
              );
            })}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <select value={relTarget} onChange={ev => setRelTarget(ev.target.value)} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-xs outline-none">
                <option value="">选择角色…</option>
                {nodes.filter(n => n.id !== selected.id).map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
              </select>
              <select value={relType} onChange={ev => setRelType(ev.target.value)} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-xs outline-none">
                {REL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={relNote} onChange={ev => setRelNote(ev.target.value)} placeholder="备注（可选）" className="w-28 rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-xs outline-none" />
              <Button variant="subtle" onClick={addRelation} disabled={busy || !relTarget} className="px-3 py-1.5 text-xs">＋ 添加关系</Button>
            </div>
          </div>
        </div>
      )}
      {cands && (
        <div className="mt-2 rounded-xl border border-accent/20 bg-accentlight/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-ink/60">✨ AI 发现 {cands.length} 条候选关系，勾选后应用到人物卡</p>
            <div className="flex items-center gap-2">
              <Button variant="subtle" onClick={applyCands} disabled={busy} className="px-3 py-1.5 text-xs">应用到人物卡</Button>
              <button onClick={() => setCands(null)} className="text-xs text-ink/40 hover:text-ink">取消</button>
            </div>
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {cands.map((c, i) => (
              <label key={i} className="flex items-start gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs">
                <input type="checkbox" checked={picked.has(i)} onChange={() => { const n = new Set(picked); if (n.has(i)) n.delete(i); else n.add(i); setPicked(n); }} className="mt-0.5 accent-accent" />
                <span><b>{c.source}</b> — {c.type} — <b>{c.target}</b>{c.note ? <span className="text-ink/40">（{c.note}）</span> : null}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
