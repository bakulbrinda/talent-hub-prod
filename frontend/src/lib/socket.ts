import { io, Socket } from 'socket.io-client';

// In dev: connect to localhost:3001 directly (Vite doesn't proxy WebSocket for socket.io).
// In tunnel/production: connect to the same origin (Express serves everything on one port).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

let socket: Socket | null = null;

export const initSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socket;
};

export const getSocket = (): Socket | null => socket;

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
