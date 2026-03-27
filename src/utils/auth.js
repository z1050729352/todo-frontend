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
        return JSON.parse(decryptedStr);
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
