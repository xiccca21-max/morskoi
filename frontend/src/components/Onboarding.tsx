import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettingsStore } from '../stores/settings-store';
import { useAuthStore } from '../stores/auth-store';
import { Modal } from './Modal';
import { Icon, IconName } from './Icon';
import { tgHaptic } from '../lib/telegram';
import { formatMoney } from '../lib/format';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'swords', title: 'Дуэль на ставку', text: 'Найдите соперника, поставьте равную сумму — победитель забирает банк.' },
  { icon: 'grid', title: 'Расставьте флот', text: 'Разместите корабли вручную или авто-расстановкой, затем топите врага по очереди.' },
  { icon: 'trophy', title: 'Забирайте выигрыш', text: 'Победителю — 95% банка. Комиссия платформы всего 5%, вывод — на ваш @CryptoBot.' },
];

export function Onboarding() {
  const done = useSettingsStore((s) => s.onboardingDone);
  const setDone = useSettingsStore((s) => s.setOnboardingDone);
  const user = useAuthStore((s) => s.user);
  const balance = user?.balance ?? 0;
  const [step, setStep] = useState(0);

  const last = step === STEPS.length - 1;
  const next = () => {
    tgHaptic('light');
    if (last) setDone(true);
    else setStep((s) => s + 1);
  };
  const go = (i: number) => { if (i >= 0 && i < STEPS.length) setStep(i); };

  return (
    <Modal open={!done} dismissable={false} icon="anchor" title="Добро пожаловать на борт!">
      <div className="relative overflow-hidden min-h-[150px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(step + 1);
              else if (info.offset.x > 60) go(step - 1);
            }}
            className="flex flex-col items-center text-center px-2 cursor-grab active:cursor-grabbing"
          >
            <span className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger flex items-center justify-center text-danger mb-4">
              <Icon name={STEPS[step].icon} size={30} />
            </span>
            <p className="font-display text-lg text-main">{STEPS[step].title}</p>
            <p className="text-muted text-sm mt-1.5 leading-relaxed">{STEPS[step].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Точки-индикаторы */}
      <div className="flex items-center justify-center gap-2 my-4">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`Слайд ${i + 1}`}
            className={['h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-danger' : 'w-1.5 bg-line'].join(' ')}
          />
        ))}
      </div>

      {balance > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-2 border-danger">
          <Icon name="coins" size={18} className="text-danger" />
          <p className="text-main text-xs">
            На счёт зачислено <span className="font-display">{formatMoney(balance)}</span> — попробуйте бой прямо сейчас.
          </p>
        </div>
      )}

      {last && (
        <p className="text-[11px] text-muted mb-4 leading-relaxed">
          Нажимая «Поднять якорь», вы подтверждаете, что вам есть 18 лет, и принимаете правила игры.
        </p>
      )}

      <div className="flex gap-2">
        {!last && (
          <button className="btn-ghost flex-1" onClick={() => setDone(true)}>Пропустить</button>
        )}
        <button className="btn-primary flex-1" onClick={next}>
          {last ? <><Icon name="anchor" size={16} /> Поднять якорь</> : 'Далее'}
        </button>
      </div>
    </Modal>
  );
}
