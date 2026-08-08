// 在线协作者头像：显示当前章节房间内的活跃成员
import { type Peer } from '../../lib/presence';
import { colorForMember } from './RemoteCursors';

type Props = {
  peers: Peer[];
  currentUserId?: string;
};

export default function OnlineAvatars({ peers, currentUserId }: Props) {
  const others = peers.filter(p => p.memberId !== currentUserId);
  if (others.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {others.map(p => (
        <span
          key={p.memberId}
          title={p.user.display_name + ' 正在编辑'}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
          style={{ background: colorForMember(p.memberId) }}
        >
          {p.user.display_name.slice(0, 1)}
        </span>
      ))}
    </span>
  );
}
