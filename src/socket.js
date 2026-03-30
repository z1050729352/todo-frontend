import { io } from 'socket.io-client';

let socket = null;

export const initSocket = (token) => {
    if (socket) return socket;
    
    // 如果没有配置 SOCKET_URL，尝试从 API_URL 解析出根域名
    let defaultSocketUrl = window.location.origin;
    if (import.meta.env.VITE_API_URL) {
        try {
            const apiUrl = new URL(import.meta.env.VITE_API_URL);
            defaultSocketUrl = apiUrl.origin;
        } catch (e) {
            console.warn('Invalid VITE_API_URL format:', e);
        }
    }
    
    const serverUrl = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;

    socket = io(serverUrl, {
        auth: { token }
    });

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
    });

    return socket;
};

export const getSocket = () => socket;
export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
