import { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';
import { Icon } from './Icon';

/**
 * Экран согласия: возраст 18+ и правила. Показывается один раз после регистрации,
 * пока пользователь не подтвердит. Обязателен для игры на реальные деньги.
 */
export function ConsentGate() {
  const patchUser = useAuthStore((s) => s.patchUser);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const accept = async () => {
    if (!checked) return;
    setBusy(true);
    try {
      await AuthAPI.agreeTerms();
      tgHaptic('success');
      patchUser({ agreedToTerms: true });
    } catch {
      tgHaptic('error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-base flex items-center justify-center p-5">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card p-6 max-w-sm w-full space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-danger/10 border border-danger flex items-center justify-center shrink-0">
            <Icon name="shield" size={24} className="text-danger" />
          </div>
          <div>
            <h2 className="font-display text-main text-lg leading-tight">Подтверждение</h2>
            <p className="text-muted text-xs">Перед игрой на реальные деньги</p>
          </div>
        </div>

        <ul className="space-y-2.5 text-sm text-main">
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Мне исполнилось 18 лет</li>
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Игры на деньги не запрещены в моей юрисдикции</li>
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Я понимаю, что ставки несут риск потери средств</li>
        </ul>

        <label className="flex items-start gap-3 cursor-pointer select-none bg-panel rounded-lg p-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-danger shrink-0"
          />
          <span className="text-xs text-muted leading-relaxed">
            Я подтверждаю, что мне есть 18 лет, и принимаю
            {' '}<button type="button" onClick={(e) => { e.preventDefault(); setShowRules((v) => !v); }} className="text-danger underline">правила</button> и условия сервиса.
          </span>
        </label>

        {showRules && (
          <div className="bg-panel rounded-lg p-3 text-[11px] text-muted leading-relaxed space-y-1.5 max-h-40 overflow-y-auto">
            <p>• Каждый бой — ставка двух игроков. Победитель забирает банк за вычетом комиссии 5%.</p>
            <p>• Все ходы проверяются на сервере, поля соперников скрыты. Читы невозможны.</p>
            <p>• Выход из боя или бездействие засчитывается как поражение, ставка не возвращается.</p>
            <p>• Вывод средств — от 100 ₽, обработка до 24 часов.</p>
            <p>• Играйте ответственно: лимиты и перерыв доступны в настройках.</p>
          </div>
        )}

        <button className="btn-primary w-full" onClick={accept} disabled={!checked || busy}>
          {busy ? 'Подтверждаем…' : 'Принять и продолжить'}
        </button>
        <p className="text-[10px] text-muted text-center leading-relaxed">
          Играйте ответственно. Установить лимиты можно в настройках.
        </p>
      </motion.div>
    </div>
  );
}
