import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI } from '../api/endpoints';
import { tgShare } from '../lib/telegram';
import { Icon } from '../components/Icon';

export default function LobbyScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    MatchmakingAPI.getLobby(code)
      .then(setLobby)
      .catch((e) => setError(e?.response?.data?.message ?? 'Лобби не найдено'));
  }, [code]);

  const share = () => {
    if (!lobby) return;
    const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    tgShare(`https://t.me/${bot}?startapp=lobby_${lobby.code}`, `Морская дуэль. Ставка ${lobby.wagerAmount} ₽. Код: ${lobby.code}`);
  };

  if (error) return <div className="card p-6 text-danger max-w-md mx-auto">{error}</div>;
  if (!lobby) return <div className="card p-6 max-w-md mx-auto text-muted">Загрузка…</div>;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">Приватное лобби</h2>
      <div className="card p-6 text-center">
        <p className="eyebrow">Код приглашения</p>
        <p className="font-display text-5xl tracking-[0.3em] text-main mt-2">{lobby.code}</p>
        <div className="rope my-4" />
        <p className="text-main text-sm">Ставка: <span className="text-main tabular-nums">{lobby.wagerAmount} ₽</span></p>
        <p className="eyebrow mt-1">Статус: {lobby.status}</p>
      </div>
      <button className="btn-primary w-full" onClick={share}><Icon name="share" size={16} /> Отправить вызов</button>
      <button className="btn-ghost w-full" onClick={() => navigate('/matchmaking')}>Назад</button>
    </div>
  );
}
