import { useState } from 'react';
import { setAuthToken } from '../api/http';
import { useAuthStore } from '../stores/auth-store';

export default function SettingsScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    window.location.reload();
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="font-display text-cyber-cyan tracking-widest text-sm">НАСТРОЙКИ</h2>

      <section className="card p-4 space-y-1">
        <Toggle label="Вибрация" value={haptics} onChange={setHaptics} />
        <Toggle label="Звук" value={sound} onChange={setSound} />
      </section>

      <section className="card p-4">
        <h3 className="font-display text-cyber-cyan text-sm tracking-widest mb-2">О ИГРЕ</h3>
        <p className="text-white/70 text-sm leading-relaxed">
          Naval Clash — это PvP-морской бой с реальными ставками.
          Платформа никогда не играет против пользователей: она зарабатывает только 5% rake с призового пула.
        </p>
      </section>

      <button className="btn-danger w-full" onClick={logout}>Выйти</button>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className="flex items-center justify-between w-full py-3 px-2 rounded-lg hover:bg-white/5"
      onClick={() => onChange(!value)}
    >
      <span>{label}</span>
      <span className={[
        'w-11 h-6 rounded-full p-0.5 transition relative',
        value ? 'bg-cyber-cyan' : 'bg-navy-700',
      ].join(' ')}>
        <span className={[
          'block w-5 h-5 rounded-full bg-white transition',
          value ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')} />
      </span>
    </button>
  );
}
