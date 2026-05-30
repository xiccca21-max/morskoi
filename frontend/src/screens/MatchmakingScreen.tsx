import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore } from '../stores/settings-store';
import { MatchmakingAPI, OpenMatch } from '../api/endpoints';
import { getSocket, newNonce } from '../api/socket';
import { tgHaptic, tgVibrate } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { SkeletonList } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { getRank } from '../lib/rank';
import type { Rank } from '../lib/rank';
import { toast } from '../stores/toast-store';

const ALL_RANKS: Rank[] = [
  { title: 'Юнга',    icon: 'anchor',  min: 0,  next: 3  },
  { title: 'Матрос',  icon: 'ship',    min: 3,  next: 8  },
  { title: 'Боцман',  icon: 'compass', min: 8,  next: 15 },
  { title: 'Штурман', icon: 'wheel',   min: 15, next: 30 },
  { title: 'Капитан', icon: 'medal',   min: 30, next: 60 },
  { title: 'Адмирал', icon: 'crown',   min: 60             },
];

function RanksModal({ open, onClose, highlightTitle }: { open: boolean; onClose: () => void; highlightTitle?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Система званий" icon="medal">
      <p className="text-muted text-xs mb-4 leading-relaxed">
        Звание растёт с каждой победой. Чем выше звание — тем опытнее капитан.
      </p>
      <ul className="space-y-2">
        {ALL_RANKS.map((r) => {
          const isHighlight = r.title === highlightTitle;
          return (
            <li key={r.title} className={['flex items-center gap-3 rounded-lg px-3 py-2', isHighlight ? 'bg-danger/10 border border-danger' : 'bg-panel'].join(' ')}>
              <Icon name={r.icon} size={18} className={isHighlight ? 'text-danger' : 'text-muted'} />
              <div className="flex-1">
                <span className={['font-display text-sm', isHighlight ? 'text-danger' : 'text-main'].join(' ')}>
                  {r.title}
                  {isHighlight && <span className="ml-2 text-[10px] bg-danger text-white rounded px-1.5 py-0.5 uppercase tracking-wide">Этот игрок</span>}
                </span>
              </div>
              <span className="text-muted text-xs tabular-nums">
                {r.min === 0 ? 'с 0 побед' : `с ${r.min}`}{r.next ? ` → ${r.next}` : ' · Макс'}
              </span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

const PRESETS = [5, 10, 25, 50, 100];
const WAGER_MIN = 1;
const WAGER_ABS_MAX = 10_000; // сервер проверит баланс, здесь просто верхний ввод

export default function MatchmakingScreen() {
  const user = useAuthStore((s) => s.user);
  const lastWager = useSettingsStore((s) => s.lastWager);
  const setLastWager = useSettingsStore((s) => s.setLastWager);
  const navigate = useNavigate();
  // rawInput: то, что юзер видит в поле ввода (строка, может быть пустой при наборе)
  const [rawInput, setRawInput] = useState(String(lastWager));
  const wager = Math.max(WAGER_MIN, Math.min(WAGER_ABS_MAX, Number(rawInput) || WAGER_MIN));
  const balance = user?.balance ?? 0;
  const overBalance = wager > balance;

  const setWager = (v: number) => {
    const clamped = Math.max(WAGER_MIN, Math.min(WAGER_ABS_MAX, Math.round(v)));
    setRawInput(String(clamped));
    setLastWager(clamped);
  };

  // Вибрация при выходе за баланс
  const prevOver = useRef(false);
  useEffect(() => {
    if (overBalance && !prevOver.current) tgVibrate(40);
    prevOver.current = overBalance;
  }, [overBalance]);

  const [tab, setTab] = useState<'browse' | 'private'>('browse');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ranksForPlayer, setRanksForPlayer] = useState<string | undefined>(undefined);

  // Браузер открытых боёв
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState('');
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const [sortAsc, setSortAsc] = useState(true); // true = от меньшего к большему
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
        min: filterMin !== '' ? Number(filterMin) : undefined,
        max: filterMax !== '' ? Number(filterMax) : undefined,
      });
      setMatches(list);
      const mine = list.find((m) => m.isMine);
      setMyOpen(mine ? { code: mine.code, wager: mine.wagerAmount } : null);
    } catch {
      /* список не критичен */
    } finally {
      setLoadingList(false);
    }
  }, [query, filterMin, filterMax]);

  // Загрузка + автообновление списка пока открыт таб «Поиск матча»
  useEffect(() => {
    if (tab !== 'browse') return;
    setLoadingList(true);
    fetchList();
    const t = setInterval(fetchList, 5000);
    return () => clearInterval(t);
  }, [tab, fetchList]);

  // Открываем выбор ставки (browse)
  const openCreateModal = () => { setShowCreateModal(true); tgHaptic('light'); };

  const createPublic = async () => {
    setShowCreateModal(false);
    if (overBalance) { tgVibrate(60); setShowFundsModal(true); return; }
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
    if (!user || user.balance < m.wagerAmount) { tgVibrate(60); setShowFundsModal(true); return; }
    setError(null);
    setBusyId(m.id);
    getSocket().emit('lobby:join', { code: m.code, nonce: newNonce() }, (ack: any) => {
      setBusyId(null);
      if (!ack?.ok) { setError(ack?.error ?? 'Не удалось войти в бой'); fetchList(); return; }
      // дальше сработает match:found → переход к расстановке
    });
  };

  const createPrivate = async () => {
    setShowCreateModal(false);
    if (overBalance) { tgVibrate(60); setShowFundsModal(true); return; }
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

      {error && <div className="card p-3 text-danger text-sm border-danger">{error}</div>}

      {/* Bottom-sheet: выбор ставки */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Ставка боя" icon="coins">
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
            <p className="eyebrow">Укажи сумму</p>
            {overBalance && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-danger text-[11px] font-display">
                Превышает баланс
              </motion.span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              className="shrink-0 w-14 h-14 rounded-2xl bg-panel border-2 border-line flex items-center justify-center text-main transition active:scale-95 disabled:opacity-30"
              onClick={() => setWager(wager - 5)}
              disabled={wager <= WAGER_MIN}
              aria-label="-5"
            >
              <Icon name="minus" size={26} />
            </button>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <input
                type="number"
                inputMode="numeric"
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  const n = Number(e.target.value);
                  if (!isNaN(n) && n > 0) setLastWager(Math.min(WAGER_ABS_MAX, n));
                }}
                onBlur={() => {
                  const n = Math.max(WAGER_MIN, Math.min(WAGER_ABS_MAX, Number(rawInput) || WAGER_MIN));
                  setRawInput(String(n));
                  setLastWager(n);
                }}
                className={['w-28 text-center bg-transparent outline-none font-display text-4xl tabular-nums', overBalance ? 'text-danger' : 'text-main'].join(' ')}
              />
              <span className={['text-sm shrink-0', overBalance ? 'text-danger' : 'text-muted'].join(' ')}>₽</span>
            </div>
            <button
              className="shrink-0 w-14 h-14 rounded-2xl bg-danger flex items-center justify-center text-white transition active:scale-95 disabled:opacity-30"
              onClick={() => setWager(wager + 5)}
              disabled={wager >= WAGER_ABS_MAX}
              aria-label="+5"
            >
              <Icon name="plus" size={26} />
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setWager(p)}
                className={['py-2 rounded-lg text-sm font-display tabular-nums transition border', wager === p ? 'bg-main text-panel border-main' : 'bg-panel text-main border-line'].join(' ')}>
                {p}
              </button>
            ))}
          </div>

          <input type="range" min={WAGER_MIN} max={Math.max(balance, wager, 200)} step={1}
            value={Math.min(wager, Math.max(balance, wager, 200))}
            onChange={(e) => setWager(Number(e.target.value))}
            className="w-full accent-danger" />
          <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums mb-4">
            <span>{WAGER_MIN} ₽</span>
            <span>Баланс: {balance.toFixed(0)} ₽</span>
          </div>

          <PrizeBreakdown wager={wager} />

          <div className="mt-4 space-y-2">
            <button
              className="btn-primary w-full normal-case tracking-normal text-sm py-3.5 gap-2"
              onClick={tab === 'browse' ? createPublic : createPrivate}
            >
              <Icon name="swords" size={18} className="shrink-0" />
              <span>Создать за {wager} ₽</span>
            </button>
            <button className="btn-ghost w-full" onClick={() => setShowCreateModal(false)}>Отмена</button>
          </div>
        </div>
      </Modal>

      {/* Модалька: система званий */}
      <RanksModal open={ranksForPlayer !== undefined} onClose={() => setRanksForPlayer(undefined)} highlightTitle={ranksForPlayer} />

      {/* Модалька «Недостаточно средств» */}
      <Modal open={showFundsModal} onClose={() => setShowFundsModal(false)} title="Недостаточно средств" icon="coins">
        <p className="text-main text-sm mb-5">
          Ставка <strong>{wager} ₽</strong> превышает ваш баланс ({balance.toFixed(0)} ₽).
          Пополните счёт, чтобы создать этот бой.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={() => setShowFundsModal(false)}>Отмена</button>
          <button className="btn-primary" onClick={() => { setShowFundsModal(false); navigate('/wallet'); }}>
            <Icon name="coins" size={15} /> Пополнить
          </button>
        </div>
      </Modal>

      {tab === 'browse' ? (
        <div className="space-y-3">
          {/* Создать / статус своего боя */}
          {myOpen ? (
            <div className="card p-4 border-danger space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-main text-sm font-display">Ваш бой в списке · {myOpen.wager} ₽</p>
                  <p className="text-muted text-xs">Ждём соперника…</p>
                </div>
                <button className="btn-ghost px-3 py-2" onClick={cancelPublic}>Снять</button>
              </div>
              <div className="flex items-start gap-2 bg-panel rounded-lg px-3 py-2">
                <Icon name="info" size={13} className="text-muted shrink-0 mt-0.5" />
                <p className="text-muted text-[11px] leading-relaxed">
                  Как только соперник примет бой — ты автоматически перейдёшь к расстановке кораблей, даже если свернул приложение.
                </p>
              </div>
            </div>
          ) : (
            <button className="btn-primary w-full" onClick={openCreateModal}>
              <Icon name="plus" size={18} /> Создать бой
            </button>
          )}

          {/* Фильтры */}
          <div className="card p-3 space-y-2">
            {/* Поиск по нику */}
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

            {/* Диапазон ставки + сортировка */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 px-3 py-2 rounded-lg bg-panel border border-line">
                <span className="text-muted text-xs shrink-0">от</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={filterMin}
                  onChange={(e) => setFilterMin(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent outline-none text-main text-sm tabular-nums placeholder:text-muted"
                />
              </div>
              <span className="text-muted text-xs shrink-0">—</span>
              <div className="flex items-center gap-1.5 flex-1 px-3 py-2 rounded-lg bg-panel border border-line">
                <span className="text-muted text-xs shrink-0">до</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={filterMax}
                  onChange={(e) => setFilterMax(e.target.value)}
                  placeholder="∞"
                  className="w-full bg-transparent outline-none text-main text-sm tabular-nums placeholder:text-muted"
                />
              </div>
              {/* Кнопка сортировки */}
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="shrink-0 w-10 h-10 rounded-lg border border-line bg-panel flex items-center justify-center transition hover:border-main"
                title={sortAsc ? 'Сначала дешевле' : 'Сначала дороже'}
              >
                <motion.span
                  animate={{ rotate: sortAsc ? 0 : 180 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className="flex items-center justify-center"
                >
                  <Icon name="arrow-right" size={16} className="rotate-90 text-main" />
                </motion.span>
              </button>
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
                {[...matches]
                  .sort((a, b) => sortAsc ? a.wagerAmount - b.wagerAmount : b.wagerAmount - a.wagerAmount)
                  .map((m) => (
                    <MatchRow key={m.id} m={m} busy={busyId === m.id} onAccept={() => acceptMatch(m)} onCancel={cancelPublic} onShowRank={() => setRanksForPlayer(getRank(m.host.wins).title)} />
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
            <button className="btn-primary w-full" onClick={openCreateModal}>
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

function MatchRow({ m, busy, onAccept, onCancel, onShowRank }: { m: OpenMatch; busy: boolean; onAccept: () => void; onCancel: () => void; onShowRank: () => void }) {
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
          ? <img src={m.host.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <span className="font-display text-main">{initial}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-main text-sm font-display truncate">{name}</p>
        <button onClick={onShowRank} className="flex items-center gap-1 text-muted text-xs hover:text-main transition">
          <Icon name={rank.icon} size={12} />
          <span>{rank.title} · {m.host.wins}W</span>
          <span className="text-danger text-[10px] font-display underline ml-0.5 shrink-0">подробнее</span>
        </button>
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
        active ? 'bg-danger text-white shadow-[0_4px_12px_rgba(225,87,75,0.35)]' : 'text-muted hover:text-main',
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
      <Cell label="Банк" value={`${pool.toFixed(0)} ₽`} />
      <Cell label="Комиссия" value={`−${rake.toFixed(0)} ₽`} accent />
      <Cell label="Победителю" value={`${win.toFixed(0)} ₽`} />
    </div>
  );
}
function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-panel px-1.5 py-2.5 text-center min-w-0">
      <div className={['font-display tabular-nums text-xs leading-tight truncate', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted mt-1 truncate">{label}</div>
    </div>
  );
}
