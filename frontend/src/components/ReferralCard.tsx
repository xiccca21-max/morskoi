import { Icon } from './Icon';
import { toast } from '../stores/toast-store';
import { tgShare, tgHaptic } from '../lib/telegram';
import { REFERRAL_BONUS, referralBotLink, referralShareText } from '../lib/referral';

export function ReferralCard({
  userId,
  displayName,
  referralCount = 0,
}: {
  userId: string;
  displayName: string;
  referralCount?: number;
}) {
  const link = referralBotLink(userId);

  const copy = () => {
    navigator.clipboard.writeText(link).catch(() => {});
    tgHaptic('success');
    toast('Ссылка скопирована', 'success', 'check');
  };

  const share = () => {
    tgHaptic('light');
    tgShare(link, referralShareText(displayName));
  };

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Пригласи друга</p>
        <span className="text-muted text-[11px] tabular-nums">Приглашено: {referralCount}</span>
      </div>
      <p className="text-muted text-xs leading-relaxed">
        Друг регистрируется по твоей ссылке — ты получаешь <b className="text-main">{REFERRAL_BONUS} ₽</b> на баланс.
      </p>
      <div className="bg-panel rounded-lg px-3 py-2 font-mono text-[10px] text-muted break-all border border-line">
        {link}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary w-full text-sm py-2.5" onClick={copy}>
          <Icon name="check" size={14} /> Копировать
        </button>
        <button className="btn-primary w-full text-sm py-2.5" onClick={share}>
          <Icon name="share" size={14} /> Поделиться
        </button>
      </div>
    </section>
  );
}
