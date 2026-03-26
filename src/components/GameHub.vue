<script setup>
import { ref } from 'vue';

const emit = defineEmits(['selectGame', 'viewLeaderboard']);

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
    description: '经典益智游戏，即将推出',
    tip: '',
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    available: false
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

function viewLeaderboard() {
  emit('viewLeaderboard');
}
</script>

<template>
  <div class="game-hub">
    <div class="hub-header">
      <h1 class="hub-title">🎮 游戏中心</h1>
      <p class="hub-subtitle">选择你喜欢的游戏开始挑战</p>
      <button class="leaderboard-btn" @click="viewLeaderboard">
        🏆 排行榜
      </button>
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
.game-hub {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  padding-bottom: 40px; /* 底部留白 */
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch; /* iOS平滑滚动 */
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.hub-header {
  text-align: center;
  margin-bottom: 30px;
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

.leaderboard-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 12px 24px;
  border-radius: 25px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  animation: fadeInDown 0.6s ease-out 0.2s backwards;
}

.leaderboard-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.leaderboard-btn:active {
  transform: translateY(0);
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
  .game-hub {
    padding: 15px;
    /* 确保可以滚动 */
    height: 100vh;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
  }

  .hub-title {
    font-size: 2rem;
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
