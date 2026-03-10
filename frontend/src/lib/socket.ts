import { io, Socket } from 'socket.io-client';

// Always connect via the page origin so Vite's ws proxy (/socket.io) handles it in dev.
// Direct localhost:3001 in DEV mode breaks when accessed via HTTPS (Cloudflare tunnel
// mixed-content block) and is unnecessary since vite.config.ts proxies /socket.io → ws.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

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
