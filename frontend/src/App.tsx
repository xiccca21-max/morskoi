import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { tgReady, getInitData, getStartParam, setHapticsGate } from './lib/telegram';
import { readSettings } from './stores/settings-store';
import { toast } from './stores/toast-store';
import { AuthAPI, UsersAPI } from './api/endpoints';
import { loadToken, setAuthToken } from './api/http';
import { getSocket, closeSocket } from './api/socket';
import { useAuthStore } from './stores/auth-store';
import { useMatchStore } from './stores/match-store';
import { useThemeStore } from './stores/theme-store';
import { playSound, unlockAudio } from './lib/audio';

import SplashScreen from './screens/SplashScreen';
import DevLoginScreen from './screens/DevLoginScreen';
import HomeScreen from './screens/HomeScreen';
import WalletScreen from './screens/WalletScreen';
import MatchmakingScreen from './screens/MatchmakingScreen';
import LobbyScreen from './screens/LobbyScreen';
import PlacementScreen from './screens/PlacementScreen';
import BattleScreen from './screens/BattleScreen';
import ResultScreen from './screens/ResultScreen';
import HistoryScreen from './screens/HistoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import HowItWorksScreen from './screens/HowItWorksScreen';
import RulesScreen from './screens/RulesScreen';
import { Layout } from './components/Layout';

function Protected({ children }: { children: JSX.Element }) {
  const { authenticated, ready } = useAuthStore();
  if (!ready) return <SplashScreen />;
  if (!authenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setReady = useAuthStore((s) => s.setReady);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const setMatchState = useMatchStore((s) => s.setState);
  const setLastAttack = useMatchStore((s) => s.setLastAttack);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);

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
  }, [theme]);

  // Вибрация подчиняется пользовательской настройке
  useEffect(() => {
    setHapticsGate(() => readSettings().haptics);
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
    (async () => {
      // 1. пробуем существующий токен
      const existing = loadToken();
      const initData = getInitData();
      try {
        if (initData) {
          // если есть Telegram — всегда апдейтим (или создаём)
          const { token, user } = await AuthAPI.login(initData);
          if (cancelled) return;
          setAuthToken(token);
          setUser({ ...user, balance: Number(user.balance) });
        } else if (existing) {
          // без Telegram — пробуем GET /users/me чтобы валидировать токен
          try {
            const me = await UsersAPI.me();
            setUser({ ...me, balance: Number(me.balance) });
          } catch {
            setAuthToken(null);
            setAuthError('Откройте приложение через Telegram');
          }
        } else {
          setAuthError('Откройте приложение через Telegram');
        }
      } catch (e: any) {
        setAuthError(e?.response?.data?.message ?? e?.message ?? 'Auth failed');
      } finally {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setReady, setUser]);

  // Подключение к сокету после логина + глобальные обработчики
  useEffect(() => {
    const unsub = useAuthStore.subscribe((s) => {
      if (s.authenticated) {
        const sock = getSocket();
        let wasConnected = false;
        // Дедупликация тостов: не показываем новый, пока предыдущий ещё виден
        let connState: 'connected' | 'disconnected' | null = null;
        let toastTimer: ReturnType<typeof setTimeout> | null = null;
        const showOnce = (msg: string, kind: 'success' | 'error', icon?: string, newState?: typeof connState) => {
          if (newState && newState === connState) return; // состояние не изменилось
          if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
          if (newState) connState = newState;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toast(msg, kind, icon as any);
          // блокируем повторный тост на время показа (2.6s)
          toastTimer = setTimeout(() => { toastTimer = null; }, 2700);
        };

        sock.on('connect_error', (e) => console.warn('socket connect_error', e.message));
        sock.on('connect', () => {
          if (wasConnected) showOnce('Соединение восстановлено', 'success', 'wave', 'connected');
          wasConnected = true;
          connState = 'connected';
        });
        sock.on('disconnect', (reason: string) => {
          if (reason !== 'io client disconnect') showOnce('Соединение потеряно. Переподключаемся…', 'error', undefined, 'disconnected');
        });
        sock.on('auth:error', () => {
          setAuthToken(null);
          window.location.reload();
        });

        sock.on('match:state', (state) => {
          setMatchState(state);
        });
        sock.on('match:attack', (a) => {
          setLastAttack({ ...a, ts: Date.now() });
        });
        sock.on('match:found', () => {
          // экран матчмейкинга сам подхватит из state
        });
        sock.on('match:finished', (e: any) => {
          // ResultScreen покажется автоматически по статусу
          if (e?.reason === 'afk') {
            const myId = useAuthStore.getState().user?.id;
            if (e.forfeitedBy && e.forfeitedBy === myId) {
              toast('Поражение: слишком много пропущенных ходов', 'error', 'skull');
            } else {
              toast('Соперник покинул бой — победа за вами!', 'success', 'trophy');
            }
          }
        });
        sock.on('match:turnTimeout', (e: any) => {
          const myId = useAuthStore.getState().user?.id;
          const missed: number = e?.missed ?? 1;
          if (e?.timedOut === myId) {
            toast(`Твой ход пропущен (${missed}/3)`, 'error', 'clock');
          } else {
            toast(`Соперник пропустил ход (${missed}/3)`, 'info', 'clock');
          }
        });
        sock.on('wallet:update', (b: number) => updateBalance(b));
      }
    });
    return () => {
      unsub();
      closeSocket();
    };
  }, [setMatchState, setLastAttack, updateBalance]);

  const authenticated = useAuthStore((s) => s.authenticated);
  const ready = useAuthStore((s) => s.ready);

  // Диплинк-приглашение: ?startapp=lobby_CODE → открыть лобби
  useEffect(() => {
    if (!ready || !authenticated || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const sp = getStartParam();
    if (sp && sp.startsWith('lobby_')) {
      const code = sp.slice('lobby_'.length).toUpperCase();
      if (code) navigate(`/lobby/${code}`);
    }
  }, [ready, authenticated, navigate]);

  if (authError && !authenticated) {
    return <DevLoginScreen />;
  }
  if (ready && !authenticated) {
    return <DevLoginScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/matchmaking" element={<MatchmakingScreen />} />
        <Route path="/lobby/:code" element={<LobbyScreen />} />
        <Route path="/placement/:matchId" element={<PlacementScreen />} />
        <Route path="/battle/:matchId" element={<BattleScreen />} />
        <Route path="/result/:matchId" element={<ResultScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/how-it-works" element={<HowItWorksScreen />} />
        <Route path="/rules" element={<RulesScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
