import { useEffect, useState } from 'react';
import { HistoryAPI } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { SkeletonList } from '../components/Skeleton';
import { toast } from '../stores/toast-store';

function shortId(id: string) { return id.slice(-8).toUpperCase(); }

function CopyId({ id }: { id: string }) {
  const copy = () => {
    navigator.clipboard.writeText(id).catch(() => {});
    toast(`ID скопирован: ${shortId(id)}`, 'info', 'check');
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-muted hover:text-main transition"
      title={id}
    >
      <span className="font-mono text-[10px] tracking-wide">#{shortId(id)}</span>
      <Icon name="check" size={10} />
    </button>
  );
}

export default function HistoryScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    HistoryAPI.list(50).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const wins = items.filter((m) => m.result === 'win').length;
  const losses = items.filter((m) => m.result === 'loss').length;
  const net = items.reduce((acc, m) => {
    if (m.result === 'win') return acc + (m.prizePool - m.rakeAmount);
    if (m.result === 'loss') return acc - m.wagerAmount;
    return acc;
  }, 0);

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="title text-main text-lg">Журнал боёв</h2>
      {!loading && items.length > 0 && (
        <div className="card p-3 grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
          <div className="bg-panel p-2 text-center">
            <div className="font-display text-lg tabular-nums text-main">{wins}</div>
            <div className="eyebrow mt-0.5">Побед</div>
          </div>
          <div className="bg-panel p-2 text-center">
            <div className="font-display text-lg tabular-nums text-danger">{losses}</div>
            <div className="eyebrow mt-0.5">Поражений</div>
          </div>
          <div className="bg-panel p-2 text-center">
            <div className={['font-display text-lg tabular-nums', net >= 0 ? 'text-success' : 'text-danger'].join(' ')}>
              {net >= 0 ? '+' : '−'}{Math.abs(net).toFixed(0)}
            </div>
            <div className="eyebrow mt-0.5">Итог ₽</div>
          </div>
        </div>
      )}
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
          const resultLabel = win ? 'Победа' : loss ? 'Поражение' : m.result === 'cancelled' ? 'Отменён' : 'Ничья';
          return (
            <li key={m.id} className="card p-4 flex items-center gap-3">
              <div className={[
                'w-9 h-9 rounded-lg flex items-center justify-center border shrink-0',
                win ? 'text-main border-line'
                  : loss ? 'text-danger border-danger'
                    : 'text-muted border-line',
              ].join(' ')}>
                <Icon name={win ? 'trophy' : loss ? 'skull' : 'handshake'} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={['text-xs font-display uppercase tracking-wide', win ? 'text-main' : loss ? 'text-danger' : 'text-muted'].join(' ')}>
                    {resultLabel}
                  </span>
                  <CopyId id={m.id} />
                </div>
                <div className="text-sm text-main truncate">против {m.opponent?.name ?? 'неизвестного'}</div>
                <div className="eyebrow mt-0.5">{m.endedAt ? new Date(m.endedAt).toLocaleString('ru-RU') : '—'}</div>
              </div>
              <div className={['font-display tabular-nums shrink-0', win ? 'text-main' : loss ? 'text-danger' : 'text-muted'].join(' ')}>
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
