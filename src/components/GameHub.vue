<script setup>
import { ref } from 'vue';
import FriendSystem from './FriendSystem.vue';

const props = defineProps({
  playerName: {
    type: String,
    default: ''
  },
  isGuest: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['selectGame', 'logout']);

const games = [
  {
    id: 'plane-war',
    name: '飞机大战',
    icon: '✈️',
    description: '经典射击游戏，消灭敌机获得高分',
    tip: '击败12个Boss即可通关',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    available: true
  },
  {
    id: 'tetris',
    name: '俄罗斯方块',
    icon: '🧱',
    description: '经典复刻・趣味焕新',
    tip: '创意道具，丝滑体验',
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    available: true
  },
  {
    id: 'snake',
    name: '贪吃蛇',
    icon: '🐍',
    description: '经典休闲游戏，即将推出',
    tip: '',
    color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    available: false
  },
  {
    id: 'puzzle',
    name: '拼图游戏',
    icon: '🧩',
    description: '考验智力的拼图挑战，即将推出',
    tip: '',
    color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    available: false
  }
];

const touchedCard = ref(null);

function handleTouchStart(gameId) {
  touchedCard.value = gameId;
}

function handleTouchEnd() {
  touchedCard.value = null;
}

function selectGame(game) {
  if (game.available) {
    emit('selectGame', game.id);
  }
}

function handleLogout() {
  emit('logout');
}
</script>

<template>
  <div class="game-hub">
    <FriendSystem :isGuest="isGuest" />
    <div v-if="!isGuest" class="user-profile">
      <span class="welcome-text">欢迎, {{ playerName }}</span>
      <button class="logout-btn" @click="handleLogout">登出</button>
    </div>
    
    <!-- 游客返回按钮 -->
    <div v-else class="user-profile guest-back" @click="handleLogout">
      <span class="welcome-text">退出游客模式</span>
    </div>
    <div class="hub-header">
      <h1 class="hub-title">🎮 GAME BOSS</h1>
      <p class="hub-subtitle">选择你喜欢的游戏开始挑战</p>
    </div>

    <div class="games-container">
      <div 
        v-for="game in games" 
        :key="game.id"
        class="game-card"
        :class="{ 
          'touched': touchedCard === game.id,
          'disabled': !game.available
        }"
        :style="{ background: game.color }"
        @touchstart="handleTouchStart(game.id)"
        @touchend="handleTouchEnd"
        @mousedown="handleTouchStart(game.id)"
        @mouseup="handleTouchEnd"
        @mouseleave="handleTouchEnd"
        @click="selectGame(game)"
      >
        <div class="card-content">
          <div class="game-icon">{{ game.icon }}</div>
          <h2 class="game-name">{{ game.name }}</h2>
          <p class="game-description">{{ game.description }}</p>
          <p v-if="game.tip" class="game-tip">{{ game.tip }}</p>
          <div class="card-footer">
            <span v-if="game.available" class="play-btn">开始游戏 →</span>
            <span v-else class="coming-soon">敬请期待</span>
          </div>
        </div>
        <div class="card-shine"></div>
      </div>
    </div>

    <div class="hub-footer">
      <p>更多游戏持续更新中...</p>
    </div>
  </div>
</template>

<style scoped>
.user-profile {
  position: absolute;
  top: calc(25px + var(--safe-area-top, 0px));
  right: 25px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 8px 16px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  z-index: 100;
  transition: all 0.3s ease;
}

@media (max-width: 420px) {
  .user-profile {
    top: calc(12px + var(--safe-area-top, 0px));
    right: 12px;
    padding: 6px 12px;
    gap: 8px;
  }

  .welcome-text {
    font-size: 0.85rem;
  }

  .logout-btn {
    padding: 5px 10px;
    font-size: 0.8rem;
  }
}

