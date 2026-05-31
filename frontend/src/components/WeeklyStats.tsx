import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';
import { formatMoney } from '../lib/format';
import { Icon } from './Icon';

export function WeeklyStats() {
  const [stats, setStats] = useState<{ wins: number; losses: number; net: number } | null>(null);

  useEffect(() => {
    HistoryAPI.weekStats()
      .then((s) => setStats({ wins: s.wins, losses: s.losses, net: s.net }))
      .catch(() => setStats({ wins: 0, losses: 0, net: 0 }));
  }, []);

  if (!stats) return null;

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="scroll" size={16} className="text-muted" />
        <p className="eyebrow">Неделя</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
        <div className="bg-panel p-3 text-center">
          <div className="font-display text-xl text-main tabular-nums">{stats.wins}</div>
          <div className="eyebrow mt-0.5">Побед</div>
        </div>
        <div className="bg-panel p-3 text-center">
          <div className="font-display text-xl text-danger tabular-nums">{stats.losses}</div>
          <div className="eyebrow mt-0.5">Поражений</div>
        </div>
        <div className="bg-panel p-3 text-center">
          <div className={['font-display text-xl tabular-nums', stats.net >= 0 ? 'text-success' : 'text-danger'].join(' ')}>
            {stats.net >= 0 ? '+' : '−'}{formatMoney(Math.abs(stats.net))}
          </div>
          <div className="eyebrow mt-0.5">Итог</div>
        </div>
      </div>
    </section>
  );
}
