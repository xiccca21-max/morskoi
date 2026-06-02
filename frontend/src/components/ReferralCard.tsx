import { useState } from 'react';
import { Icon } from './Icon';
import { toast } from '../stores/toast-store';
import { tgShare, tgHaptic } from '../lib/telegram';
import { referralBotLink, referralShareText } from '../lib/referral';

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
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(link).catch(() => {});
    tgHaptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = () => {
    tgHaptic('light');
    tgShare(link, referralShareText(displayName));
  };

  return (
    <section className="card overflow-hidden">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <p className="eyebrow">Пригласи друга</p>
        <div className="flex items-center gap-1.5">
          <span className="font-display text-danger text-sm tabular-nums">{referralCount}</span>
          <span className="text-muted text-[11px]">приглашено</span>
        </div>
      </div>

      {/* Описание */}
      <div className="px-4 py-3 border-b border-line">
        <p className="text-muted text-[12px] leading-relaxed">
          За каждого приглашённого друга открываются достижения и косметика.
        </p>
      </div>

      {/* Кнопки действий */}
      <div className="grid grid-cols-2 divide-x divide-line">
        <button
          onClick={copy}
          className="flex items-center justify-center gap-2 py-3.5 text-sm font-display uppercase tracking-wide transition"
          style={{ color: copied ? 'var(--c-danger)' : 'var(--c-main)' }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={15} />
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
        <button
          onClick={share}
          className="flex items-center justify-center gap-2 py-3.5 text-sm font-display uppercase tracking-wide text-danger transition hover:opacity-80"
        >
          <Icon name="share" size={15} />
          Поделиться
        </button>
      </div>
    </section>
  );
}
