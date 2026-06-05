import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../stores/settings-store';
import { useGameConfigStore } from '../stores/game-config-store';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { tgHaptic } from '../lib/telegram';

export function Onboarding() {
  const done = useSettingsStore((s) => s.onboardingDone);
  const setDone = useSettingsStore((s) => s.setOnboardingDone);
  const platformRakePercent = useGameConfigStore((s) => s.platformRakePercent);
  const winPct = 100 - platformRakePercent;
  const [checked, setChecked] = useState(false);

  const accept = () => {
    if (!checked) {
      tgHaptic('error');
      return;
    }
    tgHaptic('success');
    setDone(true);
  };

  return (
    <Modal open={!done} dismissable={false} icon="anchor" title="Добро пожаловать на борт!">
      {/* Три шага в одном экране — без листания */}
      <div className="space-y-3 mb-5">
        <Step n={1} icon="swords" title="Найди соперника" text="Выбери ставку и нажми «Найти соперника» — система подберёт игрока с такой же суммой." />
        <Step n={2} icon="grid" title="Расставь корабли" text="Ставь корабли на поле. Тапни ещё раз — повернёт. Потом топи врага по очереди." />
        <Step n={3} icon="trophy" title="Забирай выигрыш" text={`Победитель забирает ${winPct}% от ставки обоих. Проиграл — ставка уходит сопернику.`} />
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none bg-panel rounded-lg p-3 mb-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { setChecked(e.target.checked); tgHaptic('light'); }}
          className="mt-0.5 w-5 h-5 accent-danger shrink-0"
        />
        <span className="text-xs text-muted leading-relaxed">
          Мне есть 18 лет. Я понимаю, что игра на деньги — это риск. Принимаю правила.
        </span>
      </label>

      {!checked && (
        <p className="text-[11px] text-muted text-center mb-3">↑ Поставь галочку, чтобы продолжить</p>
      )}

      <button
        className="btn-primary w-full"
        onClick={accept}
        disabled={!checked}
      >
        <Icon name="anchor" size={16} /> Поднять якорь
      </button>
    </Modal>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: string; title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: (n - 1) * 0.08 }}
      className="flex items-start gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-danger/10 border border-danger/40 flex items-center justify-center shrink-0 mt-0.5">
        <Icon name={icon as any} size={16} className="text-danger" />
      </div>
      <div>
        <p className="font-display text-main text-sm leading-tight">{title}</p>
        <p className="text-muted text-xs mt-0.5 leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}
