import { useState } from 'react';
import { setAuthToken } from '../api/http';
import { useAuthStore } from '../stores/auth-store';
import { useThemeStore, THEMES, Theme } from '../stores/theme-store';
import { Icon } from '../components/Icon';

export default function SettingsScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const { theme, setTheme } = useThemeStore();
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    window.location.reload();
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

      <section className="card p-5">
        <p className="eyebrow mb-2">Об игре</p>
        <p className="text-main text-sm leading-relaxed">
          «Морской Бой» — честная PvP-дуэль на ставки. Платформа не играет против вас:
          комиссия составляет 5% с банка. Топите флот соперника и забирайте выигрыш.
        </p>
      </section>

      <button className="btn-danger w-full" onClick={logout}><Icon name="logout" size={16} /> Выйти</button>
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
