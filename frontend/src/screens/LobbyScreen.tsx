import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI } from '../api/endpoints';
import { tgShare, tgHaptic } from '../lib/telegram';
import { getSocket, newNonce } from '../api/socket';
import { useAuthStore } from '../stores/auth-store';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';

const BOT = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';

export default function LobbyScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [lobby, setLobby] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => {
    if (!code) return;
    MatchmakingAPI.getLobby(code)
      .then(setLobby)
      .catch((e) => setError(e?.response?.data?.message ?? 'Лобби не найдено или истекло'));
  };

  useEffect(load, [code]);

  // Уже стартовавшее лобби — сразу в расстановку
  useEffect(() => {
    if (lobby?.status === 'STARTED' && lobby?.matchId) {
      navigate(`/placement/${lobby.matchId}`);
    }
  }, [lobby?.status, lobby?.matchId, navigate]);

  // Когда соперник принимает вызов — сервер шлёт match:found обоим
  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => {
      tgHaptic('success');
      if (data?.matchId) navigate(`/placement/${data.matchId}`);
    };
    sock.on('match:found', onFound);
    return () => { sock.off('match:found', onFound); };
  }, [navigate]);

  const inviteUrl = `https://t.me/${BOT}?startapp=lobby_${code}`;

  const share = () => {
    if (!lobby) return;
    tgShare(inviteUrl, `Вызываю на морскую дуэль. Ставка ${lobby.wagerAmount} ₽. Код: ${lobby.code}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      tgHaptic('success');
      toast('Ссылка-приглашение скопирована', 'success', 'share');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const accept = () => {
    if (!lobby || !code) return;
    if (user && user.balance < lobby.wagerAmount) {
      setError('Недостаточно средств для этой ставки');
      return;
    }
    setError(null);
    setJoining(true);
    tgHaptic('medium');
    getSocket().emit('lobby:join', { code: code.toUpperCase(), nonce: newNonce() }, (ack: any) => {
      if (!ack?.ok) {
        setError(ack?.error ?? 'Не удалось присоединиться');
        setJoining(false);
        return;
      }
      navigate(`/placement/${ack.matchId}`);
    });
  };

  if (error && !lobby)
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="card p-6 text-danger">{error}</div>
        <button className="btn-ghost w-full" onClick={() => navigate('/matchmaking')}>В поиск боя</button>
      </div>
    );
  if (!lobby) return <div className="card p-6 max-w-md mx-auto text-muted">Загрузка…</div>;

  const isHost = !!user && lobby.host?.id === user.id;
  const hostName = lobby.host?.firstName || lobby.host?.username || 'Капитан';
  const pool = lobby.wagerAmount * 2;
  const win = +(pool - pool * 0.05).toFixed(2);
  const lowFunds = !!user && user.balance < lobby.wagerAmount;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">{isHost ? 'Ваше лобби' : 'Приглашение на бой'}</h2>

      <div className="card p-6 text-center">
        <p className="eyebrow">Код приглашения</p>
        <p className="font-display text-5xl tracking-[0.3em] text-main mt-2">{lobby.code}</p>
        {lobby.matchId && (
          <p className="text-[10px] text-muted font-mono tracking-wide mt-1">
            Игра #{lobby.matchId.slice(-8).toUpperCase()}
          </p>
        )}
        <div className="rope my-4" />
        <div className="grid grid-cols-2 gap-px bg-line rounded-lg overflow-hidden">
          <div className="bg-panel p-3">
            <div className="font-display tabular-nums text-main">{lobby.wagerAmount} ₽</div>
            <div className="eyebrow mt-0.5">Ставка</div>
          </div>
          <div className="bg-panel p-3">
            <div className="font-display tabular-nums text-main">{win} ₽</div>
            <div className="eyebrow mt-0.5">Победителю</div>
          </div>
        </div>
      </div>

      {error && <div className="card p-3 text-danger text-sm border-danger">{error}</div>}

      {isHost ? (
        <>
          <motion.div className="card p-5 flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="relative w-6 h-6 shrink-0">
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-danger animate-spin" />
            </span>
            <p className="text-main text-sm">Ждём соперника. Отправьте ссылку или код другу — бой начнётся автоматически.</p>
          </motion.div>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary" onClick={share}><Icon name="share" size={16} /> Отправить</button>
            <button className="btn-secondary" onClick={copy}>
              <Icon name={copied ? 'check' : 'scroll'} size={16} /> {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <button className="btn-ghost w-full" onClick={async () => {
            try { await MatchmakingAPI.cancelOpen(); } catch {}
            navigate('/matchmaking');
          }}>Отменить</button>
        </>
      ) : (
        <>
          <div className="card p-5 flex items-center gap-3">
            <Avatar name={hostName} src={lobby.host?.avatar} size={40} />
            <div>
              <p className="text-main text-sm font-display">{hostName}</p>
              <p className="eyebrow">вызывает вас на дуэль</p>
            </div>
          </div>
          <button className="btn-primary w-full" onClick={accept} disabled={joining || lowFunds}>
            <Icon name="swords" size={18} /> {joining ? 'Подключение…' : 'Принять вызов'}
          </button>
          {lowFunds && (
            <button className="btn-secondary w-full" onClick={() => navigate('/wallet')}>
              <Icon name="coins" size={16} /> Пополнить баланс
            </button>
          )}
          <button className="btn-ghost w-full" onClick={() => navigate('/home')}>Отклонить</button>
        </>
      )}
    </div>
  );
}
