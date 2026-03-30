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
const showGuide = ref(false); // 显示武器指南
const weaponDetail = ref(null); // 显示武器详情

const difficulties = [
  { value: 'easy', label: '简单', desc: '适合新手' },
  { value: 'medium', label: '中等', desc: '有点挑战' },
  { value: 'hard', label: '困难', desc: '极限挑战' }
];

const weaponDetails = {
  laser: {
    name: '激光束',
    icon: '⚡',
    color: '#00FFFF',
    description: '瞬发蓝色电浆光束，伴有随机电弧。穿透力极强，能瞬间贯穿敌阵。',
    features: [
      '攻击形态：长条激光线',
      '瞬发命中，无弹道延迟',
      '附带电弧特效，持续贯穿',
      '特点：攻击范围大，适合清理密集敌人'
    ]
  },
  burst: {
    name: '爆裂弹',
    icon: '🔥',
    color: '#FF8000',
    description: '发射具有抛物线轨迹的能量球，命中时触发环形冲击波，适合对付集群敌人。',
    features: [
      '抛物线弹道',
      '范围爆炸，引发环形冲击波',
      '高伤害',
      '特点：攻击范围随等级增长'
    ]
  },
  explosive: {
    name: '爆炸弹',
    icon: '💣',
    color: '#333333',
    description: '黑色金属弹体，尾焰呈现摇摆轨迹。命中后产生巨大的蘑菇云特效，威力惊人。',
    features: [
      'S型摇摆尾焰',
      '闪烁警告',
      '单点重伤，蘑菇云特效',
      '特点：范围伤害，适合群体攻击'
    ]
  }
};

function handleStart() {
  // 直接使用props中的playerName，不再需要手动输入
  emit('start', difficulty.value);
}

function goBack() {
  emit('back');
}

function toggleGuide() {
  showGuide.value = !showGuide.value;
  weaponDetail.value = null; // 关闭武器详情
}

function showWeaponDetail(weaponType) {
  weaponDetail.value = weaponType;
}

function closeWeaponDetail() {
  weaponDetail.value = null;
}

function viewLeaderboard() {
  emit('viewLeaderboard');
}
</script>

