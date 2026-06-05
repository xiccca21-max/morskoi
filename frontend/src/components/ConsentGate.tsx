import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AuthAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore } from '../stores/settings-store';
import { tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { useGameConfigStore } from '../stores/game-config-store';
import { formatMoney } from '../lib/format';
import { Icon } from './Icon';

/**
 * Экран согласия: возраст 18+ и правила. Показывается один раз после регистрации,
 * пока пользователь не подтвердит. Обязателен для игры на реальные деньги.
 */
export function ConsentGate() {
  const patchUser = useAuthStore((s) => s.patchUser);
  const minWager = useGameConfigStore((s) => s.minWager);
  const minWithdraw = useGameConfigStore((s) => s.minWithdraw);
  const platformRakePercent = useGameConfigStore((s) => s.platformRakePercent);
  const winPct = 100 - platformRakePercent;

  // Блокируем скролл страницы под оверлеем и гарантированно восстанавливаем при закрытии
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const setOnboardingDone = useSettingsStore((s) => s.setOnboardingDone);

  const accept = async () => {
    if (!checked) return;
    setBusy(true);
    try {
      await AuthAPI.agreeTerms();
      tgHaptic('success');
      // Сразу помечаем онбординг пройденным — новый игрок видел инструкцию здесь,
      // отдельная модалка на главной ему не нужна.
      setOnboardingDone(true);
      patchUser({ agreedToTerms: true });
    } catch {
      tgHaptic('error');
      toast('Не удалось сохранить согласие', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-base overflow-y-auto flex items-start justify-center p-5 pb-8">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card p-6 max-w-sm w-full space-y-4 my-auto"
      >
        {/* Заголовок */}
        <div className="text-center">
          <div className="text-4xl mb-2">⚓</div>
          <h2 className="font-display text-main text-xl leading-tight">Добро пожаловать!</h2>
          <p className="text-muted text-sm mt-1">Морской Бой — PvP на ставку в Telegram</p>
        </div>

        {/* Как играть — 3 шага */}
        <div className="space-y-3 py-1">
          <HowStep n={1} emoji="⚔️" title="Найди соперника" text="Выбери ставку — система подберёт игрока с такой же суммой за секунды." />
          <HowStep n={2} emoji="🚢" title="Расставь корабли" text="Тапни на поле, чтобы поставить. Тапни дважды — повернёт. Потом топи врага по очереди." />
          <HowStep n={3} emoji="🏆" title={`Забирай ${winPct}% от банка`} text="Победитель забирает ставки обоих игроков за вычетом комиссии. Проиграл — ставка уходит сопернику." />
        </div>

        {/* Разделитель */}
        <div className="border-t border-line/40" />

        {/* Правовые пункты */}
        <ul className="space-y-2 text-sm text-main">
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Мне исполнилось 18 лет</li>
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Игры на деньги не запрещены в моей стране</li>
          <li className="flex gap-2"><Icon name="check" size={16} className="text-success shrink-0 mt-0.5" /> Ставки несут риск потери средств — я понимаю это</li>
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
            <p>• Каждый бой — ставка двух игроков. Победитель забирает банк за вычетом комиссии {platformRakePercent}%.</p>
            <p>• Все ходы проверяются на сервере, поля соперников скрыты. Читы невозможны.</p>
            <p>• Выход из боя или бездействие засчитывается как поражение, ставка не возвращается.</p>
            <p>• Минимальная ставка — {formatMoney(minWager)}. Вывод USDT — от {formatMoney(minWithdraw)}, обработка до 24 часов.</p>
            <p>• Играйте ответственно: лимиты и перерыв доступны в настройках.</p>
          </div>
        )}

        <button className="btn-primary w-full text-base py-4" onClick={accept} disabled={!checked || busy}>
          {busy ? 'Подтверждаем…' : '🚀 Поднять якорь и играть!'}
        </button>
        <p className="text-[10px] text-muted text-center leading-relaxed">
          Лимиты депозита и самоисключение — в настройках профиля.
        </p>
      </motion.div>
    </div>
  );
}

function HowStep({ n, emoji, title, text }: { n: number; emoji: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-danger/10 border border-danger/40 flex items-center justify-center shrink-0 text-base">
        {emoji}
      </div>
      <div>
        <p className="font-display text-main text-sm leading-tight">{n}. {title}</p>
        <p className="text-muted text-xs mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
