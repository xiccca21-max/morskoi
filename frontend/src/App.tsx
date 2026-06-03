import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { tgReady, waitForInitData, isTelegramWebView, getStartParam, setHapticsGate } from './lib/telegram';
import { readSettings, useSettingsStore } from './stores/settings-store';
import { toast } from './stores/toast-store';
import { AuthAPI, UsersAPI, WalletAPI, RatesAPI, ConfigAPI, GameAPI, MatchmakingAPI } from './api/endpoints';
import { useGameConfigStore } from './stores/game-config-store';
import { MatchFoundOverlay } from './components/MatchFoundOverlay';
import { useCurrencyStore } from './stores/currency-store';
import { loadToken, setAuthToken } from './api/http';
import { getSocket, closeSocket } from './api/socket';
import { useAuthStore } from './stores/auth-store';
import { useMatchStore } from './stores/match-store';
import { useThemeStore } from './stores/theme-store';
import { useNotifyPrefsStore } from './stores/notify-prefs-store';
import { syncNotifyFromServer } from './stores/notify-prefs-store';
import { newStreakAchievements } from './lib/achievements';
import { playSound, unlockAudio } from './lib/audio';

import SplashScreen from './screens/SplashScreen';
import { Layout } from './components/Layout';
import { ConsentGate } from './components/ConsentGate';
import { TelegramAuthError } from './components/TelegramAuthError';
import { Spinner } from './components/Spinner';

