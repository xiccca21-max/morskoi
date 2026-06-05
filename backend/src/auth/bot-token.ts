/** TELEGRAM_BOT_TOKEN из .env без пробелов и кавычек (частая ошибка в nano). */
export function readTelegramBotToken(): string {
  let t = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}
