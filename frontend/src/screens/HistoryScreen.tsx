import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { SkeletonList } from '../components/Skeleton';

export default function HistoryScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    HistoryAPI.list(50).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="title text-main text-lg">Журнал боёв</h2>
      {loading && <SkeletonList rows={5} />}
      {!loading && items.length === 0 && (
        <div className="card p-8 flex flex-col items-center gap-3 text-center">
          <Icon name="scroll" size={32} className="text-muted" />
          <p className="text-main text-sm">Журнал пуст</p>
          <p className="text-muted text-xs">Сыграйте первый бой — он появится здесь</p>
        </div>
      )}
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
