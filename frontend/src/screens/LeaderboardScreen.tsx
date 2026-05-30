import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LeaderboardAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { formatNumber } from '../lib/format';

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'wins' | 'earnings'>('wins');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const meId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    setLoading(true);
    LeaderboardAPI.top(tab, 50).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="title text-main text-lg">Рейтинг капитанов</h2>
      <div className="card p-1 flex gap-1">
        <Tab active={tab === 'wins'} onClick={() => setTab('wins')}>Победы</Tab>
        <Tab active={tab === 'earnings'} onClick={() => setTab('earnings')}>Выигрыш</Tab>
      </div>
      {loading && <SkeletonList rows={6} />}
      <ul className="space-y-1.5">
        {!loading && items.length === 0 && (
          <li>
            <EmptyState icon="trophy" title="Рейтинг пуст" subtitle="Выигрывайте бои и станьте первым капитаном" />
          </li>
        )}
        {items.map((u, i) => {
          const top = u.rank <= 3;
          const isMe = !!meId && u.id === meId;
          return (
            <motion.li
              key={u.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
              className={['card p-3 flex items-center gap-3', isMe ? 'border-danger' : ''].join(' ')}
            >
              <div className="w-8 flex items-center justify-center">
                {top
                  ? <Icon name="medal" size={20} className={u.rank === 1 ? 'text-main' : u.rank === 2 ? 'text-muted' : 'text-danger'} />
                  : <span className="font-display text-muted tabular-nums">{u.rank}</span>}
              </div>
              <Avatar name={u.name} src={u.avatar} size={32} />
              <div className="flex-1 text-sm text-main flex items-center gap-2">
                {u.name}
                {isMe && <span className="text-[9px] uppercase tracking-wide bg-danger text-white rounded px-1.5 py-0.5">вы</span>}
              </div>
              <div className="text-sm font-display tabular-nums text-main">
                {tab === 'wins' ? `${u.wins}` : `${formatNumber(u.totalWon)} ₽`}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={['flex-1 py-2 rounded-lg text-sm font-display uppercase tracking-wider transition', active ? 'bg-panel text-main' : 'text-muted hover:text-main'].join(' ')}
    >
      {children}
    </button>
  );
}
