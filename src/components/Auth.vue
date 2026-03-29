<script setup>
import { ref, watch } from 'vue';
import { setAuthData } from '../utils/auth';

const emit = defineEmits(['loginSuccess', 'guestAccess']);

const apiBaseUrl = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:12580/api' : '/api')).replace(/\/$/, '');

const isLoginMode = ref(true);
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMsg = ref('');
const usernameError = ref('');

const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value;
  username.value = '';
  password.value = '';
  errorMsg.value = '';
  usernameError.value = '';
};

const validateUsername = async () => {
  if (isLoginMode.value) return; // 登录模式不需要查重
  if (username.value.length < 3) {
    usernameError.value = '账号最少三个字';
    return;
  }
  try {
    const res = await fetch(`${apiBaseUrl}/auth/check-username?username=${encodeURIComponent(username.value)}`);
    const data = await res.json();
    if (data.exists) {
      usernameError.value = '账号已被注册';
    } else {
      usernameError.value = '';
    }
  } catch (err) {
    console.error('Check username error:', err);
  }
};

const validatePassword = (pwd) => {
  if (pwd.length < 8) return '密码至少8位';
  if (!/[A-Z]/.test(pwd)) return '密码必须包含大写字母';
  return '';
};

const handleSubmit = async () => {
  errorMsg.value = '';
  if (username.value.length < 3) {
    errorMsg.value = '账号最少三个字';
    return;
  }
  if (!isLoginMode.value) {
    const pwdErr = validatePassword(password.value);
    if (pwdErr) {
      errorMsg.value = pwdErr;
      return;
    }
    if (usernameError.value) {
      return;
    }
  }

  const url = isLoginMode.value 
    ? `${apiBaseUrl}/auth/login` 
    : `${apiBaseUrl}/auth/register`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errorMsg.value = data.error || '请求失败';
      return;
    }

    // 如果是注册成功，直接调用登录获取token，或者在注册接口里其实可以顺便返回token
    // 但根据需求"注册完自动登录"，这里如果是注册，可以用相同的账号密码自动请求一次login
    if (!isLoginMode.value) {
      const loginRes = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.value, password: password.value })
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        errorMsg.value = loginData.error || '自动登录失败';
        return;
      }
      handleLoginSuccess(loginData);
    } else {
      handleLoginSuccess(data);
    }
  } catch (err) {
    errorMsg.value = '网络错误';
  }
};

const handleLoginSuccess = (data) => {
  const { token, user } = data;
  const loginState = {
    token,
    username: user.username,
    expire: Date.now() + 7 * 24 * 60 * 60 * 1000 // 有效期7天，对应后端
  };
  setAuthData(loginState); // 加密存储
  emit('loginSuccess', user.username);
};

</script>

<template>
  <div class="auth-container">
    <div class="stars"></div>
    <div class="auth-card">
      <h1 class="title">{{ isLoginMode ? '欢迎回来' : '注册账号' }}</h1>
      <div class="form">
        <div class="input-group">
          <label>账号</label>
          <input 
            v-model="username" 
            type="text" 
            placeholder="请输入账号 (最少3个字)"
            @blur="validateUsername"
          />
          <span v-if="usernameError" class="error-text">{{ usernameError }}</span>
        </div>
        
        <div class="input-group">
          <label>密码</label>
          <div class="password-wrapper">
            <input 
              v-model="password" 
              :type="showPassword ? 'text' : 'password'" 
              placeholder="请输入密码"
              @keyup.enter="handleSubmit"
            />
            <span class="eye-icon" @click="showPassword = !showPassword">
              {{ showPassword ? '👁️' : '🙈' }}
            </span>
          </div>
          <span v-if="!isLoginMode" class="hint-text">要求：至少8位且包含大写字母</span>
        </div>

        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        
        <button class="submit-btn" @click="handleSubmit">
          {{ isLoginMode ? '登录' : '注册' }}
        </button>

        <div class="divider">
          <span>或</span>
        </div>

        <button class="guest-btn" @click="emit('guestAccess')">
          游客访问
        </button>
        
        <div class="toggle-mode">
          <span @click="toggleMode">
            {{ isLoginMode ? '没有账号？点击注册' : '已有账号？点击登录' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0a0e27 0%, #1a1f3a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.stars {
  position: absolute;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(2px 2px at 20% 30%, white, transparent),
    radial-gradient(2px 2px at 60% 70%, white, transparent),
    radial-gradient(1px 1px at 50% 50%, white, transparent),
    radial-gradient(1px 1px at 80% 10%, white, transparent);
  background-size: 200% 200%;
  animation: twinkle 8s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.auth-card {
  position: relative;
  z-index: 1;
  max-width: 400px;
  width: 90%;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.title {
  font-size: 2rem;
  color: #fff;
  text-align: center;
  margin-bottom: 2rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  color: #fff;
  font-size: 0.9rem;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  transition: all 0.3s;
}

input:focus {
  outline: none;
  border-color: #4a9eff;
  background: rgba(255, 255, 255, 0.15);
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.eye-icon {
  position: absolute;
  right: 10px;
  cursor: pointer;
  font-size: 1.2rem;
  user-select: none;
}

.error-text {
  color: #ff4a4a;
  font-size: 0.8rem;
}

.hint-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
}

.error-msg {
  color: #ff4a4a;
  text-align: center;
  font-size: 0.9rem;
  background: rgba(255, 74, 74, 0.1);
  padding: 0.5rem;
  border-radius: 5px;
}

.submit-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.divider:not(:empty)::before {
  margin-right: .5em;
}

.divider:not(:empty)::after {
  margin-left: .5em;
}

.guest-btn {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.guest-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #00FFFF;
  color: #00FFFF;
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
}

.toggle-mode {
  text-align: center;
  color: #4a9eff;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}
</style>
