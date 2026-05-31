import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UsersAPI } from '../api/endpoints';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { getRank } from '../lib/rank';
import { useAuthStore } from '../stores/auth-store';

export default function PlayerScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meId = useAuthStore((s) => s.user?.id);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    if (id === meId) { navigate('/profile', { replace: true }); return; }
    UsersAPI.byId(id)
      .then(setPlayer)
      .catch(() => setPlayer(null))
      .finally(() => setLoading(false));
  }, [id, meId, navigate]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto space-y-4 pt-2">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="max-w-md mx-auto card p-6 text-center space-y-3">
        <Icon name="user" size={32} className="text-muted mx-auto" />
        <p className="text-main">Капитан не найден</p>
        <button className="btn-ghost w-full" onClick={() => navigate(-1)}>Назад</button>
      </div>
    );
  }

  const total = player.wins + player.losses;
  const wr = total ? Math.round((player.wins / total) * 100) : 0;
  const rank = getRank(player.wins);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button className="text-muted text-sm flex items-center gap-1" onClick={() => navigate(-1)}>
        <Icon name="arrow-right" size={14} className="rotate-180" /> Назад
      </button>
      <section className="card p-6 text-center">
        <Avatar name={player.username} src={player.avatar} size={72} className="mx-auto" />
        <h2 className="font-display text-xl text-main mt-3">{player.username}</h2>
        <div className="flex items-center justify-center gap-1.5 text-muted mt-1">
          <Icon name={rank.icon} size={16} />
          <span className="title text-xs">{rank.title}</span>
        </div>
      </section>
      <section className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
        <Stat label="Победы" value={player.wins} />
        <Stat label="Поражения" value={player.losses} accent />
        <Stat label="Точность" value={`${wr}%`} />
      </section>
      <button className="btn-primary w-full" onClick={() => navigate('/matchmaking')}>
        <Icon name="swords" size={16} /> Вызвать на дуэль
      </button>
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
