import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI } from '../api/endpoints';
import { tgShare } from '../lib/telegram';

export default function LobbyScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    MatchmakingAPI.getLobby(code).then(setLobby).catch((e) => setError(e?.response?.data?.message ?? 'Лобби не найдено'));
  }, [code]);

  const share = () => {
    if (!lobby) return;
    const botUser = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
    const url = `https://t.me/${botUser}?startapp=lobby_${lobby.code}`;
    tgShare(url, `⚓ Дуэль в Naval Clash! Ставка $${lobby.wagerAmount}. Код: ${lobby.code}`);
  };

  if (error) return <div className="card p-6 text-cyber-red">{error}</div>;
  if (!lobby) return <div className="card p-6">Загрузка…</div>;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="font-display text-cyber-cyan tracking-widest text-sm">ПРИВАТНОЕ ЛОББИ</h2>
      <div className="card p-6 text-center">
        <p className="text-white/60 text-sm">Код приглашения</p>
        <p className="font-display text-5xl tracking-[0.3em] text-cyber-cyan mt-2">{lobby.code}</p>
        <p className="text-white/60 text-sm mt-2">Ставка: <b>${lobby.wagerAmount}</b></p>
        <p className="text-white/40 text-xs mt-2">Статус: {lobby.status}</p>
      </div>
      <button className="btn-primary w-full" onClick={share}>📨 Поделиться ссылкой</button>
      <button className="btn-ghost w-full" onClick={() => navigate('/matchmaking')}>Назад</button>
    </div>
  );
}
