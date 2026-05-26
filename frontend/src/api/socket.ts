import { io, Socket } from 'socket.io-client';
import { getToken } from './http';

// Пустая строка = тот же origin, что и страница. Vite/nginx проксируют /socket.io.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token: getToken() ?? '' };
    socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token: getToken() ?? '' },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 800,
  });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
