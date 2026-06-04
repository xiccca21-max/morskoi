import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';
import { ACHIEVEMENTS, statsFromUser } from '../lib/achievements';

export default function AchievementsScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;

  const stats = statsFromUser({ ...user, wins: user.wins, losses: user.losses });
  const badges = ACHIEVEMENTS.map((a) => ({ ...a, earned: a.earned(stats), pct: Math.round(a.progress(stats)) }));
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="flex items-center gap-2 text-muted active:opacity-70"
      >
        <Icon name="arrow-right" size={16} className="rotate-180" />
        <span className="text-sm">Назад</span>
      </button>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <p className="eyebrow">Достижения</p>
          <span className="text-[11px] tabular-nums font-display text-danger">
            {earnedCount}
            <span className="text-muted">/{badges.length}</span>
          </span>
        </div>
        <ul className="divide-y divide-line">
          {badges.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <div className={['w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', b.earned ? 'border-danger/40 bg-danger/8' : 'border-line bg-panel'].join(' ')}>
                <Icon name={b.earned ? b.icon : 'lock'} size={16} className={b.earned ? 'text-danger' : 'text-muted'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={['text-sm font-display', b.earned ? 'text-main' : 'text-muted'].join(' ')}>{b.title}</p>
                <p className="text-[11px] text-muted leading-snug">{b.desc}</p>
              </div>
              {b.earned ? (
                <Icon name="check" size={14} className="text-danger shrink-0" />
              ) : b.pct > 0 ? (
                <span className="text-[11px] tabular-nums text-muted shrink-0">{b.pct}%</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
