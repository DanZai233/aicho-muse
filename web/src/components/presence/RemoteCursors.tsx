// 远端光标叠加层：渲染在编辑器外层 relative 容器内
// 坐标由 carets 计算（基于远端 offset + 本地文档），随本地滚动/编辑自动重算
import { useMemo } from 'react';
import { type CursorPayload, type RemoteUser } from '../../lib/presence';

export type RemoteCursor = {
  memberId: string;
  user: RemoteUser;
  cursor: CursorPayload;
};

const PALETTE = ['#e05a6e', '#4a90d9', '#2f9e7a', '#c08a2d', '#8e6cc8', '#d96b3b', '#3aa6b8', '#b84a9c'];

export function colorForMember(memberId: string) {
  let h = 0;
  for (let i = 0; i < memberId.length; i++) h = (h * 31 + memberId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type Props = {
  cursors: RemoteCursor[];
  measure: (memberId: string) => { x: number; y: number; height: number } | null;
};

export default function RemoteCursors({ cursors, measure }: Props) {
  const items = useMemo(
    () =>
      cursors
        .map(c => ({ c, pos: measure(c.memberId) }))
        .filter((x): x is { c: RemoteCursor; pos: { x: number; y: number; height: number } } => !!x.pos),
    [cursors, measure],
  );

  return (
    <>
      {items.map(({ c, pos }) => (
        <div
          key={c.memberId}
          className="pointer-events-none absolute z-20"
          style={{ left: pos.x, top: pos.y, transform: 'translate(-1px, 0)' }}
        >
          {/* 光标竖线 */}
          <div style={{ width: 2, height: pos.height, background: colorForMember(c.memberId), borderRadius: 1 }} />
          {/* 姓名标签 */}
          <div
            className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
            style={{ background: colorForMember(c.memberId) }}
          >
            {c.user.display_name}
          </div>
        </div>
      ))}
    </>
  );
}
