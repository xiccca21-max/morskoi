/** Реферальная ссылка: start=ref_{userId} — бонус при первой регистрации друга. */
export const REFERRAL_BONUS = 25;

export function referralBotLink(userId: string): string {
  const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';
  return `https://t.me/${bot}?start=ref_${userId}`;
}

export function referralShareText(name: string): string {
  return `${name} зовёт тебя в «Морской Бой» — PvP-дуэль на ставки! Зарегистрируйся по ссылке и получи бонус.`;
}
