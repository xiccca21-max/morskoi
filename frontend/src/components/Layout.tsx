import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { Icon, IconName } from './Icon';
import { AnimatedNumber } from './AnimatedNumber';
import { Toaster } from './Toaster';
import { OfflineBanner } from './OfflineBanner';
import { SoundToggle } from './SoundToggle';
import { formatCompactMoney, formatMoney } from '../lib/format';
import { useCurrencyStore } from '../stores/currency-store';
import { tgBackButtonHide, tgClosingConfirmation, tgVerticalSwipes, tgOpenLink, tgHaptic } from '../lib/telegram';

const SUPPORT_URL = (import.meta.env.VITE_SUPPORT_URL as string) || 'https://t.me/Naval_pay_manager';

/** Экраны, где не дёргаем маршрут из-за активного матча (нет петли «Назад» ↔ бой). */
const SOFT_ROUTES = /^\/(home|wallet|settings|profile|achievements|cosmetics|leaderboard|history|matchmaking|lobby)(\/|$)/;

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const navigate = useNavigate();
  const loc = useLocation();
  useCurrencyStore((s) => s.currency);
  useCurrencyStore((s) => s.ratesVersion);

  const [scrolled, setScrolled] = useState(false);
  const lastAutoNav = useRef<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [loc.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // На обычных экранах — только «Закрыть», без мигания BackButton
  useEffect(() => {
    const p = loc.pathname;
    const inGame =
      p.startsWith('/placement') || p.startsWith('/battle') || p.startsWith('/result');
    if (!inGame) {
      tgBackButtonHide();
      tgClosingConfirmation(false);
      tgVerticalSwipes(true);
    }
  }, [loc.pathname]);

  useEffect(() => {
    if (!match) {
      lastAutoNav.current = null;
      return;
    }
    const p = loc.pathname;
    const finished = match.status === 'FINISHED' || match.gameStatus === 'FINISHED';
    const inProgress = match.gameStatus === 'IN_PROGRESS' || match.status === 'IN_PROGRESS';
    const placing = !finished && !inProgress && match.gameStatus === 'PLACEMENT';

    let target: string | null = null;
    if (finished && !p.startsWith('/result') && !SOFT_ROUTES.test(p)) {
      target = `/result/${match.matchId}`;
    } else if (inProgress && !p.startsWith('/battle') && !SOFT_ROUTES.test(p)) {
      target = `/battle/${match.matchId}`;
    } else if (placing && !p.startsWith('/placement') && !SOFT_ROUTES.test(p)) {
      target = `/placement/${match.matchId}`;
    }

    if (target && lastAutoNav.current !== target) {
      lastAutoNav.current = target;
      navigate(target, { replace: true });
    }
  }, [match?.matchId, match?.gameStatus, match?.status, loc.pathname, navigate]);

  const hideNav =
    loc.pathname.startsWith('/placement') ||
    loc.pathname.startsWith('/battle') ||
    loc.pathname.startsWith('/result') ||
    loc.pathname.startsWith('/lobby');

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Toaster />
      <OfflineBanner />

      <header
        className={[
          'px-4 flex items-center justify-between sticky top-0 z-30 border-b border-line/40 backdrop-blur-xl transition-shadow duration-300',
          scrolled ? 'shadow-[0_4px_24px_rgba(0,0,0,0.25)]' : '',
        ].join(' ')}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top)',
          background: 'rgba(var(--c-panel-rgb) / 0.82)',
        }}
      >
        <NavLink to="/home" className="flex items-center text-main" aria-label="На палубу">
          <span className="logo-pulse font-display text-[18px] font-bold uppercase tracking-[0.2em] text-main">Морской&nbsp;Бой</span>
        </NavLink>

        <div className="flex items-center gap-2">
          <SoundToggle />
          <button
            type="button"
            onClick={() => { tgHaptic('light'); tgOpenLink(SUPPORT_URL); }}
            aria-label="Поддержка"
            className="flex items-center justify-center w-9 h-9 rounded-xl text-main shrink-0 active:scale-90 transition"
            style={{
              background: 'rgba(var(--c-panel-rgb) / 0.8)',
              border: '1px solid rgba(var(--c-line-rgb) / 0.6)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Icon name="headset" size={18} />
          </button>
          <NavLink
            to="/wallet"
            aria-label="Пополнить баланс"
            onClick={() => tgHaptic('light')}
            className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl text-main transition"
            style={{
              background: 'rgba(var(--c-panel-rgb) / 0.8)',
              border: '1px solid rgba(var(--c-line-rgb) / 0.6)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <span className="font-display text-sm tabular-nums">
              <AnimatedNumber value={user?.balance ?? 0} formatter={formatMoney} />
            </span>
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-white shrink-0"
              style={{ background: 'var(--c-danger)' }}
            >
              <Icon name="plus" size={13} />
            </span>
          </NavLink>
        </div>
      </header>

      <main
        className="flex-1 px-4 py-5"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>

      {!hideNav && (
        <nav
          className="fixed bottom-0 inset-x-0 z-40 px-2 py-2 border-t border-line/40 backdrop-blur-xl"
          style={{
            paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
            background: 'rgba(var(--c-panel-rgb) / 0.88)',
          }}
        >
          <ul className="flex items-end justify-around">
            <Tab to="/home" icon="grid" label="Палуба" />
            <Tab to="/matchmaking" icon="swords" label="В бой" />
            <BalanceTab balance={user?.balance ?? 0} />
            <Tab to="/history" icon="scroll" label="Журнал" />
            <Tab to="/profile" icon="user" label="Каюта" />
          </ul>
        </nav>
      )}
    </div>
  );
}

function BalanceTab({ balance }: { balance: number }) {
  return (
    <li className="flex-1 flex justify-center">
      <NavLink to="/wallet" aria-label="Баланс" className="flex flex-col items-center gap-1 -mt-7">
        {({ isActive }) => (
          <>
            <div
              className="flex flex-col items-center justify-center text-white border-[3px] border-panel"
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'linear-gradient(145deg, #e83228, #ff5548, #c42820)',
                boxShadow: isActive
                  ? '0 6px 24px rgba(232,50,40,0.65), 0 0 0 2px rgba(232,50,40,0.3)'
                  : '0 5px 18px rgba(232,50,40,0.50)',
              }}
            >
              <Icon name="coins" size={17} />
              <span className="font-display text-[10px] leading-none tabular-nums mt-0.5">
                <AnimatedNumber value={balance} formatter={formatCompactMoney} />
              </span>
            </div>
            <span className={['text-[10px] font-display uppercase tracking-wider', isActive ? 'text-danger' : 'text-muted'].join(' ')}>
              Баланс
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}

function Tab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <li className="flex-1">
      <NavLink
        to={to}
        className={({ isActive }) =>
          [
            'relative flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors text-[10px] font-display uppercase tracking-wider',
            isActive ? 'text-main bg-danger/10' : 'text-muted',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            <Icon name={icon} size={20} />
            <span>{label}</span>
            {isActive && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-danger" />
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}
