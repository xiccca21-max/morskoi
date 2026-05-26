import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { useEffect } from 'react';

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const navigate = useNavigate();
  const loc = useLocation();

  // Авто-навигация при активном матче
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

  const hideBottomNav =
    loc.pathname.startsWith('/placement') ||
    loc.pathname.startsWith('/battle') ||
    loc.pathname.startsWith('/result') ||
    loc.pathname.startsWith('/lobby');

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-4 pt-3 pb-2 flex items-center justify-between sticky top-0 z-30 bg-navy-950/80 backdrop-blur border-b border-white/5">
        <NavLink to="/home" className="font-display text-lg text-cyber-cyan tracking-widest">
          NAVAL · CLASH
        </NavLink>
        <NavLink to="/wallet" className="flex items-center gap-2 card px-3 py-1.5">
          <span className="text-cyber-cyan">⚡</span>
          <span className="font-semibold">${user?.balance?.toFixed(2) ?? '0.00'}</span>
        </NavLink>
      </header>

      <motion.main
        key={loc.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex-1 px-4 py-4 pb-24"
      >
        <Outlet />
      </motion.main>

      {!hideBottomNav && (
        <nav className="fixed bottom-0 inset-x-0 z-40 px-4 pb-3 pt-2 bg-navy-950/95 backdrop-blur border-t border-white/5">
          <ul className="flex items-center justify-around text-xs">
            <NavTab to="/home"        icon="⚓" label="Главная" />
            <NavTab to="/matchmaking" icon="⚔" label="Игра" />
            <NavTab to="/leaderboard" icon="🏆" label="Топ" />
            <NavTab to="/history"     icon="📜" label="История" />
            <NavTab to="/profile"     icon="👤" label="Профиль" />
          </ul>
        </nav>
      )}
    </div>
  );
}

function NavTab({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          [
            'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition',
            isActive ? 'text-cyber-cyan bg-cyber-cyan/10 shadow-glow' : 'text-white/60 hover:text-white',
          ].join(' ')
        }
      >
        <span className="text-base">{icon}</span>
        <span>{label}</span>
      </NavLink>
    </li>
  );
}