const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const WalletScreen = lazy(() => import('./screens/WalletScreen'));
const MatchmakingScreen = lazy(() => import('./screens/MatchmakingScreen'));
const LobbyScreen = lazy(() => import('./screens/LobbyScreen'));
const PlacementScreen = lazy(() => import('./screens/PlacementScreen'));
const BattleScreen = lazy(() => import('./screens/BattleScreen'));
const ResultScreen = lazy(() => import('./screens/ResultScreen'));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen'));
const LeaderboardScreen = lazy(() => import('./screens/LeaderboardScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const HowItWorksScreen = lazy(() => import('./screens/HowItWorksScreen'));
const PlayerScreen = lazy(() => import('./screens/PlayerScreen'));
const RulesScreen = lazy(() => import('./screens/RulesScreen'));
const ChallengeScreen = lazy(() => import('./screens/ChallengeScreen'));

function LazyScreen({ children }: { children: JSX.Element }) {
  return <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>{children}</Suspense>;
}

function Protected({ children }: { children: JSX.Element }) {
  const { authenticated, ready } = useAuthStore();
  if (!ready) return <SplashScreen />;
  if (!authenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const patchUser = useAuthStore((s) => s.patchUser);
  const setReady = useAuthStore((s) => s.setReady);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const updateWallet = useAuthStore((s) => s.updateWallet);
  const user = useAuthStore((s) => s.user);
  const setMatchState = useMatchStore((s) => s.setState);
  const setLastAttack = useMatchStore((s) => s.setLastAttack);
  const clearMatch = useMatchStore((s) => s.clear);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);
  const resumeHandled = useRef(false);
  const applyGameConfig = useGameConfigStore((s) => s.apply);
  const [matchFound, setMatchFound] = useState<{
    open: boolean;
    wager?: number;
    matchId?: string;
    oppName?: string;
    oppAvatar?: string | null;
    meName?: string;
    meAvatar?: string | null;
  }>({
    open: false,
  });

  // Авто-закрытие оверлея «Соперник найден» + переход к расстановке.
  // Таймер привязан к самому состоянию оверлея, поэтому гарантированно
  // отрабатывает и не зависит от пересоздания сокет-эффекта.
  useEffect(() => {
    if (!matchFound.open || !matchFound.matchId) return;
    const id = matchFound.matchId;
    const t = setTimeout(() => {
      setMatchFound({ open: false });
      const path = window.location.pathname;
      if (!path.includes('/placement/') && !path.includes('/battle/')) {
        navigate(`/placement/${id}`);
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [matchFound.open, matchFound.matchId, navigate]);

  // Публичные игровые константы с сервера
  useEffect(() => {
    ConfigAPI.get().then(applyGameConfig).catch(() => {});
  }, [applyGameConfig]);

  // Подписка на изменения haptics в настройках → обновляем gate без перезагрузки
  useEffect(() => {
    return useSettingsStore.subscribe((s) => {
      setHapticsGate(() => s.haptics);
    });
  }, []);

  // Разблокировать AudioContext при первом касании (браузер требует user gesture)
  useEffect(() => {
    const unlock = () => { unlockAudio(); };
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Синхронизируем цвет шапки/фона Telegram и meta theme-color с темой
    requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement);
      const panel = styles.getPropertyValue('--c-panel').trim();
      const base = styles.getPropertyValue('--c-base').trim();
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && base) meta.setAttribute('content', base);
      const tg: any = (window as any).Telegram?.WebApp;
      try {
        tg?.setHeaderColor?.(panel || base);
        tg?.setBackgroundColor?.(base);
      } catch { /* старые версии Telegram */ }
    });
  }, [theme]);

  // Вибрация подчиняется пользовательской настройке
  useEffect(() => {
    setHapticsGate(() => readSettings().haptics);
  }, []);

  // Подтягиваем живые курсы валют (USDT→RUB и т.д.) и обновляем раз в 5 минут
  useEffect(() => {
    const apply = useCurrencyStore.getState().applyLiveRates;
    const load = () => RatesAPI.get().then((r) => apply(r)).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Глобальный слушатель кликов по кнопкам
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a')) {
        playSound('click');
      }
    };
    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, []);

  useEffect(() => {
    tgReady();
    let cancelled = false;
    setReady(false);
    setAuthError(null);
    (async () => {
      const initDataTimeout = authAttempt > 0 ? 15000 : 10000;

      if (!isTelegramWebView()) {
        setAuthError('Откройте приложение через Telegram');
        setReady(true);
        return;
      }

      const applyLoginResult = (res: Awaited<ReturnType<typeof AuthAPI.login>>) => {
        setAuthToken(res.token);
        setUser({ ...res.user, balance: Number(res.user.balance) });
        syncNotifyFromServer(res.user);
        if (res.dailyBonus?.claimed) {
          const prevStreak = Math.max(0, (res.dailyBonus.streak ?? 1) - 1);
          const nextStreak = res.dailyBonus.streak ?? 1;
          toast(`Стрик входа: ${nextStreak} дн. подряд`, 'success', 'anchor');
          if (res.dailyBonus.reward) {
            setTimeout(() => toast(res.dailyBonus!.reward as string, 'success', 'trophy'), 300);
          }
          playSound('win');
          for (const a of newStreakAchievements(prevStreak, nextStreak)) {
            setTimeout(() => toast(`Достижение: ${a.title}`, 'success', a.icon), 600);
          }
          patchUser({ loginStreak: nextStreak });
        }
      };

      try {
        // 1. Сохранённый JWT — не ждём initData (Telegram WebView часто сбрасывает sessionStorage).
        const existing = loadToken();
        if (existing) {
          try {
            const me = await UsersAPI.me();
            if (cancelled) return;
            setUser({ ...me, balance: Number(me.balance) });
            syncNotifyFromServer(me);
            return;
          } catch {
            setAuthToken(null);
          }
        }

        // 2. Свежий initData от Telegram.
        const initData = await waitForInitData(initDataTimeout);
        if (cancelled) return;

        if (initData) {
          const res = await AuthAPI.login(initData);
          if (cancelled) return;
          applyLoginResult(res);
        } else if (isTelegramWebView()) {
          setAuthError('Telegram не передал данные авторизации. Закройте приложение и откройте снова через «⚔️ В бой» в боте.');
        } else {
          setAuthError('Откройте приложение через Telegram');
        }
      } catch (e: any) {
        if (cancelled) return;
        const status = e?.response?.status;
        const msg = e?.response?.data?.message ?? e?.message;
        if (!e?.response) {
          setAuthError('Сервер недоступен. Проверьте интернет и нажмите «Повторить».');
        } else if (status >= 500) {
          setAuthError('Сервер временно недоступен. Попробуйте через минуту.');
        } else if (status === 401 && isTelegramWebView()) {
          setAuthError('Сессия истекла. Закройте приложение и откройте снова через «⚔️ В бой» в боте.');
        } else {
          setAuthError(typeof msg === 'string' ? msg : 'Не удалось авторизоваться');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setReady, setUser, patchUser, authAttempt]);

  // Подключение к сокету после логина + глобальные обработчики (регистрируем один раз)
  const authenticated = useAuthStore((s) => s.authenticated);
  useEffect(() => {
    if (!authenticated) return;
    const sock = getSocket();
    let wasConnected = false;
    let connState: 'connected' | 'disconnected' | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    const showOnce = (msg: string, kind: 'success' | 'error', icon?: string, newState?: typeof connState) => {
      if (newState && newState === connState) return;
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (newState) connState = newState;
      toast(msg, kind, icon as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      toastTimer = setTimeout(() => { toastTimer = null; }, 2700);
    };

    const onConnectError = (e: Error) => console.warn('socket connect_error', e.message);
    const onConnect = () => {
      if (wasConnected) showOnce('Соединение восстановлено', 'success', 'wave', 'connected');
      wasConnected = true;
      connState = 'connected';
    };
    const onDisconnect = (reason: string) => {
      if (reason !== 'io client disconnect') showOnce('Соединение потеряно. Переподключаемся…', 'error', undefined, 'disconnected');
    };
    const onAuthError = () => { setAuthToken(null); window.location.reload(); };
    const onState = (state: any) => setMatchState(state); // eslint-disable-line @typescript-eslint/no-explicit-any
    const onAttack = (a: any) => setLastAttack({ ...a, ts: Date.now() }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const onFinished = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e?.reason === 'afk') {
        const myId = useAuthStore.getState().user?.id;
        if (e.forfeitedBy === myId) toast('Поражение: слишком много пропущенных ходов', 'error', 'skull');
        else toast('Соперник покинул бой — победа за вами!', 'success', 'trophy');
      }
    };
    // match:turnTimeout обрабатывается только в BattleScreen чтобы избежать дублирования
    const onWalletUpdate = (b: number) => {
      updateBalance(b);
      // Подтягиваем withdrawable (сокет шлёт только баланс)
      WalletAPI.balance().then(updateWallet).catch(() => {});
    };
    const onRematchReq = (e: any) => { // eslint-disable-line
      const myId = useAuthStore.getState().user?.id;
      if (!myId || e?.by === myId) return;
      if (!useNotifyPrefsStore.getState().rematch) return;
      toast('Соперник предлагает реванш!', 'info', 'swords');
      playSound('click');
    };
    const onCancelled = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      clearMatch();
      if (e?.reason === 'placement_timeout') {
        toast('Бой отменён: соперник не расставил флот вовремя', 'info', 'clock');
      } else {
        toast('Бой отменён', 'info');
      }
      navigate('/home');
    };

    sock.on('connect_error', onConnectError);
    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('auth:error', onAuthError);
    sock.on('match:state', onState);
    sock.on('match:attack', onAttack);
    sock.on('match:finished', onFinished);
    sock.on('match:rematchRequested', onRematchReq);
    sock.on('match:cancelled', onCancelled);
    sock.on('wallet:update', onWalletUpdate);
    const onMatchFound = (e: any) => { // eslint-disable-line
      if (!e?.matchId) return;
      playSound('win');
      // Только показываем оверлей. Авто-закрытие и переход к расстановке
      // живут в отдельном эффекте (ниже), чтобы их таймер не сбрасывался
      // при пересоздании сокет-эффекта — иначе оверлей «зависает».
      setMatchFound((prev) =>
        prev.open && prev.matchId === e.matchId
          ? prev
          : {
              open: true,
              wager: e.wagerAmount,
              matchId: e.matchId,
              oppName: e.opponentName,
              oppAvatar: e.opponentAvatar,
              meName: e.meName,
              meAvatar: e.meAvatar,
            },
      );
    };
    sock.on('match:found', onMatchFound);

    return () => {
      sock.off('connect_error', onConnectError);
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('auth:error', onAuthError);
      sock.off('match:state', onState);
      sock.off('match:attack', onAttack);
      sock.off('match:finished', onFinished);
      sock.off('match:rematchRequested', onRematchReq);
      sock.off('match:cancelled', onCancelled);
      sock.off('wallet:update', onWalletUpdate);
      sock.off('match:found', onMatchFound);
      if (toastTimer) clearTimeout(toastTimer);
      closeSocket();
    };
  }, [authenticated, setMatchState, setLastAttack, updateBalance, updateWallet, clearMatch, navigate]);

  const ready = useAuthStore((s) => s.ready);

  // Диплинки: lobby_CODE, wallet, profile_ID
  useEffect(() => {
    if (!ready || !authenticated || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const sp = getStartParam();
    if (!sp) return;
    if (sp.startsWith('lobby_')) {
      const code = sp.slice('lobby_'.length).toUpperCase();
      if (code) navigate(`/lobby/${code}`);
    } else if (sp.startsWith('challenge_')) {
      const hostId = sp.slice('challenge_'.length);
      if (hostId) {
        MatchmakingAPI.lobbyByHost(hostId)
          .then((l) => navigate(`/lobby/${l.code}`, { replace: true }))
          .catch(() => toast('Приглашение устарело. Попроси друга отправить новую ссылку.', 'error'));
      }
    } else if (sp === 'wallet') {
      navigate('/wallet');
    } else if (sp.startsWith('profile_')) {
      const id = sp.slice('profile_'.length);
      if (id) navigate(`/player/${id}`);
    }
  }, [ready, authenticated, navigate]);

  // Авто-возврат в активный бой после перезапуска мини-аппа.
  // Идёт ход (IN_PROGRESS) — каждый пропущенный ход грозит AFK-поражением и
  // потерей ставки, поэтому сразу возвращаем игрока в бой. Для PLACEMENT
  // оставляем мягкую кнопку «Вернуться в бой» на главной (там штрафа нет).
  useEffect(() => {
    if (!ready || !authenticated || resumeHandled.current) return;
    resumeHandled.current = true;
    GameAPI.active()
      .then((m) => {
        if (!m?.matchId) return;
        setMatchState(m);
        const path = window.location.pathname;
        const inGame = path.includes('/placement/') || path.includes('/battle/') || path.includes('/result/');
        if (m.gameStatus === 'IN_PROGRESS' && !inGame) {
          navigate(`/battle/${m.matchId}`);
        }
      })
      .catch(() => {});
  }, [ready, authenticated, navigate, setMatchState]);

  if (ready && !authenticated) {
    return (
      <TelegramAuthError
        message={authError ?? (isTelegramWebView()
          ? 'Не удалось авторизоваться через Telegram'
          : 'Игра доступна только в Telegram. Откройте через бота «⚔️ В бой».')}
        onRetry={() => setAuthAttempt((a) => a + 1)}
      />
    );
  }

  if (authenticated && user && user.agreedToTerms === false) {
    return <ConsentGate />;
  }

  return (
    <>
    <MatchFoundOverlay
      open={matchFound.open}
      wager={matchFound.wager}
      oppName={matchFound.oppName}
      oppAvatar={matchFound.oppAvatar}
      meName={matchFound.meName}
      meAvatar={matchFound.meAvatar}
    />
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/home" element={<LazyScreen><HomeScreen /></LazyScreen>} />
        <Route path="/wallet" element={<LazyScreen><WalletScreen /></LazyScreen>} />
        <Route path="/matchmaking" element={<LazyScreen><MatchmakingScreen /></LazyScreen>} />
        <Route path="/lobby/:code" element={<LazyScreen><LobbyScreen /></LazyScreen>} />
        <Route path="/placement/:matchId" element={<LazyScreen><PlacementScreen /></LazyScreen>} />
        <Route path="/battle/:matchId" element={<LazyScreen><BattleScreen /></LazyScreen>} />
        <Route path="/result/:matchId" element={<LazyScreen><ResultScreen /></LazyScreen>} />
        <Route path="/history" element={<LazyScreen><HistoryScreen /></LazyScreen>} />
        <Route path="/leaderboard" element={<LazyScreen><LeaderboardScreen /></LazyScreen>} />
        <Route path="/profile" element={<LazyScreen><ProfileScreen /></LazyScreen>} />
        <Route path="/player/:id" element={<LazyScreen><PlayerScreen /></LazyScreen>} />
        <Route path="/challenge/:id" element={<LazyScreen><ChallengeScreen /></LazyScreen>} />
        <Route path="/settings" element={<LazyScreen><SettingsScreen /></LazyScreen>} />
        <Route path="/how-it-works" element={<LazyScreen><HowItWorksScreen /></LazyScreen>} />
        <Route path="/rules" element={<LazyScreen><RulesScreen /></LazyScreen>} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    </>
  );
}
