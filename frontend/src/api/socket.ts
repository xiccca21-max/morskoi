import { io, Socket } from 'socket.io-client';
import { getToken } from './http';
import { getInitData } from '../lib/telegram';

function socketAuth() {
  return { token: getToken() ?? '', initData: getInitData() || undefined };
}

// Пустая строка = тот же origin, что и страница. Vite/nginx проксируют /socket.io.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = socketAuth();
    socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    // polling как запасной канал — в Telegram WebView websocket часто рвётся
    transports: ['websocket', 'polling'],
    auth: socketAuth(),
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 800,
  });
  socket.on('connect', () => {
    socket!.auth = socketAuth();
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
