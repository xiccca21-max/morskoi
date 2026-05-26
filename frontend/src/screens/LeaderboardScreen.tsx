import { useEffect, useState } from 'react';
import { LeaderboardAPI } from '../api/endpoints';

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'wins' | 'earnings'>('wins');
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    LeaderboardAPI.top(tab, 50).then(setItems).catch(() => {});
  }, [tab]);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="font-display text-cyber-cyan tracking-widest text-sm">ЛИДЕРБОРД</h2>
      <div className="card p-1 flex">
        <button onClick={() => setTab('wins')}
          className={['flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'wins' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' ')}>
          🏆 Победы
        </button>
        <button onClick={() => setTab('earnings')}
          className={['flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'earnings' ? 'bg-cyber-cyan text-navy-950' : 'text-white/70'].join(' ')}>
          💰 Заработок
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((u) => (
          <li key={u.id} className="card p-3 flex items-center gap-3">
            <div className={['w-8 text-center font-display',
              u.rank === 1 ? 'text-cyber-gold' :
              u.rank === 2 ? 'text-white' :
              u.rank === 3 ? 'text-orange-400' : 'text-white/40'].join(' ')}>
              #{u.rank}
            </div>
            {u.avatar
              ? <img src={u.avatar} className="w-8 h-8 rounded-full" alt=""/>
              : <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-xs">{u.name?.[0] ?? '?'}</div>}
            <div className="flex-1 text-sm">{u.name}</div>
            <div className="text-sm">
              {tab === 'wins' ? <span className="text-sonar-400">{u.wins} W</span> :
                <span className="text-cyber-cyan">${u.totalWon.toFixed(2)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
