import { useEffect, useState } from 'react';
import { LeaderboardAPI } from '../api/endpoints';
import { Icon } from '../components/Icon';

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'wins' | 'earnings'>('wins');
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { LeaderboardAPI.top(tab, 50).then(setItems).catch(() => {}); }, [tab]);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="title text-main text-lg">Рейтинг капитанов</h2>
      <div className="card p-1 flex gap-1">
        <Tab active={tab === 'wins'} onClick={() => setTab('wins')}>Победы</Tab>
        <Tab active={tab === 'earnings'} onClick={() => setTab('earnings')}>Выигрыш</Tab>
      </div>
      <ul className="space-y-1.5">
        {items.length === 0 && <li className="card p-6 text-center text-muted">Пока пусто — стань первым</li>}
        {items.map((u) => {
          const top = u.rank <= 3;
          return (
            <li key={u.id} className="card p-3 flex items-center gap-3">
              <div className="w-8 flex items-center justify-center">
                {top
                  ? <Icon name="medal" size={20} className={u.rank === 1 ? 'text-main' : u.rank === 2 ? 'text-muted' : 'text-danger'} />
                  : <span className="font-display text-muted tabular-nums">{u.rank}</span>}
              </div>
              {u.avatar
                ? <img src={u.avatar} className="w-8 h-8 rounded-full border border-line" alt="" />
                : <div className="w-8 h-8 rounded-full bg-panel border border-line flex items-center justify-center text-xs text-muted">{u.name?.[0] ?? '?'}</div>}
              <div className="flex-1 text-sm text-main">{u.name}</div>
              <div className="text-sm font-display tabular-nums text-main">
                {tab === 'wins' ? `${u.wins}` : `${u.totalWon.toFixed(0)} ₽`}
              </div>
            </li>
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
