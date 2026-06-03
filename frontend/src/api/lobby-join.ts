import { Socket } from 'socket.io-client';
import { MatchmakingAPI } from './endpoints';
import { getSocket, newNonce } from './socket';

function waitForConnect(sock: Socket, timeoutMs: number): Promise<void> {
  if (sock.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error('SOCKET_TIMEOUT'));
    }, timeoutMs);
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(t);
      sock.off('connect', onConnect);
    };
    sock.on('connect', onConnect);
    sock.connect();
  });
}

function emitAck<T>(sock: Socket, event: string, payload: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!sock.connected) {
      reject(new Error('SOCKET_DISCONNECTED'));
      return;
    }
    const t = setTimeout(() => reject(new Error('SOCKET_TIMEOUT')), timeoutMs);
    sock.emit(event, payload, (ack: T) => {
      clearTimeout(t);
      resolve(ack);
    });
  });
}

/** Вступить в лобби: сокет с таймаутом, при сбое — HTTP (работает при слабой сети). */
export async function joinLobbyAction(code: string): Promise<{ matchId: string }> {
  const normalized = code.toUpperCase().trim();
  if (!normalized) throw new Error('Неверный код лобби');

  const sock = getSocket();
  try {
    await waitForConnect(sock, 8000);
    const ack = await emitAck<{ ok?: boolean; matchId?: string; error?: string }>(
      sock,
      'lobby:join',
      { code: normalized, nonce: newNonce() },
      15_000,
    );
    if (ack?.ok && ack.matchId) return { matchId: ack.matchId };
    throw new Error(ack?.error ?? 'Не удалось войти в бой');
  } catch (socketErr) {
    try {
      const r = await MatchmakingAPI.joinLobby(normalized);
      if (r?.matchId) return { matchId: r.matchId };
    } catch (httpErr: unknown) {
      const msg = (httpErr as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message
        ?? (httpErr as Error)?.message;
      if (msg) throw new Error(msg);
    }
    const msg = socketErr instanceof Error ? socketErr.message : '';
    throw new Error(msg || 'Не удалось войти в бой');
  }
}
