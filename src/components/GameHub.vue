<script setup>
import { ref } from 'vue';

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

const showEncyclopedia = ref(false);

const ammoData = [
  {
    type: 'burst',
    name: '爆裂弹',
    symbol: '🔥',
    color: '#FF8000',
    description: '发射具有抛物线轨迹的能量球，命中时触发环形冲击波，适合对付集群敌人。',
    traits: ['抛物线弹道', '范围爆炸', '高伤害']
  },
  {
    type: 'explosive',
    name: '爆炸弹',
    symbol: '💣',
    color: '#333',
    description: '黑色金属弹体，尾焰呈现摇摆轨迹。命中后产生巨大的蘑菇云特效，威力惊人。',
    traits: ['S型摇摆尾焰', '闪烁警告', '单点重伤']
  },
  {
    type: 'laser',
    name: '激光束',
    symbol: '⚡',
    color: '#00FFFF',
    description: '瞬发蓝色电浆光束，伴有随机电弧。穿透力极强，能瞬间贯穿敌阵。',
    traits: ['瞬发命中', '电弧特效', '持续贯穿']
  }
];

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

function handleLogout() {
  emit('logout');
}
</script>

<template>
  <div class="game-hub">
    <!-- 左上角图鉴入口 -->
    <div class="encyclopedia-trigger" @click="showEncyclopedia = true">
      <span class="pulse-icon">📜</span>
      <span class="trigger-text">弹药图鉴</span>
    </div>

    <div v-if="!isGuest" class="user-profile">
      <span class="welcome-text">欢迎, {{ playerName }}</span>
      <button class="logout-btn" @click="handleLogout">登出</button>
    </div>
    
    <!-- 游客返回按钮 -->
    <div v-else class="user-profile guest-back" @click="handleLogout">
      <span class="welcome-text">退出游客模式</span>
    </div>
    <div class="hub-header">
      <h1 class="hub-title">� 游戏中心</h1>
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

    <!-- 弹药图鉴 Modal -->
    <div v-if="showEncyclopedia" class="modal-overlay" @click.self="showEncyclopedia = false">
      <div class="encyclopedia-modal">
        <div class="modal-header">
          <h2>弹药百科全书</h2>
          <button class="close-btn" @click="showEncyclopedia = false">×</button>
        </div>
        
        <div class="ammo-grid">
          <div v-for="ammo in ammoData" :key="ammo.type" class="ammo-card">
            <div class="ammo-visual" :style="{ background: ammo.color }">
              <span class="ammo-symbol">{{ ammo.symbol }}</span>
            </div>
            <div class="ammo-info">
              <h3>{{ ammo.name }}</h3>
              <p class="ammo-desc">{{ ammo.description }}</p>
              <div class="traits">
                <span v-for="trait in ammo.traits" :key="trait" class="trait-tag">{{ trait }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rule-box">
          <p>⚠️ <strong>等级规则</strong>: 切换弹药时，当前弹药等级将 <strong>-1</strong></p>
          <p>🛡️ <strong>减益效果</strong>: 
            <span class="debuff">减速 -25% (3s)</span>
            <span class="debuff">攻击力 -20% (5s)</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-profile {
  position: absolute;
  top: 25px;
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
  min-height: 100vh;
  background: #1a1a1a; /* 深灰背景，赛博朋克风 */
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

/* 图鉴入口 */
.encyclopedia-trigger {
  position: absolute;
  top: 25px;
  left: 25px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0, 255, 255, 0.15);
  border: 1px solid #00FFFF;
  border-radius: 24px;
  color: #00FFFF;
  cursor: pointer;
  z-index: 100;
  transition: all 0.3s;
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
}

.encyclopedia-trigger:hover {
  background: rgba(0, 255, 255, 0.3);
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.6);
  transform: scale(1.05);
}

.pulse-icon {
  font-size: 20px;
  animation: icon-pulse 2s infinite;
}

@keyframes icon-pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

/* Modal 样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.encyclopedia-modal {
  width: 90%;
  max-width: 800px;
  background: #1a1a1a;
  border: 2px solid #00FFFF;
  border-radius: 20px;
  padding: 30px;
  position: relative;
  box-shadow: 0 0 40px rgba(0, 255, 255, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.modal-header h2 {
  color: #00FFFF;
  font-size: 1.8rem;
  margin: 0;
  text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 32px;
  cursor: pointer;
}

.ammo-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 10px;
}

.ammo-card {
  display: flex;
  gap: 20px;
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 15px;
  border: 1px solid rgba(0, 255, 255, 0.1);
}

.ammo-visual {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  flex-shrink: 0;
}

.ammo-info h3 {
  color: #fff;
  margin: 0 0 10px 0;
}

.ammo-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.trait-tag {
  background: rgba(0, 255, 255, 0.1);
  color: #00FFFF;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  margin-right: 8px;
  border: 1px solid rgba(0, 255, 255, 0.2);
}

.rule-box {
  margin-top: 30px;
  padding: 20px;
  background: rgba(255, 128, 0, 0.05);
  border: 1px dashed #FF8000;
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
}

.debuff {
  display: inline-block;
  color: #ff4757;
  margin-right: 15px;
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
