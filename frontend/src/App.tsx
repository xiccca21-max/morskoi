import { useEffect, useRef, useState, Suspense } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { tgReady, waitForInitData, isTelegramWebView, getInitData, persistInitData, getStartParam, clearStartParam, setHapticsGate } from './lib/telegram';
import { lazyWithRetry, prefetchScreens } from './lib/lazy-with-retry';
import { readSettings, useSettingsStore } from './stores/settings-store';
import { toast } from './stores/toast-store';
import { AuthAPI, UsersAPI, WalletAPI, ConfigAPI, GameAPI, MatchmakingAPI } from './api/endpoints';
import { useGameConfigStore } from './stores/game-config-store';
import { MatchFoundOverlay } from './components/MatchFoundOverlay';
import { loadToken, setAuthToken, getApiErrorMessage } from './api/http';
import { getSocket, closeSocket } from './api/socket';
import { useAuthStore } from './stores/auth-store';
import { useMatchStore } from './stores/match-store';
import { useThemeStore } from './stores/theme-store';
import { useNotifyPrefsStore } from './stores/notify-prefs-store';
import { syncNotifyFromServer } from './stores/notify-prefs-store';
import { newStreakAchievements } from './lib/achievements';
import { playSound, unlockAudio } from './lib/audio';

import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import { Layout } from './components/Layout';
import { ConsentGate } from './components/ConsentGate';
import { TelegramAuthError } from './components/TelegramAuthError';

const WalletScreen = lazyWithRetry(() => import('./screens/WalletScreen'));
const MatchmakingScreen = lazyWithRetry(() => import('./screens/MatchmakingScreen'));
const LobbyScreen = lazyWithRetry(() => import('./screens/LobbyScreen'));
const PlacementScreen = lazyWithRetry(() => import('./screens/PlacementScreen'));
const BattleScreen = lazyWithRetry(() => import('./screens/BattleScreen'));
const ResultScreen = lazyWithRetry(() => import('./screens/ResultScreen'));
const HistoryScreen = lazyWithRetry(() => import('./screens/HistoryScreen'));
const LeaderboardScreen = lazyWithRetry(() => import('./screens/LeaderboardScreen'));
const ProfileScreen = lazyWithRetry(() => import('./screens/ProfileScreen'));
const AchievementsScreen = lazyWithRetry(() => import('./screens/AchievementsScreen'));
const CosmeticsScreen = lazyWithRetry(() => import('./screens/CosmeticsScreen'));
const SettingsScreen = lazyWithRetry(() => import('./screens/SettingsScreen'));
const HowItWorksScreen = lazyWithRetry(() => import('./screens/HowItWorksScreen'));
const PlayerScreen = lazyWithRetry(() => import('./screens/PlayerScreen'));
const RulesScreen = lazyWithRetry(() => import('./screens/RulesScreen'));
const ChallengeScreen = lazyWithRetry(() => import('./screens/ChallengeScreen'));
const TrainingScreen = lazyWithRetry(() => import('./screens/TrainingScreen'));

function prefetchGameplayChunks() {
  prefetchScreens([
    () => import('./screens/MatchmakingScreen'),
    () => import('./screens/BattleScreen'),
    () => import('./screens/PlacementScreen'),
    () => import('./screens/LobbyScreen'),
  ]);
}

