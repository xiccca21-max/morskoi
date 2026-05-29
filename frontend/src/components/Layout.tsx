import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { Icon, IconName } from './Icon';
import { AnimatedNumber } from './AnimatedNumber';

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const navigate = useNavigate();
  const loc = useLocation();

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
      <header className="px-4 h-14 flex items-center justify-between sticky top-0 z-30 bg-panel border-b border-line">
        <NavLink to="/home" className="flex items-center gap-2 text-main">
          <Icon name="anchor" size={18} />
          <span className="title text-[13px] leading-none">Морской Бой</span>
        </NavLink>
        <NavLink to="/wallet" className="flex items-center gap-2 plate px-3 py-1.5 text-main">
          <Icon name="coins" size={15} className="text-muted" />
          <span className="font-display text-sm tabular-nums">
            <AnimatedNumber value={user?.balance ?? 0} formatter={(v) => v.toFixed(2)} /> ₽
          </span>
        </NavLink>
      </header>

      <motion.main
        key={loc.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex-1 px-4 py-5 pb-24"
      >
        <Outlet />
      </motion.main>

      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 z-40 px-2 py-2 border-t border-line bg-panel">
          <ul className="flex items-center justify-around">
            <Tab to="/home" icon="grid" label="Палуба" />
            <Tab to="/matchmaking" icon="swords" label="В бой" />
            <Tab to="/leaderboard" icon="trophy" label="Топ" />
            <Tab to="/history" icon="scroll" label="Журнал" />
            <Tab to="/profile" icon="user" label="Каюта" />
          </ul>
        </nav>
      )}
    </div>
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
            <span className={['h-0.5 w-5 rounded-full transition', isActive ? 'bg-danger' : 'bg-transparent'].join(' ')} />
          </>
        )}
      </NavLink>
    </li>
  );
}
