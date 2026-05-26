import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';

export default function HistoryScreen() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    HistoryAPI.list(50).then(setItems).catch(() => {});
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="font-display text-cyber-cyan tracking-widest text-sm">ИСТОРИЯ МАТЧЕЙ</h2>
      {items.length === 0 && <div className="card p-6 text-center text-white/40">Пока ни одного боя</div>}
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="card p-4 flex items-center gap-3">
            <div className={[
              'w-10 h-10 rounded-xl flex items-center justify-center text-xl font-display',
              m.result === 'win' ? 'bg-sonar-500/15 text-sonar-400' :
              m.result === 'loss' ? 'bg-cyber-red/15 text-cyber-red' :
              'bg-white/10 text-white/60'
            ].join(' ')}>
              {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : '·'}
            </div>
            <div className="flex-1">
              <div className="text-sm">vs {m.opponent?.name ?? 'Unknown'}</div>
              <div className="text-xs text-white/40">
                {m.endedAt ? new Date(m.endedAt).toLocaleString() : '—'}
              </div>
            </div>
            <div className={['font-display', m.result === 'win' ? 'text-sonar-400' : 'text-white/70'].join(' ')}>
              {m.result === 'win' ? `+$${(m.prizePool - m.rakeAmount).toFixed(2)}` :
               m.result === 'loss' ? `−$${m.wagerAmount.toFixed(2)}` :
               `${m.wagerAmount.toFixed(2)}`}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
