import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchmakingAPI, GameAPI } from '../api/endpoints';
import { tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';

export default function TrainingScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'select' | 'friend' | 'bot'>('select');
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const createTrainingLobby = async () => {
    setBusy(true);
    try {
      tgHaptic('medium');
      const lobby = await MatchmakingAPI.createTrainingLobby();
      navigate(`/lobby/${lobby.code}`);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Не удалось создать тренировку', 'error');
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    navigate(`/lobby/${code}`);
  };

  const startWithBot = async () => {
    setBusy(true);
    try {
      tgHaptic('medium');
      const { matchId } = await GameAPI.startBotTest();
      navigate(`/placement/${matchId}`);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Не удалось начать тренировку с ботом', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button onClick={() => mode === 'select' ? navigate(-1) : setMode('select')} className="flex items-center gap-2 text-muted text-sm">
        <Icon name="arrow-right" size={14} className="rotate-180" /> Назад
      </button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="title text-main text-xl mb-1">Тренировка</h1>
        <p className="text-muted text-sm">Бесплатный бой — без ставки и без влияния на статистику.</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            {/* С другом */}
            <motion.button
              onClick={() => setMode('friend')}
              whileTap={{ scale: 0.975 }}
              className="w-full card card-press text-left flex items-center gap-4 px-5 py-5"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(var(--c-panel-rgb) / 0.8)', border: '1px solid rgba(var(--c-line-rgb) / 0.8)' }}>
                <Icon name="swords" size={22} className="text-danger" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-main text-[18px] uppercase tracking-[0.08em] leading-none">С другом</div>
                <p className="text-muted text-sm mt-1.5">Создать лобби или войти по коду</p>
              </div>
              <Icon name="arrow-right" size={18} className="text-muted shrink-0 ml-auto" />
            </motion.button>

            {/* С ботом */}
            <motion.button
              onClick={startWithBot}
              disabled={busy}
              whileTap={{ scale: 0.975 }}
              className="w-full card card-press text-left flex items-center gap-4 px-5 py-5 disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(var(--c-panel-rgb) / 0.8)', border: '1px solid rgba(var(--c-line-rgb) / 0.8)' }}>
                {busy
                  ? <span className="w-5 h-5 rounded-full border-2 border-transparent border-t-danger animate-spin" />
                  : <Icon name="target" size={22} className="text-danger" />}
              </div>
              <div className="min-w-0">
                <div className="font-display text-main text-[18px] uppercase tracking-[0.08em] leading-none">С ботом</div>
                <p className="text-muted text-sm mt-1.5">Сыграть прямо сейчас против тренажёра</p>
              </div>
              <Icon name="arrow-right" size={18} className="text-muted shrink-0 ml-auto" />
            </motion.button>
          </motion.div>
        )}

        {mode === 'friend' && (
          <motion.div
            key="friend"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            {/* Создать лобби */}
            <div className="card p-5 space-y-3">
              <p className="eyebrow">Создать лобби</p>
              <p className="text-muted text-xs">Получите код и ссылку-приглашение для друга. Бой начнётся, как только он войдёт.</p>
              <button className="btn-primary w-full" onClick={createTrainingLobby} disabled={busy}>
                {busy
                  ? <span className="w-4 h-4 rounded-full border-2 border-transparent border-t-white animate-spin" />
                  : <><Icon name="lock" size={16} /> Создать и пригласить</>}
              </button>
            </div>

            {/* Ввести чужой код */}
            <div className="card p-5 space-y-3">
              <p className="eyebrow">Ввести чужой код</p>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="КОД"
                maxLength={10}
                className="w-full px-4 py-3 rounded-lg bg-panel border border-line text-center font-display tracking-[0.3em] text-main focus:border-line outline-none"
              />
              <button
                className="btn-primary w-full"
                onClick={joinByCode}
                disabled={joinCode.trim().length < 4}
              >
                Открыть лобби
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
