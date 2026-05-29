import { useSettingsStore } from '../stores/settings-store';
import { useAuthStore } from '../stores/auth-store';
import { Modal } from './Modal';
import { Icon, IconName } from './Icon';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'swords', title: 'Дуэль на ставку', text: 'Найдите соперника, поставьте равную сумму — победитель забирает банк.' },
  { icon: 'grid', title: 'Расставьте флот', text: 'Разместите корабли вручную или авто-расстановкой, затем топите врага.' },
  { icon: 'trophy', title: 'Забирайте выигрыш', text: 'Победителю — 95% банка. Комиссия платформы всего 5%.' },
];

export function Onboarding() {
  const done = useSettingsStore((s) => s.onboardingDone);
  const setDone = useSettingsStore((s) => s.setOnboardingDone);
  const user = useAuthStore((s) => s.user);
  const balance = user?.balance ?? 0;

  return (
    <Modal open={!done} dismissable={false} icon="anchor" title="Добро пожаловать на борт!">
      <p className="text-muted text-sm mb-4">
        «Морской Бой» — честная PvP-дуэль капитанов. Вот как всё устроено:
      </p>
      <div className="space-y-3 mb-4">
        {STEPS.map((s) => (
          <div key={s.title} className="flex items-start gap-3">
            <span className="shrink-0 w-9 h-9 rounded-lg bg-panel border border-line flex items-center justify-center text-danger">
              <Icon name={s.icon} size={18} />
            </span>
            <div>
              <p className="text-main text-sm font-display leading-tight">{s.title}</p>
              <p className="text-muted text-xs mt-0.5">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {balance > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-2 border-danger">
          <Icon name="coins" size={18} className="text-danger" />
          <p className="text-main text-xs">
            На счёт зачислено <span className="font-display">{balance} ₽</span> — попробуйте бой прямо сейчас.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted mb-4 leading-relaxed">
        Нажимая «Поднять якорь», вы подтверждаете, что вам есть 18 лет, и принимаете правила игры.
      </p>

      <button className="btn-primary w-full" onClick={() => setDone(true)}>
        <Icon name="anchor" size={16} /> Поднять якорь
      </button>
    </Modal>
  );
}
