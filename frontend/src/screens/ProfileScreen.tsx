import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { tgShare, tgPhotoUrl, tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { getRank, rankProgress, nextRank, winsToNext } from '../lib/rank';
import { Icon, IconName } from '../components/Icon';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;

  const total = user.wins + user.losses;
  const wr = total ? Math.round((user.wins / total) * 100) : 0;
  const rank = getRank(user.wins);
  const progress = rankProgress(user.wins);
  const next = nextRank(user.wins);
  const toNext = winsToNext(user.wins);
  const avatarUrl = user.avatar ?? tgPhotoUrl();

  const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';

  const invite = () => {
    tgShare(`https://t.me/${bot}`, 'Вызываю на морскую дуэль со ставками. Кто кого потопит?');
  };

  const shareProfile = () => {
    tgHaptic('success');
    const name = user.firstName ?? user.username ?? 'Капитан';
    tgShare(
      `https://t.me/${bot}`,
      `${name} — ${rank.title} в «Морском Бою»: ${user.wins} побед, точность ${wr}%. Сразись со мной!`,
    );
    toast('Профиль готов к отправке', 'success', 'share');
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} className="w-14 h-14 rounded-full border border-line object-cover" alt="" />
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
          <button className="btn-ghost w-10 h-10 p-0 shrink-0" onClick={shareProfile} aria-label="Поделиться профилем">
            <Icon name="share" size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between eyebrow mt-4 mb-1.5">
          <span className="flex items-center gap-1.5 text-muted">
            {next ? <><Icon name={next.icon} size={13} /> до звания «{next.title}»</> : 'Высшее звание'}
          </span>
          <span className="text-muted tabular-nums">{next ? `${user.wins}/${rank.next}` : '∞'}</span>
        </div>
        <div className="h-1 rounded-full bg-panel overflow-hidden">
          <div className="h-full bg-main transition-all" style={{ width: `${progress}%` }} />
        </div>
        {next && (
          <p className="text-muted text-xs mt-2">Ещё {toNext} {plural(toNext)} до следующего звания</p>
        )}
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

function plural(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'побед';
  if (b > 1 && b < 5) return 'победы';
  if (b === 1) return 'победа';
  return 'побед';
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
