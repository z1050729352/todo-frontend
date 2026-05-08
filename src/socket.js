import { io } from 'socket.io-client';

let socket = null;

function resolveServerUrl() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    try {
      return new URL(apiUrl, window.location.origin).origin;
    } catch {
      // fallthrough
    }
  }
  return window.location.origin;
}

export function initSocket(token) {
  if (socket) return socket;

  const serverUrl = import.meta.env.VITE_SOCKET_URL || resolveServerUrl();

  socket = io(serverUrl, {
    auth: { token },
    // 优先 WebSocket，降级到 polling（香港服务器延迟低，WebSocket 稳定）
    transports: ['websocket', 'polling'],
    // 升级后记住，避免重复握手
    rememberUpgrade: true,
    // 重连策略：快速重试，指数退避
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 300,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.3,
    // 连接超时（香港节点延迟低，可以收紧）
    timeout: 6000,
    // 心跳间隔（保持连接活跃）
    pingInterval: 20000,
    pingTimeout: 10000,
  });

  return socket;
}

export const getSocket = () => socket;

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