<template>
  <div class="game-start">
    <div class="stars"></div>
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
      <h1 class="title">✈️ 飞机大战</h1>
      <div class="player-info">
        <span>飞行员: {{ playerName }}</span>
      </div>
      <div class="form">
        <div class="difficulty-group">
          <label>选择难度</label>
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
          📖 武器系统说明
        </button>
      </div>
      
      <div class="instructions">
        <h3>游戏说明</h3>
        <p>👆 触摸屏幕控制飞机移动</p>
        <p>🎯 击毁障碍物获得分数</p>
        <p>💥 避免碰撞障碍物</p>
      </div>
    </div>
    
    <!-- 武器系统指南弹窗 -->
    <div v-if="showGuide" class="guide-overlay" @click="toggleGuide">
      <div class="guide-modal" @click.stop>
        <button class="close-btn" @click="toggleGuide">✕</button>
        <h2>⚔️ 武器系统说明</h2>
        
        <div class="guide-section">
          <h3>📝 简称说明</h3>
          <div class="abbr-grid">
            <div class="abbr-item"><span class="abbr">光</span> = 激光</div>
            <div class="abbr-item"><span class="abbr">裂</span> = 爆裂</div>
            <div class="abbr-item"><span class="abbr">爆</span> = 爆炸</div>
            <div class="abbr-item"><span class="abbr">散</span> = 散弹</div>
            <div class="abbr-item"><span class="abbr">穿</span> = 穿甲</div>
            <div class="abbr-item"><span class="abbr">速</span> = 射速</div>
            <div class="abbr-item"><span class="abbr">血</span> = 血包</div>
            <div class="abbr-item"><span class="abbr">盾</span> = 护盾</div>
            <div class="abbr-item"><span class="abbr">墙</span> = 防护罩</div>
            <div class="abbr-item"><span class="abbr">缓</span> = 延缓</div>
            <div class="abbr-item"><span class="abbr">毁</span> = 毁灭</div>
          </div>
        </div>
        
        <div class="guide-section">
          <h3>🔫 弹道类武器（互斥）</h3>
          <p class="guide-note">只能拥有一种，切换会重置等级</p>
          <div class="weapon-grid">
            <div class="weapon-item clickable" @click="showWeaponDetail('laser')">
              <span class="weapon-icon" style="background: #00FFFF; color: #000;">⚡</span>
              <span>激光束</span>
            </div>
            <div class="weapon-item clickable" @click="showWeaponDetail('burst')">
              <span class="weapon-icon" style="background: #FF8000;">🔥</span>
              <span>爆裂弹</span>
            </div>
            <div class="weapon-item clickable" @click="showWeaponDetail('explosive')">
              <span class="weapon-icon" style="background: #333;">💣</span>
              <span>爆炸弹</span>
            </div>
          </div>
          <p class="example">例：光3 → 吃到裂 → 裂1</p>
          <p class="click-hint">💡 点击武器图标查看详情</p>
        </div>
        
        <div class="guide-section">
          <h3>✨ 属性类武器（可叠加）</h3>
          <p class="guide-note">可以同时拥有多种</p>
          <div class="weapon-grid">
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #2196f3;">散</span>
              <span>散弹</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #ffeb3b;">穿</span>
              <span>穿甲</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #f44336;">速</span>
              <span>射速</span>
            </div>
          </div>
          <p class="example">例：散2 穿1 速3 = 可叠加</p>
        </div>
        
        <div class="guide-section">
          <h3>🛡️ 其他道具</h3>
          <div class="weapon-grid">
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #4caf50;">血</span>
              <span>血包</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #607d8b;">盾</span>
              <span>护盾</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #795548;">墙</span>
              <span>防护罩</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #9e9e9e;">缓</span>
              <span>延缓</span>
            </div>
            <div class="weapon-item">
              <span class="weapon-icon" style="background: #ffeb3b;">毁</span>
              <span>毁灭</span>
            </div>
          </div>
        </div>
        
        <button class="understand-btn" @click="toggleGuide">我明白了</button>
      </div>
    </div>
    
    <!-- 武器详情弹窗 -->
    <div v-if="weaponDetail" class="weapon-detail-overlay" @click="closeWeaponDetail">
      <div class="weapon-detail-modal" @click.stop>
        <button class="close-btn" @click="closeWeaponDetail">✕</button>
        <div class="weapon-detail-header" :style="{ background: weaponDetails[weaponDetail].color }">
          <span class="weapon-detail-icon">{{ weaponDetails[weaponDetail].icon }}</span>
          <h3>{{ weaponDetails[weaponDetail].name }}</h3>
        </div>
        <div class="weapon-detail-content">
          <p class="weapon-desc">{{ weaponDetails[weaponDetail].description }}</p>
          <div class="weapon-features">
            <div v-for="(feature, index) in weaponDetails[weaponDetail].features" :key="index" class="feature-item">
              <span class="feature-dot">•</span>
              <span>{{ feature }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-start {
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
    radial-gradient(1px 1px at 80% 10%, white, transparent),
    radial-gradient(2px 2px at 90% 60%, white, transparent),
    radial-gradient(1px 1px at 33% 80%, white, transparent);
  background-size: 200% 200%;
  animation: twinkle 8s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
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

.content::-webkit-scrollbar {
  width: 4px;
}

.content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

.content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.title {
  font-size: 2.5rem;
  color: #fff;
  text-align: center;
  margin-bottom: 1rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.player-info {
  text-align: center;
  color: #4a9eff;
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 2rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.5rem;
  border-radius: 10px;
}

.form {
  margin-bottom: 2rem;
}

.input-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  color: #fff;
  margin-bottom: 0.5rem;
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

input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.difficulty-group {
  margin-bottom: 1.5rem;
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
  border-color: #4a9eff;
  background: rgba(74, 158, 255, 0.3);
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  margin-bottom: 0.75rem;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.start-btn:active {
  transform: translateY(0);
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
  background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%);
  border-radius: 20px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
}

.guide-modal::-webkit-scrollbar {
  width: 6px;
}

.guide-modal::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.guide-modal::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
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
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

.guide-modal h2 {
  color: #fff;
  margin-bottom: 1.5rem;
  text-align: center;
  font-size: 1.5rem;
}

.guide-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.guide-section h3 {
  color: #fff;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}

.guide-note {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  font-style: italic;
}

.abbr-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.abbr-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
}

.abbr {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
  color: #fff;
  font-weight: bold;
  font-size: 0.9rem;
}

.weapon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.weapon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: #fff;
  font-size: 0.85rem;
  transition: all 0.3s ease;
}

.weapon-item.clickable {
  cursor: pointer;
}

.weapon-item.clickable:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.weapon-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 1.1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.example {
  color: #4a9eff;
  font-size: 0.85rem;
  text-align: center;
  margin-top: 0.5rem;
}

.click-hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  text-align: center;
  margin-top: 0.5rem;
  font-style: italic;
}

.understand-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 1rem;
}

.understand-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.6);
}

.weapon-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  animation: fadeIn 0.3s ease-out;
}

.weapon-detail-modal {
  background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%);
  border-radius: 20px;
  max-width: 400px;
  width: 90%;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
  overflow: hidden;
}

.weapon-detail-header {
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  position: relative;
}

.weapon-detail-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 2rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.weapon-detail-header h3 {
  color: #fff;
  font-size: 1.5rem;
  margin: 0;
}

.weapon-detail-content {
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.2);
}

.weapon-desc {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1rem;
  margin-bottom: 1.5rem;
  text-align: center;
  line-height: 1.6;
}

.weapon-features {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
  line-height: 1.5;
}

.feature-dot {
  color: #4a9eff;
  font-size: 1.2rem;
  line-height: 1.3;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

@media (max-width: 480px) {
  .content {
    padding: 1.5rem 1rem;
    width: 95%;
  }
  
  .title {
    font-size: 1.8rem;
    margin-bottom: 1.5rem;
  }
  
  .difficulty-options {
    flex-direction: column;
  }
  
  .instructions {
    font-size: 0.85rem;
  }
  
  .instructions h3 {
    font-size: 1rem;
  }
}

@media (max-height: 700px) {
  .content {
    padding: 1rem;
  }
  
  .title {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  
  .form {
    margin-bottom: 1rem;
  }
  
  .input-group, .difficulty-group {
    margin-bottom: 1rem;
  }
  
  .instructions {
    display: none;
  }
}
</style>
