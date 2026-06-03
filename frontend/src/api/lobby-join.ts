import { MatchmakingAPI } from './endpoints';

/** Вступить в лобби через HTTP (стабильно в Telegram; список боёв тоже с HTTP). */
export async function joinLobbyAction(code: string): Promise<{ matchId: string }> {
  const normalized = code.toUpperCase().trim();
  if (!normalized) throw new Error('Неверный код лобби');

  try {
    const r = await MatchmakingAPI.joinLobby(normalized);
    if (r?.matchId) return { matchId: r.matchId };
  } catch (httpErr: unknown) {
    const msg = (httpErr as { response?: { data?: { message?: string } }; message?: string })
      ?.response?.data?.message
      ?? (httpErr as Error)?.message;
    if (msg) throw new Error(msg);
  }
  throw new Error('Не удалось войти в бой');
}
