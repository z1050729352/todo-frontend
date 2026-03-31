import CryptoJS from 'crypto-js';

const SECRET_KEY = 'plane-game-token-key-12580'; // 用于本地存储加密的 key

/**
 * 加密并存储数据
 */
export const setAuthData = (data) => {
    try {
        const jsonStr = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
        localStorage.setItem('game_auth_v2', encrypted);
        // 清理旧的不安全存储
        localStorage.removeItem('game_auth');
    } catch (e) {
        console.error('Save auth data error:', e);
    }
};

/**
 * 解密并获取数据
 */
export const getAuthData = () => {
    try {
        const encrypted = localStorage.getItem('game_auth_v2');
        if (!encrypted) return null;
        
        const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedStr) return null;
        const parsed = JSON.parse(decryptedStr);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.token) return parsed;
        if (parsed.user && parsed.user.id) return parsed;
        const token = String(parsed.token || '');
        const parts = token.split('.');
        if (parts.length < 2) return parsed;
        const payloadRaw = parts[1];
        const base64 = payloadRaw.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        let payload = null;
        try {
            payload = JSON.parse(atob(padded));
        } catch {
            payload = null;
        }
        const id = payload && (payload.id || payload._id);
        const username = payload && payload.username;
        if (!id) return parsed;
        const normalized = {
            ...parsed,
            username: parsed.username || username,
            user: { ...(parsed.user || {}), id: String(id), username: String(parsed.username || username || '') }
        };
        return normalized;
    } catch (e) {
        console.error('Get auth data error:', e);
        localStorage.removeItem('game_auth_v2');
        return null;
    }
};

/**
 * 清除数据
 */
export const clearAuthData = () => {
    localStorage.removeItem('game_auth_v2');
    localStorage.removeItem('game_auth');
};
