import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HistoryAPI } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { toast } from '../stores/toast-store';
import { formatMoney } from '../lib/format';

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

// Кэш списка между заходами: при повторном открытии показываем мгновенно,
// обновляя в фоне — без мелькания серых скелетонов.
let historyCache: any[] | null = null;

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>(historyCache ?? []);
  const [loading, setLoading] = useState(historyCache === null);
  const [expanded, setExpanded] = useState(false);

  const PREVIEW_COUNT = 5;

  const load = useCallback(async () => {
    // Скелетон — только если данных ещё ни разу не было.
    if (historyCache === null) setLoading(true);
    try {
      const list = await HistoryAPI.list(50);
      historyCache = list;
      setItems(list);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const wins = items.filter((m) => m.result === 'win').length;
  const losses = items.filter((m) => m.result === 'loss').length;
  const net = items.reduce((acc, m) => {
    if (m.result === 'win') return acc + (m.prizePool - m.rakeAmount);
    if (m.result === 'loss') return acc - m.wagerAmount;
    return acc;
  }, 0);

  const visibleItems = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hiddenCount = items.length - PREVIEW_COUNT;

  return (
    <div className="max-w-md mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="title text-main text-lg">Журнал боёв</h2>
      </div>
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
              {net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net))}
            </div>
            <div className="eyebrow mt-0.5">Итог</div>
          </div>
        </div>
      )}
      {loading && <SkeletonList rows={5} />}
      {!loading && items.length === 0 && (
        <EmptyState icon="scroll" title="Журнал пуст" subtitle="Сыграйте первый бой — он появится здесь" />
      )}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <span className="eyebrow text-muted">Бои</span>
          <div className="flex-1 h-px bg-line" />
        </div>
      )}
      <ul className="space-y-2">
        {visibleItems.map((m, i) => {
          const win = m.result === 'win';
          const loss = m.result === 'loss';
          const resultLabel = win ? 'Победа' : loss ? 'Поражение' : m.result === 'cancelled' ? 'Отменён' : 'Ничья';
          return (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
              className="card p-4 flex items-center gap-3"
            >
              <div className={[
                'w-9 h-9 rounded-lg flex items-center justify-center border shrink-0',
                win ? 'text-success border-success'
                  : loss ? 'text-danger border-danger'
                    : 'text-muted border-line',
              ].join(' ')}>
                <Icon name={win ? 'trophy' : loss ? 'skull' : 'handshake'} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={['text-xs font-display uppercase tracking-wide', win ? 'text-success' : loss ? 'text-danger' : 'text-muted'].join(' ')}>
                    {resultLabel}
                  </span>
                  <CopyId id={m.id} />
                </div>
                <div className="text-sm text-main truncate">
                  {m.opponent?.id ? (
                    <button className="hover:text-danger transition" onClick={() => navigate(`/player/${m.opponent.id}`)}>
                      против {m.opponent.name ?? 'неизвестного'}
                    </button>
                  ) : (
                    <>против {m.opponent?.name ?? 'неизвестного'}</>
                  )}
                </div>
                <div className="eyebrow mt-0.5">{m.endedAt ? new Date(m.endedAt).toLocaleString('ru-RU') : '—'}</div>
              </div>
              <div className={['font-display tabular-nums shrink-0', win ? 'text-success' : loss ? 'text-danger' : 'text-muted'].join(' ')}>
                {win ? `+${formatMoney(m.prizePool - m.rakeAmount)}`
                  : loss ? `−${formatMoney(m.wagerAmount)}`
                    : formatMoney(m.wagerAmount)}
              </div>
            </motion.li>
          );
        })}
      </ul>

      {!loading && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full card card-press p-3 flex items-center justify-center gap-2 text-sm font-display uppercase tracking-wider text-main"
        >
          {expanded ? 'Свернуть' : `Показать ещё (${hiddenCount})`}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
            <Icon name="arrow-right" size={16} className="rotate-90" />
          </motion.span>
        </button>
      )}
    </div>
  );
}
