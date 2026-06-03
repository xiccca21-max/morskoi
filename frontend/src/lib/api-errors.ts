/** Человекочитаемые сообщения для ответов API / сокета. */
export function mapApiError(message: unknown, fallback = 'Что-то пошло не так'): string {
  const raw = typeof message === 'string' ? message : '';
  const m = raw.trim();
  if (!m) return fallback;

  const table: Record<string, string> = {
    'Lobby is not open': 'Этот бой уже принят или закрыт — обновите список',
    'Lobby not found': 'Лобби не найдено',
    'Lobby expired': 'Приглашение истекло',
    'Cannot join own lobby': 'Нельзя вступить в свой бой',
    'Insufficient balance': 'Недостаточно средств на балансе',
    'Insufficient balance for wager': 'Недостаточно средств для этой ставки',
    'Host not found': 'Создатель боя не найден',
    'User not found': 'Пользователь не найден',
    'Missing action nonce': 'Ошибка соединения — перезапустите мини-приложение',
    'Слишком много запросов': 'Слишком много запросов — подождите немного',
  };

  if (table[m]) return table[m];
  if (m.includes('Завершите текущий бой')) return m;
  if (m.includes('Хост уже в другом бою')) return m;
  return m;
}
