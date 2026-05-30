import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { AuthAPI, UsersAPI } from '../api/endpoints';
import { setAuthToken } from '../api/http';
import { tgShare, tgPhotoUrl, tgHaptic, tgOpenLink } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { getRank, rankProgress, nextRank, winsToNext } from '../lib/rank';
import type { Rank } from '../lib/rank';
import { Icon, IconName } from '../components/Icon';
import { Modal, ConfirmDialog } from '../components/Modal';

const ALL_RANKS: Rank[] = [
  { title: 'Юнга',    icon: 'anchor',  min: 0,  next: 3  },
  { title: 'Матрос',  icon: 'ship',    min: 3,  next: 8  },
  { title: 'Боцман',  icon: 'compass', min: 8,  next: 15 },
  { title: 'Штурман', icon: 'wheel',   min: 15, next: 30 },
  { title: 'Капитан', icon: 'medal',   min: 30, next: 60 },
  { title: 'Адмирал', icon: 'crown',   min: 60             },
];

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [showRanks, setShowRanks] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showNick, setShowNick] = useState(false);
  const [nick, setNick] = useState('');
  const [savingNick, setSavingNick] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;

  const total = user.wins + user.losses;
  const wr = total ? Math.round((user.wins / total) * 100) : 0;
  const rank = getRank(user.wins);
  const progress = rankProgress(user.wins);
  const next = nextRank(user.wins);
  const toNext = winsToNext(user.wins);
  const avatarUrl = !avatarFailed ? (user.avatar ?? tgPhotoUrl()) : undefined;
  const displayName = user.nickname ?? user.firstName ?? user.username ?? 'Капитан';
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : null;

  const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
  const refLink = `https://t.me/${bot}?startapp=ref_${user.id}`;
  const supportUrl = (import.meta.env.VITE_SUPPORT_URL as string) ?? `https://t.me/${bot}`;

  const invite = () => {
    tgShare(refLink, 'Вызываю на морскую дуэль со ставками. Регистрируйся по ссылке — нам обоим бонус!');
  };

  const copyId = () => {
    navigator.clipboard.writeText(user.telegramId).catch(() => {});
    toast('ID скопирован', 'success', 'check');
  };

  const copyRef = () => {
    navigator.clipboard.writeText(refLink).catch(() => {});
    toast('Ссылка скопирована', 'success', 'check');
  };

  const shareProfile = () => {
    tgHaptic('success');
    tgShare(refLink, `${displayName} — ${rank.title} в «Морском Бою»: ${user.wins} побед, точность ${wr}%. Сразись со мной!`);
    toast('Профиль готов к отправке', 'success', 'share');
  };

  const openNick = () => { setNick(user.nickname ?? ''); setShowNick(true); };
  const saveNick = async () => {
    if (nick.trim().length < 2) { toast('Ник слишком короткий', 'error'); return; }
    setSavingNick(true);
    try {
      const u = await AuthAPI.setNickname(nick.trim());
      patchUser({ nickname: u.nickname });
      tgHaptic('success');
      toast('Ник обновлён', 'success', 'check');
      setShowNick(false);
    } catch (e: any) {
      tgHaptic('error');
      toast(e?.response?.data?.message ?? 'Не удалось сохранить', 'error');
    } finally { setSavingNick(false); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await UsersAPI.deleteMe();
      setAuthToken(null);
      setUser(null);
      window.location.reload();
    } catch (e: any) {
      tgHaptic('error');
      toast(e?.response?.data?.message ?? 'Не удалось удалить аккаунт', 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <section className="card p-6">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              className="w-14 h-14 rounded-full border border-line object-cover"
              alt=""
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-panel border border-line flex items-center justify-center font-display text-xl text-main">
              {displayName[0] ?? '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl text-main truncate">{displayName}</h2>
              <button onClick={openNick} className="text-muted hover:text-main shrink-0" aria-label="Изменить ник">
                <Icon name="pencil" size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-muted">
              <Icon name={rank.icon} size={16} />
              <span className="title text-xs">{rank.title}</span>
            </div>
            <button
              onClick={copyId}
              className="flex items-center gap-1 mt-0.5 text-muted text-[11px] hover:text-main"
              aria-label="Скопировать игровой ID"
            >
              ID: <span className="tabular-nums font-medium">{user.telegramId}</span>
              <Icon name="check" size={11} />
            </button>
            {memberSince && <p className="text-muted text-[11px] mt-0.5">В игре с {memberSince}</p>}
          </div>
          <button className="btn-ghost w-10 h-10 p-0 shrink-0" onClick={shareProfile} aria-label="Поделиться профилем">
            <Icon name="share" size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between eyebrow mt-4 mb-1.5">
          <span className="flex items-center gap-1.5 text-muted">
            {next ? <><Icon name={next.icon} size={13} /> до звания «{next.title}»</> : 'Высшее звание'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted tabular-nums">{next ? `${user.wins}/${rank.next}` : '∞'}</span>
            <button
              onClick={() => setShowRanks(true)}
              className="text-[10px] text-danger font-display uppercase tracking-wide hover:underline"
            >
              Подробнее
            </button>
          </div>
        </div>
        <div className="h-1 rounded-full bg-panel overflow-hidden">
          <div className="h-full bg-main transition-all" style={{ width: `${progress}%` }} />
        </div>
        {next && (
          <p className="text-muted text-xs mt-2">Ещё {toNext} {plural(toNext)} до следующего звания</p>
        )}

      </section>

      {/* Модаль: система званий */}
      <Modal open={showRanks} onClose={() => setShowRanks(false)} title="Система званий" icon="medal">
        <p className="text-muted text-xs mb-4 leading-relaxed">
          Звание растёт с каждой победой. Чем выше звание — тем статуснее профиль в таблице лидеров.
        </p>
        <ul className="space-y-2">
          {ALL_RANKS.map((r) => {
            const isCurrent = r.title === rank.title;
            return (
              <li
                key={r.title}
                className={['flex items-center gap-3 rounded-lg px-3 py-2 transition', isCurrent ? 'bg-danger/10 border border-danger' : 'bg-panel'].join(' ')}
              >
                <Icon name={r.icon} size={18} className={isCurrent ? 'text-danger' : 'text-muted'} />
                <div className="flex-1">
                  <span className={['font-display text-sm', isCurrent ? 'text-danger' : 'text-main'].join(' ')}>
                    {r.title}
                    {isCurrent && <span className="ml-2 text-[10px] bg-danger text-white rounded px-1.5 py-0.5 uppercase tracking-wide">Сейчас</span>}
                  </span>
                </div>
                <span className="text-muted text-xs tabular-nums">
                  {r.min === 0 ? 'с 0 побед' : `с ${r.min}`}
                  {r.next ? ` → ${r.next}` : ' · Максимум'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted text-[11px] mt-4 leading-relaxed">
          Победы считаются только в платных матчах. Отменённые и ничейные бои не влияют на рейтинг.
        </p>
      </Modal>

      <section className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden">
        <Stat label="Победы" value={user.wins} />
        <Stat label="Поражения" value={user.losses} accent />
        <Stat label="Точность" value={`${wr}%`} />
      </section>

      {/* Реферальная программа */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Приглашай друзей</p>
            <p className="text-main text-sm mt-1">Бонус тебе и другу за каждого приглашённого</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl text-main tabular-nums">{user.referralCount ?? 0}</p>
            <p className="eyebrow">друзей</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn-primary flex-1" onClick={invite}><Icon name="share" size={16} /> Пригласить</button>
          <button className="btn-ghost px-4" onClick={copyRef} aria-label="Скопировать ссылку"><Icon name="check" size={16} /></button>
        </div>
      </section>

      <section className="card p-3 divide-y divide-line">
        <Row icon="coins" label="Казна" onClick={() => navigate('/wallet')} />
        <Row icon="scroll" label="Журнал боёв" onClick={() => navigate('/history')} />
        <Row icon="gear" label="Настройки" onClick={() => navigate('/settings')} />
        <Row icon="shield" label="Поддержка" onClick={() => tgOpenLink(supportUrl)} />
      </section>

      <section className="card p-3">
        <button onClick={() => setConfirmDelete(true)} className="w-full flex items-center gap-3 py-3 px-1 text-danger transition">
          <Icon name="logout" size={18} />
          <span className="flex-1 text-left text-sm">Удалить аккаунт</span>
          <Icon name="arrow-right" size={16} />
        </button>
      </section>

      {/* Модаль: ник */}
      <Modal open={showNick} onClose={() => setShowNick(false)} title="Изменить ник" icon="user">
        <p className="text-muted text-xs mb-3">От 2 до 24 символов. Виден соперникам и в таблице лидеров.</p>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={24}
          placeholder={user.firstName ?? 'Капитан'}
          className="w-full px-3 py-2.5 rounded-lg bg-panel border border-line text-main outline-none text-sm mb-3"
        />
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={saveNick} disabled={savingNick || nick.trim().length < 2}>
            {savingNick ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button className="btn-ghost w-full" onClick={() => setShowNick(false)}>Отмена</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить аккаунт?"
        icon="logout"
        busy={deleting}
        danger
        message={<>Это действие необратимо. Баланс должен быть нулевым, активных боёв быть не должно. Профиль и статистика будут удалены.</>}
        confirmLabel="Удалить"
        onConfirm={deleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
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
