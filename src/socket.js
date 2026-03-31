import { io } from 'socket.io-client';

let socket = null;

export const initSocket = (token) => {
    if (socket) return socket;
    
    let defaultSocketUrl = window.location.origin;
    if (import.meta.env.VITE_API_URL) {
        try {
            const apiUrl = new URL(import.meta.env.VITE_API_URL, window.location.origin);
            defaultSocketUrl = apiUrl.origin || window.location.origin;
        } catch (e) {
            console.warn('Invalid VITE_API_URL format:', e);
        }
    }
    
    const serverUrl = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;

    socket = io(serverUrl, {
        auth: { token },
        rememberUpgrade: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
        timeout: 8000
    });

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
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
