import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { tgShare } from '../lib/telegram';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;

  const total = user.wins + user.losses;
  const wr = total ? Math.round((user.wins / total) * 100) : 0;

  const invite = () => {
    const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    tgShare(`https://t.me/${botUser}`, '⚓ Сразимся в Naval Clash — PvP морской бой со ставками!');
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6 flex items-center gap-4">
        {user.avatar
          ? <img src={user.avatar} className="w-16 h-16 rounded-full" alt="" />
          : <div className="w-16 h-16 rounded-full bg-cyber-cyan/20 flex items-center justify-center font-display text-2xl">{user.firstName?.[0] ?? user.username?.[0] ?? '?'}</div>}
        <div>
          <h2 className="font-display text-xl">{user.firstName ?? user.username ?? 'Captain'}</h2>
          {user.username && <p className="text-white/50 text-sm">@{user.username}</p>}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Победы"   value={user.wins} accent="text-sonar-400" />
        <Stat label="Поражения" value={user.losses} accent="text-cyber-red" />
        <Stat label="Winrate"  value={`${wr}%`} accent="text-cyber-cyan" />
      </section>

      <section className="card p-5">
        <h3 className="font-display text-cyber-cyan text-sm tracking-widest mb-2">ДЕЙСТВИЯ</h3>
        <div className="space-y-2">
          <button className="btn-secondary w-full" onClick={() => navigate('/wallet')}>💰 Кошелёк</button>
          <button className="btn-secondary w-full" onClick={() => navigate('/history')}>📜 История боёв</button>
          <button className="btn-secondary w-full" onClick={() => navigate('/settings')}>⚙ Настройки</button>
          <button className="btn-primary w-full" onClick={invite}>📨 Пригласить друга</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="card p-3">
      <div className={`font-display text-2xl ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
