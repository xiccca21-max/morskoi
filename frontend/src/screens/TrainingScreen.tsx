import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MatchmakingAPI, GameAPI } from '../api/endpoints';
import { tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';

export default function TrainingScreen() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'friend' | 'bot' | null>(null);

  const startWithFriend = async () => {
    setBusy('friend');
    try {
      tgHaptic('medium');
      const lobby = await MatchmakingAPI.createTrainingLobby();
      navigate(`/lobby/${lobby.code}`);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? e?.message ?? 'Не удалось создать тренировку', 'error');
    } finally {
      setBusy(null);
    }
  };

  const startWithBot = async () => {
    setBusy('bot');
    try {
      tgHaptic('medium');
      const { matchId } = await GameAPI.startBotTest();
      navigate(`/placement/${matchId}`);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? e?.message ?? 'Не удалось начать тренировку с ботом', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted text-sm">
        <Icon name="arrow-right" size={14} className="rotate-180" /> Назад
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="title text-main text-xl mb-1">Тренировка</h1>
        <p className="text-muted text-sm">Бесплатный бой — без ставки и без влияния на статистику.</p>
      </motion.div>

      {/* С другом */}
      <motion.button
        onClick={startWithFriend}
        disabled={!!busy}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.06 }}
        whileTap={{ scale: 0.975 }}
        className="w-full card card-press text-left flex items-center gap-4 px-5 py-5 disabled:opacity-60"
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(var(--c-panel-rgb) / 0.8)',
            border: '1px solid rgba(var(--c-line-rgb) / 0.8)',
          }}
        >
          {busy === 'friend'
            ? <span className="w-5 h-5 rounded-full border-2 border-transparent border-t-danger animate-spin" />
            : <Icon name="swords" size={22} className="text-danger" />
          }
        </div>
        <div className="min-w-0">
          <div className="font-display text-main text-[18px] uppercase tracking-[0.08em] leading-none">
            С другом
          </div>
          <p className="text-muted text-sm mt-1.5">
            Создать лобби и пригласить друга по ссылке
          </p>
        </div>
        <Icon name="arrow-right" size={18} className="text-muted shrink-0 ml-auto" />
      </motion.button>

      {/* С ботом */}
      <motion.button
        onClick={startWithBot}
        disabled={!!busy}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.12 }}
        whileTap={{ scale: 0.975 }}
        className="w-full card card-press text-left flex items-center gap-4 px-5 py-5 disabled:opacity-60"
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(var(--c-panel-rgb) / 0.8)',
            border: '1px solid rgba(var(--c-line-rgb) / 0.8)',
          }}
        >
          {busy === 'bot'
            ? <span className="w-5 h-5 rounded-full border-2 border-transparent border-t-danger animate-spin" />
            : <Icon name="target" size={22} className="text-danger" />
          }
        </div>
        <div className="min-w-0">
          <div className="font-display text-main text-[18px] uppercase tracking-[0.08em] leading-none">
            С ботом
          </div>
          <p className="text-muted text-sm mt-1.5">
            Сыграть прямо сейчас против тренажёра
          </p>
        </div>
        <Icon name="arrow-right" size={18} className="text-muted shrink-0 ml-auto" />
      </motion.button>
    </div>
  );
}
