import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { AuthAPI, UsersAPI } from '../api/endpoints';
import { setAuthToken } from '../api/http';
import { tgShare, tgPhotoUrl, tgHaptic, tgOpenLink } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { getRank, rankProgress, nextRank, winsToNext, ALL_RANKS } from '../lib/rank';
import { Icon, IconName } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { ReferralCard } from '../components/ReferralCard';
import { WeeklyStats } from '../components/WeeklyStats';
import { ACHIEVEMENTS, statsFromUser } from '../lib/achievements';
import { referralBotLink, referralShareText } from '../lib/referral';
import { Modal, ConfirmDialog } from '../components/Modal';

const ALL_RANKS_LOCAL = ALL_RANKS;

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [showRanks, setShowRanks] = useState(false);
  const [showNick, setShowNick] = useState(false);
  const [nick, setNick] = useState('');
  const [savingNick, setSavingNick] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  if (!user) return null;

  const total = user.wins + user.losses;
  const wr = total ? Math.round((user.wins / total) * 100) : 0;
  const rank = getRank(user.wins);
  const progress = rankProgress(user.wins);
  const next = nextRank(user.wins);
  const toNext = winsToNext(user.wins);
  const avatarUrl = user.avatar ?? tgPhotoUrl();
  const displayName = user.nickname ?? user.firstName ?? user.username ?? 'Капитан';
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : null;

  const supportUrl = (import.meta.env.VITE_SUPPORT_URL as string) || 'https://t.me/Naval_pay_manager';

  const achStats = statsFromUser({ ...user, wins: user.wins, losses: user.losses });
  const totalAchievements = ACHIEVEMENTS.length;
  const earnedAchievements = ACHIEVEMENTS.filter((a) => a.earned(achStats)).length;

  const copyId = () => {
    navigator.clipboard.writeText(user.telegramId).catch(() => {});
    tgHaptic('success');
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1200);
  };

  const shareProfile = () => {
    tgHaptic('success');
    const link = referralBotLink(user.id);
    tgShare(link, referralShareText(displayName));
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
      <section className="card overflow-hidden">
        {/* Аватар + имя */}
        <div className="flex items-center gap-4 p-5">
          <div className="relative shrink-0 grid place-items-center" style={{ width: 64, height: 64 }}>
            <svg width="64" height="64" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="32" cy="32" r="29" fill="none" stroke="var(--c-line)" strokeWidth="3" />
              <circle
                cx="32" cy="32" r="29" fill="none"
                stroke="var(--c-danger)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 29}
                strokeDashoffset={(1 - progress / 100) * 2 * Math.PI * 29}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            </svg>
            <Avatar name={displayName} src={avatarUrl} size={52} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl text-main truncate">{displayName}</h2>
              <button onClick={openNick} className="text-muted hover:text-main shrink-0" aria-label="Изменить ник">
                <Icon name="pencil" size={14} />
              </button>
            </div>
            {/* Звание — отдельная строка */}
            <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full bg-panel border border-line">
              <Icon name={rank.icon} size={12} className="text-danger" />
              <span className="font-display text-[11px] uppercase tracking-wide text-main">{rank.title}</span>
            </div>
          </div>
          <button
            onClick={shareProfile}
            aria-label="Поделиться профилем"
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-muted hover:text-main transition"
          >
            <Icon name="share" size={20} />
          </button>
        </div>

        {/* Разделитель */}
        <div className="border-t border-line" />

        {/* Мета-строки */}
        <div className="px-5 py-3 space-y-2">
          {/* ID с копированием */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted">ID</span>
            <button
              onClick={copyId}
              className="flex items-center gap-1.5 text-main text-[13px] font-medium tabular-nums hover:text-danger transition"
              aria-label="Скопировать ID"
            >
              {user.telegramId}
              <span
                style={{ transition: 'color 0.2s' }}
                className={idCopied ? 'text-danger' : 'text-muted'}
              >
                <Icon name={idCopied ? 'check' : 'copy'} size={14} />
              </span>
            </button>
          </div>
          {memberSince && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-muted">В игре с</span>
              <span className="text-main text-[13px]">{memberSince}</span>
            </div>
          )}
        </div>

        {/* Разделитель */}
        <div className="border-t border-line" />

        {/* Прогресс до следующего звания */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              {next ? <><Icon name={next.icon} size={12} /> до «{next.title}»</> : 'Высшее звание'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted text-xs tabular-nums">{next ? `${user.wins} / ${rank.next}` : '∞'}</span>
              <button
                onClick={() => setShowRanks(true)}
                className="text-[10px] text-danger font-display uppercase tracking-wide hover:underline"
              >
                Подробнее
              </button>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-panel overflow-hidden">
            <div className="h-full bg-danger rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          {next && (
            <p className="text-muted text-[11px] mt-1.5">Ещё {toNext} {plural(toNext)} до следующего звания</p>
          )}
        </div>
      </section>

      <section className="card p-3 divide-y divide-line">
        <Row icon="coins" label="Казна" onClick={() => navigate('/wallet')} />
        <Row icon="trophy" label="Рейтинг капитанов" onClick={() => navigate('/leaderboard')} />
        <Row icon="scroll" label="Журнал боёв" onClick={() => navigate('/history')} />
        <Row icon="compass" label="Как это работает" onClick={() => navigate('/how-it-works')} />
        <Row icon="gear" label="Настройки" onClick={() => navigate('/settings')} />
        <Row icon="shield" label="Поддержка" onClick={() => tgOpenLink(supportUrl)} />
      </section>

      <ReferralCard userId={user.id} displayName={displayName} referralCount={user.referralCount} />
      <WeeklyStats />

      {/* Модаль: система званий */}
      <Modal open={showRanks} onClose={() => setShowRanks(false)} title="Система званий" icon="medal">
        <p className="text-muted text-xs mb-4 leading-relaxed">
          Звание растёт с каждой победой. Чем выше звание — тем статуснее профиль в таблице лидеров.
        </p>
        <ul className="space-y-2">
          {ALL_RANKS_LOCAL.map((r) => {
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


      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/achievements')}
          className="card card-press p-4 flex flex-col items-start gap-1.5 text-left"
        >
          <Icon name="medal" size={22} className="text-danger" />
          <span className="font-display text-sm text-main">Достижения</span>
          <span className="text-[11px] text-muted tabular-nums">{earnedAchievements} из {totalAchievements}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/cosmetics')}
          className="card card-press p-4 flex flex-col items-start gap-1.5 text-left"
        >
          <Icon name="crown" size={22} className="text-danger" />
          <span className="font-display text-sm text-main">Косметика</span>
          <span className="text-[11px] text-muted">Титулы · рамки · скины</span>
        </button>
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