.user-profile:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.welcome-text {
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.logout-btn {
  background: linear-gradient(135deg, #ff4b2b 0%, #ff416c 100%);
  border: none;
  color: #fff;
  padding: 6px 14px;
  border-radius: 15px;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(255, 75, 43, 0.3);
}

.logout-btn:hover {
  background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 75, 43, 0.5);
}

.game-hub {
  width: 100%;
  height: 100vh;
  height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100vh;
  min-height: calc(var(--app-vh, 1vh) * 100);
  background: #1a1a1a; /* 深灰背景，赛博朋克风 */
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.hub-header {
  text-align: center;
  margin-top: 60px; /* 增加顶部间距，避免被右上角遮挡 */
  margin-bottom: 40px;
  position: relative;
  width: 100%;
  max-width: 600px;
}

.hub-title {
  font-size: 2.5rem;
  color: #fff;
  margin-bottom: 10px;
  text-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  animation: fadeInDown 0.6s ease-out;
}

.hub-subtitle {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 20px;
  animation: fadeInDown 0.6s ease-out 0.1s backwards;
}

.games-container {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 30px;
}

.game-card {
  position: relative;
  border-radius: 20px;
  padding: 30px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: fadeInUp 0.6s ease-out backwards;
  animation-delay: calc(var(--index, 0) * 0.1s);
  touch-action: manipulation; /* 优化触摸响应 */
}

.game-card:nth-child(1) { --index: 0; }
.game-card:nth-child(2) { --index: 1; }
.game-card:nth-child(3) { --index: 2; }
.game-card:nth-child(4) { --index: 3; }

.game-card:hover:not(.disabled),
.game-card:active:not(.disabled) {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
}

.game-card.touched:not(.disabled) {
  transform: scale(0.98);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.game-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-content {
  position: relative;
  z-index: 2;
  color: #fff;
}

.game-icon {
  font-size: 4rem;
  margin-bottom: 20px; /* 增加底部间距 */
  margin-top: 10px; /* 增加顶部间距 */
  animation: bounce 2s infinite;
}

.game-card.disabled .game-icon {
  animation: none;
  filter: grayscale(0.5);
}

.game-name {
  font-size: 1.8rem;
  margin-bottom: 10px;
  font-weight: bold;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  color: #fff; /* 强制白色 */
}

.game-description {
  font-size: 0.95rem;
  opacity: 0.95;
  margin-bottom: 8px;
  line-height: 1.5;
  color: #fff; /* 强制白色 */
}

.game-tip {
  font-size: 0.8rem;
  opacity: 0.8;
  margin-bottom: 15px;
  color: #ffeb3b; /* 黄色提示 */
  font-style: italic;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.play-btn {
  font-size: 1rem;
  font-weight: bold;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  color: #fff; /* 强制白色 */
}

.game-card:hover:not(.disabled) .play-btn,
.game-card:active:not(.disabled) .play-btn {
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(5px);
}

.coming-soon {
  font-size: 0.9rem;
  opacity: 0.8;
  font-style: italic;
  color: #fff; /* 强制白色 */
}

.card-shine {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent 30%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 70%
  );
  transform: rotate(45deg);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.game-card:hover:not(.disabled) .card-shine {
  opacity: 1;
  animation: shine 1.5s ease-in-out infinite;
}

.hub-footer {
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
  margin-top: 20px;
  margin-bottom: 20px; /* 确保底部有空间 */
  padding-bottom: 20px;
  animation: fadeIn 0.6s ease-out 0.4s backwards;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes shine {
  0% {
    transform: translateX(-100%) translateY(-100%) rotate(45deg);
  }
  100% {
    transform: translateX(100%) translateY(100%) rotate(45deg);
  }
}

@media (max-width: 480px) {
  .user-profile {
    position: absolute;
    top: 15px;
    right: 15px;
    margin-bottom: 0;
    padding: 6px 12px;
  }

  .game-hub {
    padding: 15px;
    height: 100vh;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
  }

  .hub-header {
    margin-top: 80px; /* 移动端给予更多顶部空间 */
    margin-bottom: 25px;
  }

  .hub-title {
    font-size: 2.2rem;
  }

  .game-card {
    padding: 25px;
  }

  .game-icon {
    font-size: 3rem;
    margin-top: 5px;
    margin-bottom: 15px;
  }

  .game-name {
    font-size: 1.5rem;
    color: #fff !important; /* 强制白色 */
  }

  .game-description {
    font-size: 0.9rem;
    color: #fff !important; /* 强制白色 */
  }
  
  .play-btn,
  .coming-soon {
    color: #fff !important; /* 强制白色 */
  }
}
</style>
