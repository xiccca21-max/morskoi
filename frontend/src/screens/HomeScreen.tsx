import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { GameAPI } from '../api/endpoints';
import { tgHaptic } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { Onboarding } from '../components/Onboarding';

export default function HomeScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);

  // Подтянуть активный матч при входе — чтобы кнопка «вернуться в бой» работала
  // даже после перезапуска мини-аппа.
  useEffect(() => {
    GameAPI.active()
      .then((m) => { if (m && m.matchId) setMatchState(m); })
      .catch(() => {});
  }, [setMatchState]);

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const total = wins + losses;
  const wr = total ? Math.round((wins / total) * 100) : 0;
  const balance = user?.balance ?? 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  })();

  const activeMatch = match && (match.gameStatus === 'PLACEMENT' || match.gameStatus === 'IN_PROGRESS');

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Onboarding />
      {/* Каюта капитана */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
        <p className="eyebrow">{greeting}</p>
        <h2 className="font-display text-2xl text-main leading-tight mt-0.5">
          {user?.nickname ?? user?.firstName ?? user?.username ?? 'без имени'}
        </h2>

        <div className="grid grid-cols-3 gap-px mt-4 bg-line rounded-lg overflow-hidden">
          <Stat icon="trophy" label="Победы" value={wins} />
          <Stat icon="skull" label="Поражения" value={losses} accent />
          <Stat icon="target" label="Точность" value={`${wr}%`} />
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

      {balance <= 0 && !activeMatch && (
        <button
          onClick={() => { tgHaptic('light'); navigate('/wallet'); }}
          className="w-full card card-press p-3 flex items-center gap-3 border-danger text-left"
        >
          <Icon name="coins" size={18} className="text-danger shrink-0" />
          <span className="flex-1 text-main text-sm">Баланс пуст — пополни, чтобы играть на ставку</span>
          <Icon name="arrow-right" size={16} className="text-danger shrink-0" />
        </button>
      )}

      {/* Главная кнопка */}
      <button
        onClick={() => { tgHaptic('medium'); navigate('/matchmaking'); }}
        className="w-full card card-press p-5 text-left flex items-center justify-between hover:border-line transition group"
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
        <Tile icon="compass" title="Как это работает" sub="Пошаговое объяснение" onClick={() => navigate('/how-it-works')} />
        <Tile icon="scroll" title="Правила" sub="Флот, ходы, штрафы" onClick={() => navigate('/rules')} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: IconName; label: string; value: any; accent?: boolean }) {
  return (
    <div className="bg-panel py-4 px-3 text-center flex flex-col items-center gap-1">
      <Icon name={icon} size={16} className={accent ? 'text-danger' : 'text-muted'} />
      <div className={['font-display text-xl tabular-nums leading-none', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="eyebrow">{label}</div>
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: IconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card card-press p-4 text-left hover:border-line transition">
      <Icon name={icon} size={22} className="text-danger" />
      <div className="font-display text-main mt-2">{title}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </button>
  );
}

