import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore } from '../stores/settings-store';
import { GameAPI, MatchmakingAPI, OpenMatch } from '../api/endpoints';
import { useMatchStore } from '../stores/match-store';
import { getSocket, newNonce } from '../api/socket';
import { joinLobbyAction } from '../api/lobby-join';
import { tgHaptic, tgVibrate } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { Modal, ConfirmDialog } from '../components/Modal';
import { getRank, ALL_RANKS, type Rank } from '../lib/rank';
import { toast } from '../stores/toast-store';
import { Spinner } from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { useDebounce } from '../lib/hooks';
import { formatMoney, useMoney, currencySymbol } from '../lib/format';
import { playSound } from '../lib/audio';
import { useGameConfigStore } from '../stores/game-config-store';
import { mapApiError } from '../lib/api-errors';

const ALL_RANKS_LOCAL = ALL_RANKS;

function RanksModal({ open, onClose, highlightTitle }: { open: boolean; onClose: () => void; highlightTitle?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Система званий" icon="medal">
      <p className="text-muted text-xs mb-4 leading-relaxed">
        Звание растёт с каждой победой. Чем выше звание — тем опытнее капитан.
      </p>
      <ul className="space-y-2">
        {ALL_RANKS_LOCAL.map((r) => {
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

const PRESETS = [100, 250, 500, 1000, 5000];

export default function MatchmakingScreen() {
  const fmt = useMoney();
  const sym = currencySymbol();
  const minWager = useGameConfigStore((s) => s.minWager);
  const maxWager = useGameConfigStore((s) => s.maxWager);
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const lastWager = useSettingsStore((s) => s.lastWager);
  const setLastWager = useSettingsStore((s) => s.setLastWager);
  const navigate = useNavigate();
  const match = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);
  // rawInput: то, что юзер видит в поле ввода (строка, может быть пустой при наборе)
  const [rawInput, setRawInput] = useState(String(Math.max(minWager, lastWager)));
  const wager = Math.max(minWager, Math.min(maxWager, Number(rawInput) || minWager));
  const balance = user?.balance ?? 0;
  const overBalance = wager > balance;

  const setWager = (v: number) => {
    const clamped = Math.max(minWager, Math.min(maxWager, Math.round(v)));
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
  const [inQueue, setInQueue] = useState(false);
  const [queueSearching, setQueueSearching] = useState(false);
  const [queueSince, setQueueSince] = useState<number | null>(null);
  const [queueTick, setQueueTick] = useState(Date.now());
  const quickStarted = useRef(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bigWagerConfirm, setBigWagerConfirm] = useState(false);
  const [ranksForPlayer, setRanksForPlayer] = useState<string | undefined>(undefined);

  // Браузер открытых боёв; null = ещё не загружен (не показываем ни скелетон, ни фильтры)
  const [matches, setMatches] = useState<OpenMatch[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const debouncedMin = useDebounce(filterMin, 350);
  const debouncedMax = useDebounce(filterMax, 350);
  const [sortAsc, setSortAsc] = useState(true); // true = от меньшего к большему
  const [myOpen, setMyOpen] = useState<{ code: string; wager: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joiningLobby, setJoiningLobby] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<OpenMatch | null>(null);

  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => {
      if (!inQueue) return;
      setInQueue(false);
      setQueueSearching(false);
      tgHaptic('success');
      playSound('win');
      if (data?.matchId) navigate(`/placement/${data.matchId}`);
    };
    sock.on('match:found', onFound);
    return () => { sock.off('match:found', onFound); };
  }, [navigate, inQueue]);

  const startQueue = useCallback(() => {
    if (overBalance) { tgVibrate(60); setShowFundsModal(true); return; }
    setError(null);
    setQueueSearching(true);
    getSocket().emit('mm:join', { wagerAmount: wager, nonce: newNonce() }, (ack: any) => {
      setQueueSearching(false);
      if (!ack?.ok) {
        setError(mapApiError(ack?.error, 'Не удалось встать в очередь'));
        setInQueue(false);
        return;
      }
      if (ack.matched && ack.matchId) {
        setInQueue(false);
        navigate(`/placement/${ack.matchId}`);
        return;
      }
      setInQueue(true);
      setQueueSince(Date.now());
      tgHaptic('success');
    });
  }, [overBalance, wager, navigate]);

  const cancelQueue = useCallback(async () => {
    setQueueSearching(true);
    try {
      getSocket().emit('mm:leave', {}, () => undefined);
      await MatchmakingAPI.leave();
    } catch { /* ignore */ }
    setInQueue(false);
    setQueueSince(null);
    setQueueSearching(false);
    tgHaptic('light');
  }, []);

  useEffect(() => {
    GameAPI.active()
      .then((m) => { if (m?.matchId) setMatchState(m); })
      .catch(() => undefined);
  }, [setMatchState]);

  const activeMatch =
    match &&
    match.status !== 'FINISHED' &&
    match.status !== 'CANCELLED' &&
    (match.gameStatus === 'PLACEMENT' || match.gameStatus === 'IN_PROGRESS');

  useEffect(() => {
    MatchmakingAPI.status()
      .then((s: any) => {
        if (s.inQueue) {
          setInQueue(true);
          setQueueSince(s.since ? new Date(s.since).getTime() : Date.now());
        }
      })
      .catch(() => undefined);
  }, []);

  // Старый параметр быстрого боя больше не используется — просто очищаем URL.
  useEffect(() => {
    if (searchParams.get('quick') === '1') setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!inQueue) return;
    const t = setInterval(() => setQueueTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inQueue]);

  const listFingerprint = (list: OpenMatch[]) =>
    list.map((m) => `${m.id}:${m.wagerAmount}`).join('|');

  const listLoadedOnce = useRef(false);

  const fetchList = useCallback(async () => {
    if (!listLoadedOnce.current) {
      loadingTimerRef.current = setTimeout(() => setLoadingList(true), 200);
    }
    try {
      const list = await MatchmakingAPI.listOpen({
        q: debouncedQuery || undefined,
        min: debouncedMin !== '' ? Number(debouncedMin) : undefined,
        max: debouncedMax !== '' ? Number(debouncedMax) : undefined,
      });
      listLoadedOnce.current = true;
      setMatches((prev) => (prev && listFingerprint(prev) === listFingerprint(list) ? prev : list));
      const mine = list.find((m) => m.isMine);
      setMyOpen(mine ? { code: mine.code, wager: mine.wagerAmount } : null);
      setError((err) => {
        if (!err) return err;
        const stale =
          err.includes('принят') ||
          err.includes('закрыт') ||
          err.includes('Lobby is not open');
        return stale ? null : err;
      });
    } catch {
      /* список не критичен */
    } finally {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoadingList(false);
    }
  }, [debouncedQuery, debouncedMin, debouncedMax]);

  // Список: только при открытии вкладки или смене фильтров (без фонового опроса)
  useEffect(() => {
    if (tab !== 'browse') return;
    void fetchList();
  }, [tab, debouncedQuery, debouncedMin, debouncedMax, fetchList]);

  // Открываем выбор ставки (browse)
  const openCreateModal = () => { setShowCreateModal(true); tgHaptic('light'); };

  const doCreate = () => { (tab === 'browse' ? createPublic : createPrivate)(); };

  // Перед созданием — если ставка съедает больше половины баланса, спрашиваем подтверждение.
  const attemptCreate = () => {
    if (overBalance) { tgVibrate(60); setShowFundsModal(true); return; }
    if (balance > 0 && wager > balance * 0.5) {
      setShowCreateModal(false);
      setBigWagerConfirm(true);
      return;
    }
    doCreate();
  };

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
    } catch (e: any) { setError(mapApiError(e?.response?.data?.message ?? e?.message)); }
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
    tgHaptic('light');
    setPendingMatch(m);
  };

  const confirmAcceptMatch = async () => {
    const m = pendingMatch;
    if (!m || joiningLobby) return;
    setError(null);
    setJoiningLobby(true);
    setBusyId(m.id);
    tgHaptic('medium');
    try {
      const { matchId } = await joinLobbyAction(m.code);
      setPendingMatch(null);
      navigate(`/placement/${matchId}`);
    } catch (e: any) {
      // Закрываем диалог — иначе ошибка прячется за модалкой и кажется, что «ничего не происходит».
      setPendingMatch(null);
      const msg = mapApiError(e?.response?.data?.message ?? e?.message, 'Не удалось войти в бой');
      setError(msg);
      toast(msg, 'error', 'flag');
      tgVibrate(60);
      void fetchList();
    } finally {
      setJoiningLobby(false);
      setBusyId(null);
    }
  };

  const createPrivate = async () => {
    setShowCreateModal(false);
    if (overBalance) { tgVibrate(60); setShowFundsModal(true); return; }
    setError(null);
    try {
      const l = await MatchmakingAPI.createLobby(wager);
      tgHaptic('success');
      navigate(`/lobby/${l.code}`);
    } catch (e: any) { setError(mapApiError(e?.response?.data?.message ?? e?.message)); }
  };

  const joinPrivate = () => {
    if (!joinCode) return;
    setError(null);
    navigate(`/lobby/${joinCode.toUpperCase()}`);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="title text-main text-lg">Поиск боя</h2>
        <div className="flex items-center gap-2 shrink-0">
          {tab === 'browse' && (
            <button
              type="button"
              className="text-muted hover:text-main p-1"
              aria-label="Обновить список"
              onClick={() => { tgHaptic('light'); void fetchList(); }}
            >
              <Icon name="wave" size={18} />
            </button>
          )}
          {tab === 'browse' && matches && matches.length > 0 && (
            <span className="text-xs font-display text-muted tabular-nums">
              {matches.length} {matchesPlural(matches.length)} в эфире
            </span>
          )}
        </div>
      </div>

      {balance < minWager && (
        <button
          onClick={() => navigate('/wallet')}
          className="w-full card card-press p-3 flex items-center gap-3 border-warning text-left"
        >
          <Icon name="coins" size={18} className="text-warning shrink-0" />
          <span className="flex-1 text-main text-sm">Баланс {fmt(balance)} — для боя нужно минимум {fmt(minWager)}</span>
          <Icon name="arrow-right" size={16} className="text-warning shrink-0" />
        </button>
      )}

      <div className="card p-1 flex gap-1">
        <TabBtn active={tab === 'browse'} onClick={() => { setError(null); setTab('browse'); }} icon="swords">Лобби</TabBtn>
        <TabBtn active={tab === 'private'} onClick={() => { setError(null); setTab('private'); }} icon="lock">С другом</TabBtn>
      </div>

      {activeMatch && (
        <button
          type="button"
          className="w-full card card-press p-4 flex items-center gap-3 border-warning text-left"
          onClick={() => navigate(`/${match!.gameStatus === 'PLACEMENT' ? 'placement' : 'battle'}/${match!.matchId}`)}
        >
          <Icon name="swords" size={20} className="text-warning shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-main text-sm font-display">У вас незавершённый бой</p>
            <p className="text-muted text-xs mt-0.5">Сначала вернитесь в него — иначе новый бой не начнётся</p>
          </div>
          <Icon name="arrow-right" size={16} className="text-warning shrink-0" />
        </button>
      )}

      {error && <div className="card p-3 text-danger text-sm border-danger">{error}</div>}

      {inQueue && (
        <div className="card p-4 flex items-center gap-3 border-warning">
          <Spinner />
          <div className="flex-1">
            <p className="text-main text-sm font-display">В очереди на бой…</p>
            <p className="text-muted text-xs">
              {queueSince ? `${Math.floor((queueTick - queueSince) / 1000)} сек` : 'ожидание соперника'}
            </p>
          </div>
          <button className="btn-ghost text-sm shrink-0" onClick={cancelQueue} disabled={queueSearching}>
            Отмена
          </button>
        </div>
      )}

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
              onClick={() => setWager(wager - 25)}
              disabled={wager <= minWager}
              aria-label="-25"
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
                  if (!isNaN(n) && n > 0) setLastWager(Math.min(maxWager, n));
                }}
                onBlur={() => {
                  const n = Math.max(minWager, Math.min(maxWager, Number(rawInput) || minWager));
                  setRawInput(String(n));
                  setLastWager(n);
                }}
                className={['w-28 text-center bg-transparent outline-none font-display text-4xl tabular-nums', overBalance ? 'text-danger' : 'text-main'].join(' ')}
              />
              <span className={['text-sm shrink-0', overBalance ? 'text-danger' : 'text-muted'].join(' ')}>{sym}</span>
            </div>
            <button
              className="shrink-0 w-14 h-14 rounded-2xl bg-danger flex items-center justify-center text-white transition active:scale-95 disabled:opacity-30"
              onClick={() => setWager(wager + 25)}
              disabled={wager >= maxWager}
              aria-label="+25"
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

          <input type="range" min={minWager} max={Math.max(balance, wager, 200)} step={1}
            value={Math.min(wager, Math.max(balance, wager, 200))}
            onChange={(e) => setWager(Number(e.target.value))}
            className="w-full accent-danger" />
          <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums mb-4">
            <span>{fmt(minWager)}</span>
            <span>Баланс: {fmt(balance)}</span>
          </div>

          <PrizeBreakdown wager={wager} />

          <div className="mt-4 space-y-2">
            <button
              className="btn-primary w-full normal-case tracking-normal text-sm py-3.5 gap-2"
              onClick={attemptCreate}
            >
              <Icon name="swords" size={18} className="shrink-0" />
              <span>Создать за {fmt(wager)}</span>
            </button>
            <button className="btn-ghost w-full" onClick={() => setShowCreateModal(false)}>Отмена</button>
          </div>
        </div>
      </Modal>

      {/* Подтверждение крупной ставки */}
      <ConfirmDialog
        open={bigWagerConfirm}
        title="Крупная ставка"
        icon="coins"
        message={<>Ставка <strong>{fmt(wager)}</strong> — это больше половины вашего баланса ({fmt(balance)}). Создать бой?</>}
        confirmLabel="Создать"
        onCancel={() => { setBigWagerConfirm(false); setShowCreateModal(true); }}
        onConfirm={() => { setBigWagerConfirm(false); doCreate(); }}
      />

      {/* Подтверждение входа в чужой бой */}
      <ConfirmDialog
        open={pendingMatch !== null}
        title="Принять бой?"
        icon="swords"
        message={
          pendingMatch ? (
            <>
              Бой против <strong>{pendingMatch.host.firstName || pendingMatch.host.username || 'соперника'}</strong>.
              Ставка <strong>{fmt(pendingMatch.wagerAmount)}</strong> спишется при старте боя
              (когда оба расставят флот).
              <span className="block mt-2 text-warning">
                ⚠️ Нужен стабильный интернет: при потере связи и пропуске ходов
                можно проиграть бой и потерять ставку.
              </span>
              Вы точно согласны?
            </>
          ) : null
        }
        confirmLabel="Да, в бой"
        cancelLabel="Отмена"
        busy={joiningLobby}
        onConfirm={() => void confirmAcceptMatch()}
        onCancel={() => { if (!joiningLobby) setPendingMatch(null); }}
      />

      {/* Модалька: система званий */}
      <RanksModal open={ranksForPlayer !== undefined} onClose={() => setRanksForPlayer(undefined)} highlightTitle={ranksForPlayer} />

      {/* Модалька «Недостаточно средств» */}
      <Modal open={showFundsModal} onClose={() => setShowFundsModal(false)} title="Недостаточно средств" icon="coins">
        <p className="text-main text-sm mb-5">
          Ставка <strong>{fmt(wager)}</strong> превышает ваш баланс ({fmt(balance)}).
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
                  <p className="text-main text-sm font-display">Ваш бой в списке · {formatMoney(myOpen.wager)}</p>
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

          {/* Пока первая загрузка не завершилась — скелетоны строк, без фильтров */}
          {matches === null ? (
            <SkeletonList rows={4} />
          ) : (
            <div className="space-y-3">
              {/* Фильтры */}
              <div className="card p-3 space-y-2">
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

              {/* Заголовок списка с количеством и сбросом фильтров */}
              {(query || filterMin || filterMax) && (
                <button
                  onClick={() => { setQuery(''); setFilterMin(''); setFilterMax(''); }}
                  className="text-[11px] text-danger font-display uppercase tracking-wide hover:underline"
                >
                  Сбросить фильтры
                </button>
              )}

              {/* Список боёв */}
              {loadingList ? (
                <SkeletonList rows={3} />
              ) : matches.length === 0 ? (
                <EmptyState
                  icon="compass"
                  title="Открытых боёв нет"
                  subtitle="Создайте свой — и соперник подключится к вам."
                  action={!myOpen && (
                    <button className="btn-primary px-5" onClick={openCreateModal}>
                      <Icon name="plus" size={16} /> Создать бой
                    </button>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  {[...matches]
                    .sort((a, b) => sortAsc ? a.wagerAmount - b.wagerAmount : b.wagerAmount - a.wagerAmount)
                    .map((m) => (
                      <MatchRow key={m.id} m={m} busy={busyId === m.id} onAccept={() => acceptMatch(m)} onCancel={cancelPublic} onShowRank={() => setRanksForPlayer(getRank(m.host.wins).title)} />
                    ))}
                </div>
              )}
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
            <button className="btn-primary w-full" onClick={joinPrivate} disabled={joinCode.trim().length < 4}>Открыть лобби</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, busy, onAccept, onCancel, onShowRank }: { m: OpenMatch; busy: boolean; onAccept: () => void; onCancel: () => void; onShowRank: () => void }) {
  const name = m.host.firstName || m.host.username || 'Капитан';
  const rank = getRank(m.host.wins);
  return (
    <div className="card p-3 flex items-center gap-3">
      <Avatar name={name} src={m.host.avatar} size={44} rounded="lg" />

      {/* Имя + звание */}
      <div className="flex-1 min-w-0">
        <p className="text-main text-sm font-display truncate leading-tight">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon name={rank.icon} size={12} className="text-muted shrink-0" />
          <span className="text-muted text-xs truncate">{rank.title} · {m.host.wins}W</span>
          <button onClick={onShowRank} className="text-danger text-[10px] font-display underline shrink-0 leading-none">
            ещё
          </button>
        </div>
      </div>

      {/* Ставка + действие */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="font-display text-main tabular-nums text-sm leading-none">{formatMoney(m.wagerAmount)}</span>
        {m.isMine ? (
          <button className="text-[11px] text-muted underline" onClick={onCancel}>снять</button>
        ) : (
          <button className="btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1" onClick={onAccept} disabled={busy}>
            {busy ? <Spinner size={11} /> : 'Вступить'}
          </button>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: IconName; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 rounded-lg text-sm font-display uppercase tracking-wider transition flex items-center justify-center gap-2',
        active ? 'bg-danger text-white shadow-[0_4px_12px_rgba(232,50,40,0.35)]' : 'text-muted hover:text-main',
      ].join(' ')}
    >
      <Icon name={icon} size={16} /> {children}
    </button>
  );
}

function matchesPlural(n: number): string {
  const a = n % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'боёв';
  if (b > 1 && b < 5) return 'боя';
  if (b === 1) return 'бой';
  return 'боёв';
}

function PrizeBreakdown({ wager }: { wager: number }) {
  const fmt = useMoney();
  const pool = wager * 2;
  const rake = +(pool * 0.05).toFixed(2);
  const win = +(pool - rake).toFixed(2);
  return (
    <div className="mt-4 grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
      <Cell label="Банк" value={fmt(pool)} />
      <Cell label="Комиссия" value={`−${fmt(rake)}`} accent />
      <Cell label="Победителю" value={fmt(win)} />
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
