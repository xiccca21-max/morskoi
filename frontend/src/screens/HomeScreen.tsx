import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { tgHaptic } from '../lib/telegram';
import { getRank, rankProgress } from '../lib/rank';
import { Icon, IconName } from '../components/Icon';

export default function HomeScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const rank = getRank(wins);
  const progress = rankProgress(wins);
  const total = wins + losses;
  const wr = total ? Math.round((wins / total) * 100) : 0;

  const activeMatch = match && (match.gameStatus === 'PLACEMENT' || match.gameStatus === 'IN_PROGRESS');

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Каюта капитана */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Капитан</p>
            <h2 className="font-display text-2xl text-main leading-tight mt-0.5">
              {user?.firstName ?? user?.username ?? 'без имени'}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-muted">
            <Icon name={rank.icon} size={22} />
            <span className="title text-xs text-main">{rank.title}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between eyebrow mb-1.5">
            <span>Прогресс звания</span>
            <span className="text-muted">{wins}{rank.next ? ` / ${rank.next}` : ''}</span>
          </div>
          <div className="h-1 rounded-full bg-panel overflow-hidden">
            <div className="h-full bg-main" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px mt-5 bg-line rounded-lg overflow-hidden">
          <Stat label="Победы" value={wins} />
          <Stat label="Поражения" value={losses} accent />
          <Stat label="Точность" value={`${wr}%`} />
        </div>
      </motion.section>

      {activeMatch && (
        <button
          onClick={() => navigate(`/${match!.gameStatus === 'PLACEMENT' ? 'placement' : 'battle'}/${match!.matchId}`)}
          className="btn-danger w-full"
        >
          <Icon name="swords" size={18} /> Вернуться в бой
        </button>
      )}

      {/* Главная кнопка */}
      <button
        onClick={() => { tgHaptic('medium'); navigate('/matchmaking'); }}
        className="w-full card p-5 text-left flex items-center justify-between hover:border-line transition group"
      >
        <div>
          <span className="title text-xl text-main">В бой</span>
          <p className="text-muted text-sm mt-1">Найти соперника и сразиться на ставку</p>
        </div>
        <span className="w-11 h-11 rounded-full bg-danger flex items-center justify-center text-white">
          <Icon name="arrow-right" size={20} />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Tile icon="coins" title="Казна" sub="Пополнить / вывести" onClick={() => navigate('/wallet')} />
        <Tile icon="trophy" title="Топ" sub="Лучшие капитаны" onClick={() => navigate('/leaderboard')} />
      </div>

      {/* Правила */}
      <section className="card p-5">
        <p className="eyebrow mb-3">Как это работает</p>
        <ol className="text-sm text-main space-y-2.5">
          <Rule n={1}>Выбери ставку и найди соперника</Rule>
          <Rule n={2}>Оба ставят равную сумму в общий банк</Rule>
          <Rule n={3}>Расставь флот и топи корабли врага</Rule>
          <Rule n={4}>Победитель забирает 95% банка, 5% — комиссия</Rule>
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="bg-panel p-3 text-center">
      <div className={['font-display text-xl tabular-nums', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: IconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left hover:border-line transition">
      <Icon name={icon} size={22} className="text-muted" />
      <div className="font-display text-main mt-2">{title}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </button>
  );
}

function Rule({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full border border-line text-[11px] font-display flex items-center justify-center text-muted">{n}</span>
      <span>{children}</span>
    </li>
  );
}
