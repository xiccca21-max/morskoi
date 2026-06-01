import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { MatchmakingAPI } from '../api/endpoints';
import { tgShare, tgHaptic } from '../lib/telegram';
import { getSocket, newNonce } from '../api/socket';
import { useAuthStore } from '../stores/auth-store';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/Modal';
import { formatMoney } from '../lib/format';

const BOT = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';

export default function LobbyScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [lobby, setLobby] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmJoin, setConfirmJoin] = useState(false);
  const autoPrompted = useRef(false);

  const load = () => {
    if (!code) return;
    MatchmakingAPI.getLobby(code)
      .then(setLobby)
      .catch((e) => setError(e?.response?.data?.message ?? 'Лобби не найдено или истекло'));
  };

  useEffect(load, [code]);

  useEffect(() => {
    if (lobby?.status === 'STARTED' && lobby?.matchId) {
      navigate(`/placement/${lobby.matchId}`);
    }
  }, [lobby?.status, lobby?.matchId, navigate]);

  useEffect(() => {
    const sock = getSocket();
    const onFound = (data: any) => {
      tgHaptic('success');
      if (data?.matchId) navigate(`/placement/${data.matchId}`);
    };
    sock.on('match:found', onFound);
    return () => { sock.off('match:found', onFound); };
  }, [navigate]);

  const isHost = !!user && lobby?.host?.id === user.id;
  const lowFunds = !!user && lobby && user.balance < lobby.wagerAmount;

  // Гость с достаточным балансом — сразу показываем подтверждение (один тап до боя).
  useEffect(() => {
    if (!lobby || !user || isHost || autoPrompted.current) return;
    if (lobby.status !== 'OPEN') return;
    if (user.balance < lobby.wagerAmount) return;
    autoPrompted.current = true;
    const t = setTimeout(() => setConfirmJoin(true), 400);
    return () => clearTimeout(t);
  }, [lobby, user, isHost]);

  const inviteUrl = `https://t.me/${BOT}?startapp=lobby_${code}`;

  const share = () => {
    if (!lobby) return;
    tgShare(
      inviteUrl,
      `Вызываю на морской бой ⚓\nСтавка ${lobby.wagerAmount} ₽ — нажми и сразу в лобби`,
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      tgHaptic('success');
      toast('Ссылка скопирована', 'success', 'share');
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const accept = () => {
    if (!lobby || !code) return;
    setConfirmJoin(false);
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

  const goWallet = () => {
    navigate('/wallet', { state: { returnTo: `/lobby/${code}` } });
  };

  if (error && !lobby) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="card p-6 text-danger">{error}</div>
        <button className="btn-ghost w-full" onClick={() => navigate('/matchmaking')}>В поиск боя</button>
      </div>
    );
  }

  if (!lobby) return <div className="card p-6 max-w-md mx-auto text-muted">Загрузка…</div>;

  const hostName = lobby.host?.firstName || lobby.host?.username || 'Капитан';
  const pool = lobby.wagerAmount * 2;
  const win = +(pool - pool * 0.05).toFixed(2);
  const need = Math.max(0, lobby.wagerAmount - (user?.balance ?? 0));

  // Гость без денег — сначала пополнение, без лишних кнопок.
  if (!isHost && lowFunds) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="title text-main text-lg">Приглашение на бой</h2>
        <div className="card p-6 text-center space-y-4">
          <Avatar name={hostName} src={lobby.host?.avatar} size={56} className="mx-auto" />
          <p className="text-main font-display">{hostName} вызывает на дуэль</p>
          <p className="text-muted text-sm">
            Ставка <span className="text-main font-display">{formatMoney(lobby.wagerAmount)}</span>
          </p>
          <div className="card p-4 border-warning text-left space-y-2">
            <p className="text-warning text-sm font-display">Недостаточно средств</p>
            <p className="text-muted text-xs leading-relaxed">
              На балансе {formatMoney(user?.balance ?? 0)}. Для входа в бой нужно минимум{' '}
              {formatMoney(lobby.wagerAmount)} — не хватает {formatMoney(need)}.
            </p>
          </div>
          <button className="btn-primary w-full" onClick={goWallet}>
            <Icon name="coins" size={18} /> Пополнить баланс
          </button>
          <button className="btn-ghost w-full" onClick={() => navigate('/home')}>Позже</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="title text-main text-lg">{isHost ? 'Ваше лобби' : 'Приглашение на бой'}</h2>

      <div className="card p-6 text-center">
        {!isHost && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <Avatar name={hostName} src={lobby.host?.avatar} size={40} />
            <div className="text-left">
              <p className="text-main text-sm font-display">{hostName}</p>
              <p className="eyebrow">ждёт вас в лобби</p>
            </div>
          </div>
        )}
        {isHost && (
          <>
            <p className="eyebrow">Код приглашения</p>
            <p className="font-display text-5xl tracking-[0.3em] text-main mt-2">{lobby.code}</p>
          </>
        )}
        <div className="rope my-4" />
        <div className="grid grid-cols-2 gap-px bg-line rounded-lg overflow-hidden">
          <div className="bg-panel p-3">
            <div className="font-display tabular-nums text-main">{formatMoney(lobby.wagerAmount)}</div>
            <div className="eyebrow mt-0.5">Ставка</div>
          </div>
          <div className="bg-panel p-3">
            <div className="font-display tabular-nums text-main">{formatMoney(win)}</div>
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
            <p className="text-main text-sm">Ждём соперника. Отправьте ссылку — друг сразу попадёт сюда.</p>
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
          <button className="btn-primary w-full" onClick={() => setConfirmJoin(true)} disabled={joining}>
            <Icon name="swords" size={18} /> {joining ? 'Подключение…' : 'Принять вызов'}
          </button>
          <button className="btn-ghost w-full" onClick={() => navigate('/home')}>Отклонить</button>
        </>
      )}

      <ConfirmDialog
        open={confirmJoin}
        title="Принять бой?"
        icon="swords"
        message={
          <>
            Ставка <span className="text-main font-display">{formatMoney(lobby.wagerAmount)}</span> спишется
            при старте боя. Победителю —{' '}
            <span className="text-main font-display">{formatMoney(win)}</span>.
            <span className="block mt-2 text-warning">
              ⚠️ Нужен стабильный интернет — при обрыве связи можно проиграть ставку.
            </span>
          </>
        }
        confirmLabel="Да, в бой"
        cancelLabel="Отмена"
        onConfirm={accept}
        onCancel={() => setConfirmJoin(false)}
      />
    </div>
  );
}
