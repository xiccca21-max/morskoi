import { useState } from 'react';
import { setAuthToken } from '../api/http';
import { UsersAPI } from '../api/endpoints';
import { useAuthStore } from '../stores/auth-store';
import { useThemeStore, THEMES } from '../stores/theme-store';
import { useSettingsStore } from '../stores/settings-store';
import { tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';

const DEPOSIT_LIMITS = [0, 1000, 5000, 10000];
const EXCLUDE_OPTIONS = [
  { days: 1, label: '24 часа' },
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
];

export default function SettingsScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const { theme, setTheme } = useThemeStore();
  const { sound, haptics, setSound, setHaptics } = useSettingsStore();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [depLimit, setDepLimit] = useState(0);
  const [savingLimit, setSavingLimit] = useState(false);
  const [confirmExclude, setConfirmExclude] = useState<number | null>(null);

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    window.location.reload();
  };

  const saveDepositLimit = async (v: number) => {
    setDepLimit(v); setSavingLimit(true);
    try {
      await UsersAPI.setLimits({ dailyDepositLimit: v });
      tgHaptic('success');
      toast(v > 0 ? `Лимит пополнения: ${v} ₽/день` : 'Лимит снят', 'success', 'check');
    } catch {
      tgHaptic('error');
      toast('Не удалось сохранить лимит', 'error');
    } finally { setSavingLimit(false); }
  };

  const selfExclude = async (days: number) => {
    try {
      await UsersAPI.setLimits({ selfExcludeDays: days });
      tgHaptic('success');
      toast('Самоисключение активировано', 'success', 'shield');
      setConfirmExclude(null);
      setTimeout(() => { setAuthToken(null); setUser(null); window.location.reload(); }, 1200);
    } catch {
      tgHaptic('error');
      toast('Не удалось активировать', 'error');
      setConfirmExclude(null);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">Настройки</h2>

      <section className="card p-3 divide-y divide-line">
        <Toggle label="Вибрация" value={haptics} onChange={setHaptics} />
        <Toggle label="Звук" value={sound} onChange={setSound} />
      </section>

      <section className="card p-5 space-y-3">
        <p className="eyebrow">Стиль интерфейса</p>
        <div className="space-y-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={['w-full py-2.5 px-3 rounded-lg text-sm text-left flex items-center justify-between border transition', theme === t.id ? 'bg-base border-line text-main' : 'border-transparent text-muted hover:text-main'].join(' ')}
            >
              <span>{t.name}</span>
              {theme === t.id && <Icon name="check" size={16} className="text-danger" />}
            </button>
          ))}
        </div>
      </section>

      {/* Ответственная игра */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="shield" size={16} className="text-muted" />
          <p className="eyebrow">Ответственная игра</p>
        </div>
        <p className="text-muted text-xs leading-relaxed">
          Дневной лимит пополнения помогает контролировать расходы.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {DEPOSIT_LIMITS.map((v) => (
            <button
              key={v}
              disabled={savingLimit}
              onClick={() => saveDepositLimit(v)}
              className={['py-2 rounded-lg text-xs font-display transition', depLimit === v ? 'bg-danger text-white' : 'bg-panel text-muted'].join(' ')}
            >
              {v === 0 ? 'Без лимита' : `${v / 1000}к`}
            </button>
          ))}
        </div>
        <div className="pt-1">
          <p className="text-muted text-xs mb-2">Сделать перерыв (самоисключение):</p>
          <div className="grid grid-cols-3 gap-1.5">
            {EXCLUDE_OPTIONS.map((o) => (
              <button key={o.days} onClick={() => setConfirmExclude(o.days)} className="py-2 rounded-lg text-xs font-display bg-panel text-muted hover:text-danger transition">
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <p className="eyebrow mb-2">Честная игра</p>
        <p className="text-main text-sm leading-relaxed">
          «Морской Бой» — честная PvP-дуэль на ставки. Платформа не играет против вас:
          комиссия составляет 5% с банка. Все ходы проверяются на сервере, поля соперников
          скрыты до выстрела — никто не видит расстановку противника.
        </p>
      </section>

      <button className="btn-danger w-full" onClick={() => setConfirmLogout(true)}><Icon name="logout" size={16} /> Выйти</button>

      <p className="text-center text-muted text-[10px] font-mono">сборка {__APP_BUILD__}</p>

      <ConfirmDialog
        open={confirmLogout}
        title="Выйти из аккаунта?"
        icon="logout"
        danger
        message="Вы выйдете из профиля. В следующий раз войдите снова через Telegram."
        confirmLabel="Выйти"
        onConfirm={logout}
        onCancel={() => setConfirmLogout(false)}
      />

      <ConfirmDialog
        open={confirmExclude !== null}
        title="Сделать перерыв?"
        icon="shield"
        danger
        message={<>Вход в игру будет заблокирован на {EXCLUDE_OPTIONS.find((o) => o.days === confirmExclude)?.label}. Это нельзя отменить досрочно.</>}
        confirmLabel="Подтвердить"
        onConfirm={() => confirmExclude && selfExclude(confirmExclude)}
        onCancel={() => setConfirmExclude(null)}
      />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="flex items-center justify-between w-full py-3 px-1" onClick={() => onChange(!value)}>
      <span className="text-main text-sm">{label}</span>
      <span className={['w-10 h-6 rounded-full p-0.5 transition relative', value ? 'bg-danger' : 'bg-panel'].join(' ')}>
        <span className={['block w-5 h-5 rounded-full bg-main transition', value ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
      </span>
    </button>
  );
}
