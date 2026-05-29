import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';
import { Icon } from '../components/Icon';

export default function HistoryScreen() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { HistoryAPI.list(50).then(setItems).catch(() => {}); }, []);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="title text-main text-lg">Журнал боёв</h2>
      {items.length === 0 && <div className="card p-6 text-center text-muted">Ещё ни одного боя</div>}
      <ul className="space-y-2">
        {items.map((m) => {
          const win = m.result === 'win';
          const loss = m.result === 'loss';
          return (
            <li key={m.id} className="card p-4 flex items-center gap-3">
              <div className={[
                'w-9 h-9 rounded-lg flex items-center justify-center border',
                win ? 'text-main border-line'
                  : loss ? 'text-danger border-danger'
                    : 'text-muted border-line',
              ].join(' ')}>
                <Icon name={win ? 'trophy' : loss ? 'skull' : 'handshake'} size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm text-main">против {m.opponent?.name ?? 'неизвестного'}</div>
                <div className="eyebrow mt-0.5">{m.endedAt ? new Date(m.endedAt).toLocaleString() : '—'}</div>
              </div>
              <div className={['font-display tabular-nums', win ? 'text-main' : loss ? 'text-danger' : 'text-muted'].join(' ')}>
                {win ? `+${(m.prizePool - m.rakeAmount).toFixed(0)} ₽`
                  : loss ? `−${m.wagerAmount.toFixed(0)} ₽`
                    : `${m.wagerAmount.toFixed(0)} ₽`}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