function LazyScreen({ children }: { children: JSX.Element }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/**
 * Авто-сброс залипшего кэша Telegram WebView. Клиент знает версию, с которой собран
 * (VITE_BUILD_SHA), сервер отдаёт свою в /api/config. Если версии разошлись — значит
 * Telegram отдал старый закэшированный фронт. Один раз чистим кэши и перезагружаемся.
 * sessionStorage-гард не даёт зациклиться, если перезагрузка не помогла.
 */
function maybeReloadStaleClient(serverBuild: string | null) {
  const clientBuild = import.meta.env.VITE_BUILD_SHA as string | undefined;
  if (!serverBuild || !clientBuild || clientBuild === 'dev' || serverBuild === clientBuild) {
    return;
  }
  const KEY = 'nc_reloaded_for_build';
  try {
    if (sessionStorage.getItem(KEY) === serverBuild) return;
    sessionStorage.setItem(KEY, serverBuild);
  } catch {
    /* приватный режим — всё равно пробуем перезагрузиться один раз */
  }
  const done = () => window.location.reload();
  if (typeof caches !== 'undefined') {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(done, done);
  } else {
    done();
  }
}

function Protected({ children }: { children: JSX.Element }) {
  const authenticated = useAuthStore((s) => s.authenticated);
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
  const [serverBuild, setServerBuild] = useState<string | null>(null);
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

  useEffect(() => {
    if (!matchFound.open || !matchFound.matchId) return;
    const id = matchFound.matchId;
    const t = setTimeout(() => {
      const path = window.location.pathname;
      const cur = useMatchStore.getState().state;
      const finished = cur?.matchId === id && (cur.gameStatus === 'FINISHED' || cur.status === 'FINISHED');
      if (!finished && !path.includes('/placement/') && !path.includes('/battle/') && !path.includes('/result/')) {
        navigate(`/placement/${id}`);
      }
      requestAnimationFrame(() => setMatchFound({ open: false }));
    }, 1800);
    return () => clearTimeout(t);
  }, [matchFound.open, matchFound.matchId, navigate]);

  useEffect(() => {
    ConfigAPI.get().then(applyGameConfig).catch(() => {});
  }, [applyGameConfig]);

  useEffect(() => {
    return useSettingsStore.subscribe((s) => {
      setHapticsGate(() => s.haptics);
    });
  }, []);

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

  useEffect(() => {
    setHapticsGate(() => readSettings().haptics);
  }, []);

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
    ConfigAPI.get()
      .then((c) => {
        const sBuild = (c as { build?: string }).build ?? null;
        setServerBuild(sBuild);
        maybeReloadStaleClient(sBuild);
      })
      .catch(() => setServerBuild(null));
  }, [authAttempt]);

  useEffect(() => {
    tgReady();
    let cancelled = false;
    setReady(false);
    setAuthError(null);
    (async () => {
      const initDataTimeout = authAttempt > 0 ? 20000 : 15000;

      if (!isTelegramWebView()) {
        setAuthError('Откройте приложение через Telegram');
        setReady(true);
        return;
      }

      const applyLoginResult = (res: Awaited<ReturnType<typeof AuthAPI.login>>) => {
        setAuthToken(res.token);
        setUser({ ...res.user, balance: Number(res.user.balance) });
        syncNotifyFromServer(res.user);
        prefetchGameplayChunks();
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

      const applyMe = (me: Awaited<ReturnType<typeof UsersAPI.me>>) => {
        setUser({ ...me, balance: Number(me.balance) });
        syncNotifyFromServer(me);
        prefetchGameplayChunks();
      };

      try {
        const existing = loadToken();
        // JWT-проверка параллельно с ожиданием initData — быстрее повторное открытие.
        const [initData, meEarly] = await Promise.all([
          waitForInitData(initDataTimeout),
          existing
            ? UsersAPI.me().catch(() => null as Awaited<ReturnType<typeof UsersAPI.me>> | null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (existing && initData) {
          persistInitData(initData);
          try {
            const me = meEarly ?? (await UsersAPI.me());
            if (cancelled) return;
            applyMe(me);
            return;
          } catch {
            setAuthToken(null);
          }
        }

        if (initData) {
          persistInitData(initData);
          const res = await AuthAPI.login(initData);
          if (cancelled) return;
          applyLoginResult(res);
          return;
        }

        if (existing) {
          try {
            const me = meEarly ?? (await UsersAPI.me());
            if (cancelled) return;
            if (me) {
              applyMe(me);
              return;
            }
          } catch {
            setAuthToken(null);
          }
        }

        if (existing && getInitData()) {
          try {
            const me = await UsersAPI.me();
            if (cancelled) return;
            applyMe(me);
            return;
          } catch {
            setAuthToken(null);
          }
        }

        if (isTelegramWebView()) {
          setAuthError('Telegram не передал данные авторизации. Закройте приложение и откройте снова через «⚔️ В бой» в боте.');
        } else {
          setAuthError('Откройте приложение через Telegram');
        }
      } catch (e: any) {
        if (cancelled) return;
        const status = e?.response?.status;
        const msg = getApiErrorMessage(e);
        if (!e?.response) {
          setAuthError('Сервер недоступен. Проверьте интернет и нажмите «Повторить».');
        } else if (status >= 500) {
          setAuthError('Сервер временно недоступен. Попробуйте через минуту.');
        } else if (status === 401 && isTelegramWebView()) {
          setAuthError(
            msg ||
              'Сессия истекла. Закройте приложение и откройте снова через «⚔️ В бой» в боте.',
          );
        } else {
          setAuthError(msg || 'Не удалось авторизоваться');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setReady, setUser, patchUser, authAttempt]);

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

    const onConnectError = (e: Error) => {
      if (import.meta.env.DEV) console.warn('socket connect_error', e.message);
    };
    const onConnect = () => {
      if (wasConnected) showOnce('Соединение восстановлено', 'success', 'wave', 'connected');
      wasConnected = true;
      connState = 'connected';
    };
    const onDisconnect = (reason: string) => {
      if (reason !== 'io client disconnect') showOnce('Соединение потеряно. Переподключаемся…', 'error', undefined, 'disconnected');
    };
    const onAuthError = () => {
      setAuthToken(null);
      closeSocket();
      setReady(false);
      setAuthAttempt((a) => a + 1);
    };
    const patchFinished = (matchId: string, winnerId?: string | null) => {
      const cur = useMatchStore.getState().state;
      if (!cur || cur.matchId !== matchId) return;
      setMatchState({
        ...cur,
        status: 'FINISHED',
        gameStatus: 'FINISHED',
        winnerId: winnerId ?? cur.winnerId ?? null,
      });
    };
    const goResultIfInMatch = (matchId: string) => {
      const path = window.location.pathname;
      if (
        path.includes(`/battle/${matchId}`) ||
        path.includes(`/placement/${matchId}`) ||
        (path.startsWith('/battle/') && useMatchStore.getState().state?.matchId === matchId) ||
        (path.startsWith('/placement/') && useMatchStore.getState().state?.matchId === matchId)
      ) {
        navigate(`/result/${matchId}`, { replace: true });
      }
    };
    const onState = (state: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMatchState(state);
      if (state?.gameStatus === 'FINISHED' && state?.matchId) {
        goResultIfInMatch(state.matchId);
      }
    };
    const onAttack = (a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setLastAttack({ ...a, ts: Date.now() });
      if (a?.gameStatus === 'FINISHED') {
        const mid = useMatchStore.getState().state?.matchId;
        if (mid) {
          patchFinished(mid, a.winnerId);
          goResultIfInMatch(mid);
        }
      }
    };
    const onFinished = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e?.matchId) {
        patchFinished(e.matchId, e.winnerId);
        goResultIfInMatch(e.matchId);
      }
      if (e?.reason === 'afk') {
        const myId = useAuthStore.getState().user?.id;
        if (e.forfeitedBy === myId) toast('Поражение: слишком много пропущенных ходов', 'error', 'skull');
        else toast('Соперник покинул бой — победа за вами!', 'success', 'trophy');
      }
    };
    const onWalletUpdate = (payload: number | { balance: number; withdrawable: number }) => {
      if (typeof payload === 'number') {
        updateBalance(payload);
        WalletAPI.balance().then(updateWallet).catch(() => {});
        return;
      }
      updateWallet({ balance: payload.balance, withdrawable: payload.withdrawable });
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
      const path = window.location.pathname;
      const cur = useMatchStore.getState().state;
      if (path.includes('/result/') || path.includes('/battle/')) return;
      if (cur && (cur.gameStatus === 'FINISHED' || cur.status === 'FINISHED')) return;
      playSound('win');
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
  }, [authenticated, setMatchState, setLastAttack, updateBalance, updateWallet, clearMatch, navigate, setReady]);

  const ready = useAuthStore((s) => s.ready);

  useEffect(() => {
    if (!ready || !authenticated || deepLinkHandled.current) return;
    const sp = getStartParam();
    if (!sp) return;
    deepLinkHandled.current = true;
    const isLobbyCode = (s: string) => /^[A-Z0-9]{4,12}$/.test(s);
    const isId = (s: string) => /^[A-Za-z0-9_-]{6,40}$/.test(s);
    clearStartParam();
    if (sp.startsWith('lobby_')) {
      const code = sp.slice('lobby_'.length).toUpperCase();
      if (isLobbyCode(code)) navigate(`/lobby/${code}`, { replace: true });
    } else if (sp.startsWith('challenge_')) {
      const hostId = sp.slice('challenge_'.length);
      if (isId(hostId)) navigate(`/challenge/${hostId}`, { replace: true });
    } else if (sp.startsWith('ref_')) {
      navigate('/home', { replace: true });
    } else if (sp === 'wallet') {
      navigate('/wallet');
    } else if (sp.startsWith('profile_')) {
      const id = sp.slice('profile_'.length);
      if (isId(id)) navigate(`/player/${id}`);
    }
  }, [ready, authenticated, navigate]);

  useEffect(() => {
    if (!ready || !authenticated || resumeHandled.current) return;
    resumeHandled.current = true;
    if (getStartParam()) return;
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

  if (!ready) {
    return <SplashScreen />;
  }

  if (ready && !authenticated) {
    return (
      <TelegramAuthError
        message={authError ?? (isTelegramWebView()
          ? 'Не удалось авторизоваться через Telegram'
          : 'Игра доступна только в Telegram. Откройте через бота «⚔️ В бой».')}
        build={serverBuild}
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
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/wallet" element={<LazyScreen><WalletScreen /></LazyScreen>} />
        <Route path="/matchmaking" element={<LazyScreen><MatchmakingScreen /></LazyScreen>} />
        <Route path="/lobby/:code" element={<LazyScreen><LobbyScreen /></LazyScreen>} />
        <Route path="/placement/:matchId" element={<LazyScreen><PlacementScreen /></LazyScreen>} />
        <Route path="/battle/:matchId" element={<LazyScreen><BattleScreen /></LazyScreen>} />
        <Route path="/result/:matchId" element={<LazyScreen><ResultScreen /></LazyScreen>} />
        <Route path="/history" element={<LazyScreen><HistoryScreen /></LazyScreen>} />
        <Route path="/leaderboard" element={<LazyScreen><LeaderboardScreen /></LazyScreen>} />
        <Route path="/profile" element={<LazyScreen><ProfileScreen /></LazyScreen>} />
        <Route path="/achievements" element={<LazyScreen><AchievementsScreen /></LazyScreen>} />
        <Route path="/cosmetics" element={<LazyScreen><CosmeticsScreen /></LazyScreen>} />
        <Route path="/player/:id" element={<LazyScreen><PlayerScreen /></LazyScreen>} />
        <Route path="/challenge/:id" element={<LazyScreen><ChallengeScreen /></LazyScreen>} />
        <Route path="/settings" element={<LazyScreen><SettingsScreen /></LazyScreen>} />
        <Route path="/how-it-works" element={<LazyScreen><HowItWorksScreen /></LazyScreen>} />
        <Route path="/rules" element={<LazyScreen><RulesScreen /></LazyScreen>} />
        <Route path="/training" element={<LazyScreen><TrainingScreen /></LazyScreen>} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    </>
  );
}
