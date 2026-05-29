import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore } from '../stores/settings-store';
import { MatchmakingAPI, OpenMatch } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { SkeletonList } from '../components/Skeleton';
import { getRank } from '../lib/rank';
import { toast } from '../stores/toast-store';

const PRESETS = [5, 10, 25, 50, 100];
const WAGER_FILTERS = [null, 5, 10, 25, 50, 100] as const;

export default function MatchmakingScreen() {
  const user = useAuthStore((s) => s.user);
  const lastWager = useSettingsStore((s) => s.lastWager);
  const setLastWager = useSettingsStore((s) => s.setLastWager);
  const navigate = useNavigate();
  const [wager, setWagerRaw] = useState(lastWager);
  const WAGER_MIN = 5;
  const WAGER_MAX = 200;
  const setWager = (v: number) => {
    const clamped = Math.max(WAGER_MIN, Math.min(WAGER_MAX, Math.round(v)));
    setWagerRaw(clamped);
    setLastWager(clamped);
  };
  const [tab, setTab] = useState<'browse' | 'private'>('browse');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Браузер открытых боёв
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState('');
  const [filterWager, setFilterWager] = useState<number | null>(null);
  const [myOpen, setMyOpen] = useState<{ code: string; wager: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => { tgHaptic('success'); navigate(`/placement/${data.matchId}`); };
    sock.on('match:found', onFound);
    return () => { sock.off('match:found', onFound); };
  }, [navigate]);

  const fetchList = useCallback(async () => {
    try {
      const list = await MatchmakingAPI.listOpen({
        q: query || undefined,
        min: filterWager ?? undefined,
        max: filterWager ?? undefined,
      });
      setMatches(list);
      const mine = list.find((m) => m.isMine);
      setMyOpen(mine ? { code: mine.code, wager: mine.wagerAmount } : null);
    } catch {
      /* список не критичен — молча игнорируем сетевые сбои */
    } finally {
      setLoadingList(false);
    }
  }, [query, filterWager]);

  // Загрузка + автообновление списка пока открыт таб «Поиск матча»
  useEffect(() => {
    if (tab !== 'browse') return;
    setLoadingList(true);
    fetchList();
    const t = setInterval(fetchList, 5000);
    return () => clearInterval(t);
  }, [tab, fetchList]);

  const lowFunds = !user || user.balance < wager;

  const createPublic = async () => {
    if (lowFunds) { setError('Недостаточно средств'); return; }
    setError(null);
    try {
      const l = await MatchmakingAPI.createLobby(wager, true);
      tgHaptic('success');
      setMyOpen({ code: l.code, wager });
      toast('Бой создан — ждём соперника', 'success', 'swords');
      fetchList();
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
  };

  const cancelPublic = async () => {
    try { await MatchmakingAPI.cancelOpen(); } catch {}
    setMyOpen(null);
    tgHaptic('light');
    fetchList();
  };

  const acceptMatch = (m: OpenMatch) => {
    if (m.isMine) return;
    if (!user || user.balance < m.wagerAmount) { setError('Недостаточно средств для этой ставки'); return; }
    setError(null);
    setBusyId(m.id);
    getSocket().emit('lobby:join', { code: m.code, nonce: newNonce() }, (ack: any) => {
      setBusyId(null);
      if (!ack?.ok) { setError(ack?.error ?? 'Не удалось войти в бой'); fetchList(); return; }
      // дальше сработает match:found → переход к расстановке
    });
  };

  const createPrivate = async () => {
    if (lowFunds) { setError('Недостаточно средств'); return; }
    setError(null);
    try {
      const l = await MatchmakingAPI.createLobby(wager);
      tgHaptic('success');
      navigate(`/lobby/${l.code}`);
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
  };

  const joinPrivate = () => {
    if (!joinCode) return;
    setError(null);
    navigate(`/lobby/${joinCode.toUpperCase()}`);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">Поиск боя</h2>

      <div className="card p-1 flex gap-1">
        <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')} icon="swords">Поиск матча</TabBtn>
        <TabBtn active={tab === 'private'} onClick={() => setTab('private')} icon="lock">С другом</TabBtn>
      </div>

      {/* Ставка */}
      <div className="card p-5">
        <p className="eyebrow mb-2">{tab === 'browse' ? 'Ставка вашего боя' : 'Ставка'}</p>
        <div className="flex items-center justify-between gap-3 mb-4">
          <button className="btn-ghost w-11 h-11 p-0 shrink-0" onClick={() => setWager(wager - 5)} disabled={wager <= WAGER_MIN} aria-label="Уменьшить ставку">
            <Icon name="minus" size={18} />
          </button>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl text-main tabular-nums">{wager}</span>
            <span className="text-muted text-sm">₽</span>
          </div>
          <button className="btn-ghost w-11 h-11 p-0 shrink-0" onClick={() => setWager(wager + 5)} disabled={wager >= WAGER_MAX} aria-label="Увеличить ставку">
            <Icon name="plus" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setWager(p)} className={['py-2 rounded-lg text-sm font-display tabular-nums transition border', wager === p ? 'bg-main text-panel border-main' : 'bg-panel text-main border-line'].join(' ')}>
              {p}
            </button>
          ))}
        </div>
        <input type="range" min={5} max={200} step={5} value={wager} onChange={(e) => setWager(Number(e.target.value))} className="w-full accent-danger" />
        <PrizeBreakdown wager={wager} />
      </div>

      {error && <div className="card p-3 text-danger text-sm border-danger">{error}</div>}

      {lowFunds && (
        <button className="btn-secondary w-full" onClick={() => navigate('/wallet')}>
          <Icon name="coins" size={16} /> Пополнить баланс
        </button>
      )}

      {tab === 'browse' ? (
        <div className="space-y-3">
          {/* Создать / статус своего боя */}
          {myOpen ? (
            <div className="card p-4 border-danger flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-main text-sm font-display">Ваш бой в списке · {myOpen.wager} ₽</p>
                <p className="text-muted text-xs">Ждём соперника…</p>
              </div>
              <button className="btn-ghost px-3 py-2" onClick={cancelPublic}>Снять</button>
            </div>
          ) : (
            <button className="btn-primary w-full" onClick={createPublic} disabled={lowFunds}>
              <Icon name="plus" size={18} /> Создать бой за {wager} ₽
            </button>
          )}

          {/* Фильтры */}
          <div className="card p-3 space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-panel border border-line">
              <Icon name="target" size={15} className="text-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по нику"
                className="flex-1 bg-transparent outline-none text-main text-sm placeholder:text-muted"
              />
              {query && <button onClick={() => setQuery('')} className="text-muted"><Icon name="minus" size={14} /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
              {WAGER_FILTERS.map((f) => (
                <button
                  key={f ?? 'all'}
                  onClick={() => setFilterWager(f)}
                  className={['px-3 py-1.5 rounded-lg text-xs font-display tabular-nums whitespace-nowrap transition border', filterWager === f ? 'bg-main text-panel border-main' : 'bg-panel text-muted border-line'].join(' ')}
                >
                  {f == null ? 'Любая' : `${f} ₽`}
                </button>
              ))}
            </div>
          </div>

          {/* Список боёв */}
          {loadingList ? (
            <SkeletonList rows={4} />
          ) : matches.length === 0 ? (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <Icon name="compass" size={28} className="text-muted" />
              <p className="text-main text-sm">Открытых боёв нет</p>
              <p className="text-muted text-xs">Создайте свой — и соперник подключится к вам.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {matches.map((m) => (
                  <MatchRow key={m.id} m={m} busy={busyId === m.id} onAccept={() => acceptMatch(m)} onCancel={cancelPublic} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card p-5 space-y-3">
            <p className="eyebrow">Создать лобби</p>
            <p className="text-muted text-xs">Получите код и ссылку-приглашение для друга. Бой начнётся, как только он войдёт.</p>
            <button className="btn-primary w-full" onClick={createPrivate} disabled={lowFunds}>
              <Icon name="lock" size={16} /> Создать и пригласить
            </button>
          </div>

          <div className="card p-5 space-y-3">
            <p className="eyebrow">Ввести чужой код</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="КОД"
              maxLength={10}
              className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-center font-display tracking-[0.3em] text-main focus:border-line outline-none"
            />
            <button className="btn-primary w-full" onClick={joinPrivate} disabled={!joinCode}>Открыть лобби</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, busy, onAccept, onCancel }: { m: OpenMatch; busy: boolean; onAccept: () => void; onCancel: () => void }) {
  const name = m.host.firstName || m.host.username || 'Капитан';
  const rank = getRank(m.host.wins);
  const initial = name.charAt(0).toUpperCase();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card p-3 flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-lg bg-panel border border-line flex items-center justify-center overflow-hidden shrink-0">
        {m.host.avatar
          ? <img src={m.host.avatar} alt="" className="w-full h-full object-cover" />
          : <span className="font-display text-main">{initial}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-main text-sm font-display truncate">{name}</p>
        <p className="text-muted text-xs flex items-center gap-1">
          <Icon name={rank.icon} size={12} /> {rank.title} · {m.host.wins}W
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-main tabular-nums leading-none">{m.wagerAmount} ₽</div>
        {m.isMine ? (
          <button className="mt-1 text-xs text-muted underline" onClick={onCancel}>снять</button>
        ) : (
          <button className="btn-primary mt-1 px-3 py-1.5 text-xs" onClick={onAccept} disabled={busy}>
            {busy ? '…' : 'Принять'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: IconName; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 rounded-lg text-sm font-display uppercase tracking-wider transition flex items-center justify-center gap-2',
        active ? 'bg-panel text-main' : 'text-muted hover:text-main',
      ].join(' ')}
    >
      <Icon name={icon} size={16} /> {children}
    </button>
  );
}

function PrizeBreakdown({ wager }: { wager: number }) {
  const pool = wager * 2;
  const rake = +(pool * 0.05).toFixed(2);
  const win = +(pool - rake).toFixed(2);
  return (
    <div className="mt-4 grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
      <Cell label="Банк" value={`${pool} ₽`} />
      <Cell label="Комиссия" value={`−${rake} ₽`} accent />
      <Cell label="Победителю" value={`${win} ₽`} />
    </div>
  );
}
function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-panel p-3 text-center">
      <div className={['font-display tabular-nums', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}
