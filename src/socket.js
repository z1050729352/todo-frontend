import { io } from 'socket.io-client';

let socket = null;

export const initSocket = (token) => {
    if (socket) return socket;
    
    const serverUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

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
