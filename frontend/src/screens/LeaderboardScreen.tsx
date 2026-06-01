import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LeaderboardAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { formatMoney } from '../lib/format';
import { usePullToRefresh } from '../lib/usePullToRefresh';

type Tab = 'weekly' | 'wins' | 'earnings' | 'season';

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<Tab>('wins');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [seasonEnd, setSeasonEnd] = useState<string | null>(null);
  const meId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'season') {
        const [info, list] = await Promise.all([
          LeaderboardAPI.seasonInfo(),
          LeaderboardAPI.top('season', 50),
        ]);
        setSeasonName(info.name);
        setSeasonEnd(info.end);
        setItems(list);
      } else if (tab === 'weekly') {
        const [info, list] = await Promise.all([
          LeaderboardAPI.weekInfo(),
          LeaderboardAPI.top('weekly', 50),
        ]);
        setSeasonName('Неделя');
        setSeasonEnd(info.end);
        setItems(list);
      } else {
        setSeasonName(null);
        setSeasonEnd(null);
        setItems(await LeaderboardAPI.top(tab, 50));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const { refreshing } = usePullToRefresh(load);

  const seasonLeft = seasonEnd
    ? Math.max(0, Math.ceil((new Date(seasonEnd).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="max-w-md mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="title text-main text-lg">Рейтинг капитанов</h2>
        {refreshing && <Spinner size={16} />}
      </div>
      {seasonName && tab === 'season' && (
        <p className="text-muted text-xs -mt-1">
          Сезон: <span className="text-main font-display">{seasonName}</span>
          {seasonLeft != null && <span className="ml-2">· осталось {seasonLeft} дн.</span>}
        </p>
      )}
      {tab === 'weekly' && (
        <p className="text-muted text-xs -mt-1">
          Сброс рейтинга — каждое воскресенье
          {seasonLeft != null && <span className="ml-1">· осталось {seasonLeft} дн.</span>}
        </p>
      )}
      <div className="card p-1 flex gap-1">
        <Tab active={tab === 'weekly'} onClick={() => setTab('weekly')}>Неделя</Tab>
        <Tab active={tab === 'wins'} onClick={() => setTab('wins')}>Все время</Tab>
        <Tab active={tab === 'season'} onClick={() => setTab('season')}>Сезон</Tab>
        <Tab active={tab === 'earnings'} onClick={() => setTab('earnings')}>Выигрыш</Tab>
      </div>
      {loading && !refreshing && <SkeletonList rows={6} />}
      <ul className="space-y-1.5">
        {!loading && items.length === 0 && (
          <li>
            <EmptyState
              icon="trophy"
              title={tab === 'season' ? 'Сезон только начался' : 'Рейтинг пуст'}
              subtitle={tab === 'season' ? 'Выиграйте первый бой этого месяца' : 'Выигрывайте бои и станьте первым капитаном'}
            />
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
              <div className="flex-1 text-sm text-main flex items-center gap-2 min-w-0">
                <button type="button" className="truncate text-left hover:text-danger transition" onClick={() => navigate(`/player/${u.id}`)}>
                  {u.name}
                </button>
                {isMe && <span className="text-[9px] uppercase tracking-wide bg-danger text-white rounded px-1.5 py-0.5 shrink-0">вы</span>}
              </div>
              <div className="text-sm font-display tabular-nums text-main shrink-0">
                {tab === 'earnings' ? formatMoney(u.totalWon) : `${u.wins}W`}
              </div>
            </motion.li>
          );
        })}
      </ul>
      <p className="text-center text-muted text-[10px] pt-1">Потяните вниз для обновления</p>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={['flex-1 py-2 rounded-lg text-xs font-display uppercase tracking-wider transition', active ? 'bg-panel text-main' : 'text-muted hover:text-main'].join(' ')}
    >
      {children}
    </button>
  );
}
