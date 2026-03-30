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

const emit = defineEmits(['start', 'back', 'viewLeaderboard']);

const difficulty = ref('medium');
const showGuide = ref(false);

const difficulties = [
  { value: 'easy', label: '休闲', desc: '轻松解压' },
  { value: 'medium', label: '标准', desc: '经典挑战' },
  { value: 'hard', label: '硬核', desc: '极限手速' }
];

function handleStart() {
  emit('start', difficulty.value);
}

function goBack() {
  emit('back');
}

function toggleGuide() {
  showGuide.value = !showGuide.value;
}

function viewLeaderboard() {
  emit('viewLeaderboard');
}
</script>

<template>
  <div class="game-start">
    <div class="bg-effects"></div>
    <div class="content">
      <div class="header-actions">
        <button class="back-btn" @click="goBack">← 返回</button>
        <button 
          v-if="!isGuest"
          class="leaderboard-btn" 
          @click="viewLeaderboard"
        >
          🏆 排行榜
        </button>
      </div>
      <h1 class="title">🧱 俄罗斯方块</h1>
      <div class="player-info">
        <span>玩家: {{ playerName }}</span>
      </div>
      
      <div class="intro-text">
        <p>✨ 经典俄罗斯方块，全新道具来袭！</p>
        <p>单手畅玩，丝滑操作，趣味拉满，随时开启解压之旅！</p>
      </div>

      <div class="form">
        <div class="difficulty-group">
          <label>选择模式</label>
          <div class="difficulty-options">
            <div 
              v-for="diff in difficulties" 
              :key="diff.value"
              class="difficulty-option"
              :class="{ active: difficulty === diff.value }"
              @click="difficulty = diff.value"
            >
              <div class="diff-label">{{ diff.label }}</div>
              <div class="diff-desc">{{ diff.desc }}</div>
            </div>
          </div>
        </div>
        
        <button class="start-btn" @click="handleStart">
          开始游戏
        </button>
        
        <button class="guide-btn" @click="toggleGuide">
          📖 道具与玩法说明
        </button>
      </div>
      
      <div class="instructions">
        <h3>操作说明</h3>
        <p>👆 左右滑动移动方块</p>
        <p>⬇️ 向下滑动加速下落</p>
        <p>🔄 点击屏幕旋转方块</p>
      </div>
    </div>
    
    <!-- 玩法指南弹窗 -->
    <div v-if="showGuide" class="guide-overlay" @click="toggleGuide">
      <div class="guide-modal" @click.stop>
        <button class="close-btn" @click="toggleGuide">✕</button>
        <h2>🕹️ 道具与玩法说明</h2>
        
        <div class="guide-section">
          <h3>🌟 核心玩法</h3>
          <p class="guide-desc">标准 7 种方块形态，还原经典下落、消除、计分规则。速度随分数递增，挑战手速与策略极限！</p>
        </div>
        
        <div class="guide-section">
          <h3>🎁 创意趣味道具</h3>
          <p class="guide-note">游戏中通过消除可获得以下趣味道具，主动使用化解危机：</p>
          <div class="prop-list">
            <div class="prop-item">
              <span class="prop-icon" style="background: #ff4757;">💣</span>
              <div class="prop-info">
                <h4>爆破方块</h4>
                <p>消除指定区域 3×3 范围内所有方块，一键化解绝境僵局。</p>
              </div>
            </div>
            <div class="prop-item">
              <span class="prop-icon" style="background: #2ed573;">⏱️</span>
              <div class="prop-info">
                <h4>时间减缓</h4>
                <p>激活后 5 秒内方块下落速度减半，从容布局精准操作。</p>
              </div>
            </div>
            <div class="prop-item">
              <span class="prop-icon" style="background: #ffa502;">⭐</span>
              <div class="prop-info">
                <h4>消除之星</h4>
                <p>直接消除当前屏幕最下方一整行，轻松清空堆积障碍。</p>
              </div>
            </div>
            <div class="prop-item">
              <span class="prop-icon" style="background: #1e90ff;">🔄</span>
              <div class="prop-info">
                <h4>随机变形</h4>
                <p>将当前下落方块随机切换为任意形态，扭转不利局面。</p>
              </div>
            </div>
          </div>
        </div>
        
        <button class="understand-btn" @click="toggleGuide">我明白了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-start {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.bg-effects {
  position: absolute;
  width: 100%;
  height: 100%;
  background-image: radial-gradient(circle at 50% 50%, rgba(240, 147, 251, 0.1) 0%, transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(245, 87, 108, 0.15) 0%, transparent 40%);
  animation: pulse 4s ease-in-out infinite alternate;
}

@keyframes pulse {
  0% { opacity: 0.5; }
  100% { opacity: 1; }
}

.content {
  position: relative;
  z-index: 1;
  max-width: 400px;
  width: 90%;
  max-height: 90%;
  overflow-y: auto;
  padding: 2rem 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.back-btn, .leaderboard-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.back-btn:hover, .leaderboard-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.title {
  font-size: 2.2rem;
  color: #fff;
  text-align: center;
  margin-bottom: 0.5rem;
  text-shadow: 0 0 15px rgba(240, 147, 251, 0.6);
}

.player-info {
  text-align: center;
  color: #f093fb;
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.5rem;
  border-radius: 10px;
}

.intro-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
  padding: 10px;
  background: linear-gradient(135deg, rgba(240, 147, 251, 0.1) 0%, rgba(245, 87, 108, 0.1) 100%);
  border-radius: 10px;
  border: 1px solid rgba(240, 147, 251, 0.3);
}

.intro-text p {
  margin-bottom: 0.5rem;
}

.form {
  margin-bottom: 1.5rem;
}

.difficulty-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  color: #fff;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.difficulty-options {
  display: flex;
  gap: 0.5rem;
}

.difficulty-option {
  flex: 1;
  padding: 0.75rem 0.5rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.difficulty-option:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.difficulty-option.active {
  border-color: #f093fb;
  background: rgba(240, 147, 251, 0.2);
}

.diff-label {
  color: #fff;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.diff-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
}

.start-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4);
  margin-bottom: 0.75rem;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(240, 147, 251, 0.6);
}

.guide-btn {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 0.95rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.guide-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.instructions {
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
}

.instructions h3 {
  margin-bottom: 0.75rem;
  color: #fff;
}

.instructions p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

/* Guide Modal Styles */
.guide-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-out;
}

.guide-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 20px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  border: 2px solid rgba(240, 147, 251, 0.4);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 30px;
  height: 30px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 50%;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guide-modal h2 {
  color: #fff;
  text-align: center;
  margin-bottom: 1.5rem;
}

.guide-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.guide-section h3 {
  color: #f093fb;
  margin-bottom: 0.5rem;
}

.guide-desc, .guide-note {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.prop-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.prop-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 1rem;
  border-radius: 10px;
}

.prop-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.prop-info h4 {
  color: #fff;
  margin-bottom: 0.25rem;
}

.prop-info p {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  line-height: 1.4;
}

.understand-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  margin-top: 1rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>