import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { Icon, IconName } from './Icon';
import { AnimatedNumber } from './AnimatedNumber';
import { Toaster } from './Toaster';
import { OfflineBanner } from './OfflineBanner';
import { formatNumber, formatCompact } from '../lib/format';

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const navigate = useNavigate();
  const loc = useLocation();

  const [scrolled, setScrolled] = useState(false);

  // При смене экрана прокручиваем наверх — иначе новый экран открывается «в середине».
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [loc.pathname]);

  // Тень у шапки появляется при скролле — даёт ощущение глубины.
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
    } else if (match.gameStatus === 'FINISHED' && !p.startsWith('/result')) {
      navigate(`/result/${match.matchId}`);
    }
  }, [match?.matchId, match?.gameStatus]); // eslint-disable-line

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
        className={['px-4 h-14 flex items-center justify-between sticky top-0 z-30 bg-panel border-b border-line transition-shadow', scrolled ? 'shadow-[0_4px_16px_rgba(0,0,0,0.12)]' : ''].join(' ')}
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
      >
        <NavLink to="/home" className="flex items-center gap-2 text-main" aria-label="На палубу">
          <span className="w-7 h-7 rounded-md bg-danger text-white flex items-center justify-center shrink-0">
            <Icon name="anchor" size={16} />
          </span>
          <span className="title text-[13px] leading-none">Морской Бой</span>
        </NavLink>
        <NavLink to="/wallet" className="flex items-center gap-2 plate px-3 py-1.5 text-main" aria-label="Кошелёк">
          <Icon name="coins" size={15} className="text-muted" />
          <span className="font-display text-sm tabular-nums">
            <AnimatedNumber value={user?.balance ?? 0} formatter={formatNumber} /> ₽
          </span>
        </NavLink>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 10 }}
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
          className="fixed bottom-0 inset-x-0 z-40 px-2 py-2 border-t border-line bg-panel"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
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
      <NavLink to="/wallet" aria-label="Баланс" className="flex flex-col items-center gap-1 -mt-8">
        {({ isActive }) => (
          <>
            <motion.div
              whileTap={{ scale: 0.92 }}
              className={[
                'w-16 h-16 rounded-full flex flex-col items-center justify-center text-white border-4 border-panel',
                'bg-danger shadow-[0_6px_18px_rgba(225,87,75,0.5)]',
                isActive ? 'ring-2 ring-danger ring-offset-2 ring-offset-panel' : '',
              ].join(' ')}
            >
              <Icon name="coins" size={18} />
              <span className="font-display text-[11px] leading-none tabular-nums mt-0.5">
                <AnimatedNumber value={balance} formatter={formatCompact} />
              </span>
            </motion.div>
            <span className={['text-[10px] font-display uppercase tracking-wider', isActive ? 'text-main' : 'text-muted'].join(' ')}>
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
            'flex flex-col items-center gap-1 py-1.5 rounded-lg transition text-[10px] font-display uppercase tracking-wider',
            isActive ? 'text-main' : 'text-muted hover:text-main',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            <Icon name={icon} size={20} />
            <span>{label}</span>
            <span className="relative h-0.5 w-5">
              {isActive && (
                <motion.span
                  layoutId="navIndicator"
                  className="absolute inset-0 rounded-full bg-danger"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}
