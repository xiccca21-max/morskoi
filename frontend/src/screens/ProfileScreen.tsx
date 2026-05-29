import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { tgShare } from '../lib/telegram';
import { getRank, rankProgress } from '../lib/rank';
import { Icon, IconName } from '../components/Icon';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;

  const total = user.wins + user.losses;
  const wr = total ? Math.round((user.wins / total) * 100) : 0;
  const rank = getRank(user.wins);
  const progress = rankProgress(user.wins);

  const invite = () => {
    const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    tgShare(`https://t.me/${bot}`, 'Вызываю на морскую дуэль со ставками.');
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img src={user.avatar} className="w-14 h-14 rounded-full border border-line" alt="" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-panel border border-line flex items-center justify-center font-display text-xl text-main">
              {user.firstName?.[0] ?? user.username?.[0] ?? '?'}
            </div>
          )}
          <div className="flex-1">
            <h2 className="font-display text-xl text-main">{user.firstName ?? user.username ?? 'Капитан'}</h2>
            <div className="flex items-center gap-1.5 mt-0.5 text-muted">
              <Icon name={rank.icon} size={16} />
              <span className="title text-xs">{rank.title}</span>
            </div>
          </div>
        </div>
        <div className="h-1 rounded-full bg-panel mt-4 overflow-hidden">
          <div className="h-full bg-main" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
        <Stat label="Победы" value={user.wins} />
        <Stat label="Поражения" value={user.losses} accent />
        <Stat label="Точность" value={`${wr}%`} />
      </section>

      <section className="card p-3 divide-y divide-line">
        <Row icon="coins" label="Казна" onClick={() => navigate('/wallet')} />
        <Row icon="scroll" label="Журнал боёв" onClick={() => navigate('/history')} />
        <Row icon="gear" label="Настройки" onClick={() => navigate('/settings')} />
        <Row icon="share" label="Позвать друга" onClick={invite} />
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="bg-panel p-4 text-center">
      <div className={['font-display text-2xl tabular-nums', accent ? 'text-danger' : 'text-main'].join(' ')}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

function Row({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 py-3 px-1 text-main hover:text-main transition">
      <Icon name={icon} size={18} className="text-muted" />
      <span className="flex-1 text-left text-sm">{label}</span>
      <Icon name="arrow-right" size={16} className="text-muted" />
    </button>
  );
}
