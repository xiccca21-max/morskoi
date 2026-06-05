/** Платный матчмейкинг-бот (`bot:N`), не тренировочный `trainbot:`. */
export function isPaidMatchBotTelegramId(telegramId: string | null | undefined): boolean {
  return (
    typeof telegramId === 'string' &&
    telegramId.startsWith('bot:') &&
    !telegramId.startsWith('trainbot:')
  );
}
