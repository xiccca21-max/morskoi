import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useMatchStore } from '../stores/match-store';
import { GameAPI } from '../api/endpoints';
import { tgHaptic, tgPhotoUrl } from '../lib/telegram';
import { Icon, IconName } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { Onboarding } from '../components/Onboarding';
import { useGameConfigStore } from '../stores/game-config-store';
import { formatMoney } from '../lib/format';


export default function HomeScreen() {
  const navigate = useNavigate();
  const minWager = useGameConfigStore((s) => s.minWager);
  const user = useAuthStore((s) => s.user);
  const match = useMatchStore((s) => s.state);
  const setMatchState = useMatchStore((s) => s.setState);

  useEffect(() => {
    GameAPI.active()
      .then((m) => {
        if (m?.matchId) setMatchState(m);
        else useMatchStore.getState().clear();
      })
      .catch(() => {});
  }, [setMatchState]);

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const total = wins + losses;
  const wr = total ? Math.round((wins / total) * 100) : 0;
  const balance = user?.balance ?? 0;
  const avatarUrl = user?.avatar ?? tgPhotoUrl();
  const displayName = user?.nickname ?? user?.firstName ?? user?.username ?? 'Без имени';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  })();

  const activeMatch =
    match &&
    match.status !== 'FINISHED' &&
    match.status !== 'CANCELLED' &&
    (match.gameStatus === 'PLACEMENT' || match.gameStatus === 'IN_PROGRESS');
  const openTraining = () => {
    if (activeMatch) {
      navigate(`/${match!.gameStatus === 'PLACEMENT' ? 'placement' : 'battle'}/${match!.matchId}`);
      return;
    }
    tgHaptic('light');
    navigate('/training');
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Onboarding />

      {/* ── Каюта капитана ── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card p-5 relative overflow-hidden"
      >
        {/* Компас-водяной знак */}
        <div className="absolute right-[-16px] top-[-16px] pointer-events-none select-none opacity-[0.045]">
          <Icon name="wheel" size={130} className="text-main" />
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={displayName} src={avatarUrl} size={52} />
          <div className="min-w-0">
            <p className="eyebrow">{greeting}, капитан</p>
            <h2 className="font-display text-[22px] text-main leading-tight mt-1 tracking-wide truncate">
              {displayName}
            </h2>
          </div>
        </div>

        {/* Статы */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <StatCard icon="trophy" label="Победы" value={wins} color="success" />
          <StatCard icon="skull" label="Поражения" value={losses} color="danger" />
          <StatCard icon="target" label="% побед" value={`${wr}%`} color="accent" />
        </div>
      </motion.section>

      {/* ── Вернуться в бой ── */}
      {activeMatch && (
        <motion.button
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => navigate(`/${match!.gameStatus === 'PLACEMENT' ? 'placement' : 'battle'}/${match!.matchId}`)}
          className="w-full btn-danger flex items-center justify-center gap-2"
        >
          <Icon name="swords" size={18} /> Вернуться в бой
        </motion.button>
      )}

      {/* ── Предупреждение о балансе ── */}
      {balance > 0 && balance < minWager && !activeMatch && (
        <button
          onClick={() => { tgHaptic('light'); navigate('/wallet'); }}
          className="w-full card card-press p-3 flex items-center gap-3 border-warning/60 text-left"
        >
          <Icon name="coins" size={18} className="text-warning shrink-0" />
          <span className="flex-1 text-main text-sm">Мало для ставки — минимум {formatMoney(minWager)}</span>
          <Icon name="arrow-right" size={16} className="text-warning shrink-0" />
        </button>
      )}
      {balance <= 0 && !activeMatch && (
        <button
          onClick={() => { tgHaptic('light'); navigate('/wallet'); }}
          className="w-full card card-press p-3 flex items-center gap-3 border-danger/50 text-left"
        >
          <Icon name="coins" size={18} className="text-danger shrink-0" />
          <span className="flex-1 text-main text-sm">Баланс пуст — пополни, чтобы играть на ставку</span>
          <Icon name="arrow-right" size={16} className="text-danger shrink-0" />
        </button>
      )}

      {/* ══ В БОЙ — главная кнопка ══ */}
      <motion.button
        onClick={() => { tgHaptic('medium'); navigate('/matchmaking'); }}
        className="w-full text-left relative overflow-hidden"
        style={{ borderRadius: 'var(--radius-card)', minHeight: 88, border: 'var(--border-w) solid var(--c-line)', boxShadow: 'var(--shadow-card)' }}
        whileTap={{ scale: 0.975 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
      >
        {/* Красный градиент */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(145deg, #e83228 0%, #ff5548 50%, #c42820 100%)',
          }}
        />
        {/* Диагональная штриховка (текстура) */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
            backgroundSize: '10px 10px',
          }}
        />
        {/* Белая линия сверху */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)' }}
        />
        {/* Мерцающий блик */}
        <motion.div
          className="absolute inset-y-0 w-2/5 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }}
          animate={{ x: ['-120%', '320%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
        />
        {/* Содержимое */}
        <div className="relative px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <div
              className="font-display text-white text-[26px] uppercase tracking-[0.12em] leading-none"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
            >
              В бой
            </div>
            <p className="text-white/60 text-sm mt-1.5">Найти соперника и сразиться на ставку</p>
          </div>
          <motion.div
            className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center border border-white/25"
            style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
            animate={{ x: [0, 5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon name="arrow-right" size={22} className="text-white" />
          </motion.div>
        </div>
      </motion.button>

      {/* ── Тренировка ── */}
      <motion.button
        onClick={openTraining}
        className="w-full card card-press text-left flex items-center justify-between gap-4 px-5 py-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.13 }}
        whileTap={{ scale: 0.975 }}
      >
        <div>
          <span className="font-display text-[17px] text-main uppercase tracking-[0.1em] leading-none">Тренировка</span>
          <p className="text-muted text-sm mt-1">Бесплатный бой — с другом или с ботом</p>
        </div>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(var(--c-panel-rgb) / 0.8)',
            border: '1px solid rgba(var(--c-line-rgb) / 0.8)',
          }}
        >
          <Icon name="target" size={20} className="text-main" />
        </div>
      </motion.button>

      {/* ── 2×2 тайлы ── */}
      <div className="grid grid-cols-2 gap-3">
        <Tile index={0} icon="coins"   title="Казна"            sub="Пополнить / вывести"     onClick={() => navigate('/wallet')} />
        <Tile index={1} icon="trophy"  title="Топ"              sub="Лучшие капитаны"          onClick={() => navigate('/leaderboard')} />
        <Tile index={2} icon="compass" title="Как это работает" sub="Пошаговое объяснение"    onClick={() => navigate('/how-it-works')} />
        <Tile index={3} icon="scroll"  title="Правила"          sub="Флот, ходы, штрафы"      onClick={() => navigate('/rules')} />
      </div>

    </div>
  );
}

/* ─── Stat карточка ──────────────────────────────────────────────────────── */
function StatCard({
  label, value,
}: {
  icon: IconName; label: string; value: any; color: 'success' | 'danger' | 'accent';
}) {
  return (
    <div
      className="rounded-xl py-3 px-2 flex flex-col items-center gap-1 text-center"
      style={{
        background: 'rgba(var(--c-panel-rgb) / 0.7)',
        border: '1px solid rgba(var(--c-line-rgb) / 0.5)',
      }}
    >
      <div className="font-display text-2xl tabular-nums leading-none text-main">{value}</div>
      <div className="eyebrow text-[9px]">{label}</div>
    </div>
  );
}

/* ─── Тайл ───────────────────────────────────────────────────────────────── */
function Tile({
  icon, title, sub, onClick, index = 0,
}: {
  icon: IconName; title: string; sub: string; onClick: () => void; index?: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 + index * 0.05 }}
      whileTap={{ scale: 0.97 }}
      className="card card-press p-4 text-left relative"
    >
      {/* Иконка в правом верхнем углу */}
      <div className="absolute top-3 right-3 flex items-center justify-center">
        <Icon name={icon} size={22} className="text-danger" />
      </div>
      <div className="font-display text-main text-[14px] leading-tight uppercase tracking-wide mt-1 pr-12">{title}</div>
      <div className="text-[11px] text-muted mt-1 leading-snug pr-12">{sub}</div>
    </motion.button>
  );
}
