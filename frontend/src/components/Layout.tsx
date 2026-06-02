import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { Icon, IconName } from './Icon';
import { NavalEmblem } from './NavalEmblem';
import { AnimatedNumber } from './AnimatedNumber';
import { Toaster } from './Toaster';
import { OfflineBanner } from './OfflineBanner';
import { formatCompactMoney, formatMoney } from '../lib/format';
import { useCurrencyStore } from '../stores/currency-store';

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const navigate = useNavigate();
  const loc = useLocation();
  useCurrencyStore((s) => s.currency);
  useCurrencyStore((s) => s.ratesVersion);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [loc.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!match) return;
    const p = loc.pathname;
    if (match.gameStatus === 'PLACEMENT' && !p.startsWith('/placement')) {
      navigate(`/placement/${match.matchId}`);
    } else if (match.gameStatus === 'IN_PROGRESS' && !p.startsWith('/battle')) {
      navigate(`/battle/${match.matchId}`);
    } else if (match.gameStatus === 'FINISHED' && !p.startsWith('/result') && !/^\/(home|wallet|settings|profile|leaderboard|history)/.test(p)) {
      navigate(`/result/${match.matchId}`);
    }
  }, [match?.matchId, match?.gameStatus, loc.pathname, navigate]);

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
          'px-4 flex items-center justify-between sticky top-0 z-30 border-b border-line/40 backdrop-blur-xl transition-all duration-300',
          scrolled ? 'shadow-[0_4px_24px_rgba(0,0,0,0.25)]' : '',
        ].join(' ')}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top)',
          background: 'rgba(var(--c-panel-rgb) / 0.82)',
        }}
      >
        <NavLink to="/home" className="flex items-center gap-2.5 text-main" aria-label="На палубу">
          <NavalEmblem />
          <div className="flex flex-col leading-none gap-[1px]">
            <span className="font-display text-[10px] tracking-[0.32em] uppercase text-danger">Морской</span>
            <span className="font-display text-[15px] tracking-[0.18em] uppercase text-main">Бой</span>
          </div>
        </NavLink>

        <NavLink
          to="/wallet"
          aria-label="Кошелёк"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-main transition"
          style={{
            background: 'rgba(var(--c-panel-rgb) / 0.8)',
            border: '1px solid rgba(var(--c-line-rgb) / 0.6)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <Icon name="coins" size={14} className="text-warning" />
          <span className="font-display text-sm tabular-nums">
            <AnimatedNumber value={user?.balance ?? 0} formatter={formatMoney} />
          </span>
        </NavLink>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="flex-1 px-4 py-5"
          style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

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

/* ─── Центральная кнопка баланса ─────────────────────────────────────────── */
function BalanceTab({ balance }: { balance: number }) {
  return (
    <li className="flex-1 flex justify-center">
      <NavLink to="/wallet" aria-label="Баланс" className="flex flex-col items-center gap-1 -mt-7">
        {({ isActive }) => (
          <>
            <motion.div
              whileTap={{ scale: 0.90 }}
              className="flex flex-col items-center justify-center text-white border-[3px] border-panel"
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: isActive
                  ? 'linear-gradient(145deg, #e83228, #ff4438, #c02018)'
                  : 'linear-gradient(145deg, #d42020, #e83228, #b01818)',
                boxShadow: isActive
                  ? '0 6px 24px rgba(240,75,65,0.65), 0 0 0 2px rgba(240,75,65,0.3)'
                  : '0 5px 18px rgba(225,87,75,0.50)',
              }}
            >
              <Icon name="coins" size={17} />
              <span className="font-display text-[10px] leading-none tabular-nums mt-0.5">
                <AnimatedNumber value={balance} formatter={formatCompactMoney} />
              </span>
            </motion.div>
            <span className={['text-[10px] font-display uppercase tracking-wider', isActive ? 'text-danger' : 'text-muted'].join(' ')}>
              Баланс
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}

/* ─── Вкладка навигации ──────────────────────────────────────────────────── */
function Tab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <li className="flex-1">
      <NavLink
        to={to}
        className={({ isActive }) =>
          [
            'relative flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all text-[10px] font-display uppercase tracking-wider',
            isActive ? 'text-main' : 'text-muted',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            {/* Активный фон */}
            {isActive && (
              <motion.span
                layoutId="navBg"
                className="absolute inset-0 rounded-xl"
                style={{ background: 'rgba(var(--c-danger-rgb) / 0.08)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon name={icon} size={20} />
            <span>{label}</span>
            {/* Красная черта снизу */}
            <span className="h-0.5 w-4 rounded-full overflow-hidden">
              {isActive && (
                <motion.span
                  layoutId="navIndicator"
                  className="block h-full w-full bg-danger"
                  style={{ boxShadow: '0 0 6px rgba(240,75,65,0.8)' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}
