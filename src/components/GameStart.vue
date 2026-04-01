<script setup>
import { computed, ref } from 'vue';

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
const detailKey = ref('');

const difficulties = [
  { value: 'easy', label: '简单', desc: '适合新手' },
  { value: 'medium', label: '中等', desc: '有点挑战' },
  { value: 'hard', label: '困难', desc: '极限挑战' }
];

const detailMap = {
  laser: { name: '激光束', icon: '⚡', color: '#7e57c2', description: '高速直线光束，命中快，手感稳。', features: ['基础强度高', '弹道直观，适合持续压制', '等级越高单发越疼'] },
  burst: { name: '弹幕弹', icon: '🔥', color: '#7e57c2', description: '能量球覆盖面大，清杂兵效率高。', features: ['覆盖范围大', '对群体敌机更友好', '等级提升后范围更明显'] },
  explosive: { name: '爆炸弹', icon: '💣', color: '#7e57c2', description: '命中后对周围敌机造成范围爆炸，适合密集波次。', features: ['范围补刀能力强', '清杂更稳定', '单体强度不会压过直伤流派'] },
  pulse: { name: '脉冲弹', icon: '🟦', color: '#7e57c2', description: '高射速直冲型子弹，适合稳定持续输出。', features: ['弹速快', '弹道稳定', '适合中距离持续压血'] },
  needle: { name: '针刺弹', icon: '🟩', color: '#7e57c2', description: '细长高速，点杀感强，适合精准输出。', features: ['速度最高档', '单发判定干净', '适合追击高威胁目标'] },
  ion: { name: '离子弹', icon: '🟣', color: '#7e57c2', description: '重质离子球，单发更重，节奏偏稳。', features: ['单发伤害高', '更适合打厚血目标', '输出节奏平滑'] },
  spread: { name: '散弹', icon: '散弹', color: '#26a69a', description: '同次射击增加弹道数量，提升覆盖面。', features: ['多方向覆盖', '清场效率提升', '单人/组队上限 Lv.6'] },
  pierce: { name: '破甲', icon: '破甲', color: '#26a69a', description: '降低敌方防御收益，让高防目标更容易处理。', features: ['对高防怪收益高', '与高等级子弹叠加收益更稳', '单人/组队上限 Lv.6（最多降低防御约 42%）'] },
  rapid: { name: '射速', icon: '射速', color: '#26a69a', description: '缩短开火间隔，提高单位时间输出。', features: ['DPS稳定提升', '操作门槛低', '上限 Lv.5'] },
  missile: { name: '导弹舱', icon: '导弹', color: '#26a69a', description: '自动辅助导弹，补足空档火力。', features: ['自动索敌', '与主武器独立结算', '上限 Lv.8'] },
  boost: { name: '攻击强化', icon: '攻击', color: '#26a69a', description: '每层直接 +1 伤害，持续 10 秒，最多 3 层。', features: ['每层 +1 伤害', '持续 10 秒', '最多 3 层'] },
  plane: { name: '战机强化', icon: '强化', color: '#26a69a', description: '同时强化多项核心武器等级。', features: ['子弹等级+1', '散弹等级+1', '破甲等级+1'] },
  heal: { name: '回血', icon: '回血', color: '#26a69a', description: '恢复生命，优先补自己，溢出会分配给队友。', features: ['单次恢复 30 生命', '组队可溢出补给队友', '稳定保命'] },
  shield: { name: '护盾', icon: '护盾', color: '#26a69a', description: '提供护盾层，先抵挡碰撞和弹幕伤害。', features: ['单次增加护盾层', '优先消耗护盾', '掉落概率已上调（与护罩一致）'] },
  barrier: { name: '护罩墙', icon: '护罩', color: '#26a69a', description: '底部防线，敌机越线时先消耗护罩层。', features: ['拾取后补满护罩层', '越线优先扣护罩', '可减少漏怪惩罚'] },
  gravity_well: { name: '重力井', icon: '重井', color: '#90a4ae', description: '短时间聚怪并减速，方便集中清理。', features: ['持续约 4 秒', '牵引敌机向场中央靠拢', '显著提升清杂效率'] },
  emp: { name: '电磁干扰', icon: '电磁', color: '#90a4ae', description: '压制敌方火力，缓解弹幕压力。', features: ['持续约 3 秒', '敌机开火频率明显降低', 'Boss 攻击节奏显著放缓'] },
  updraft: { name: '上升气流', icon: '气流', color: '#90a4ae', description: '抬升底线附近敌机并减缓下压速度。', features: ['持续约 3.5 秒', '全体敌机下落减慢', '底线附近敌机会被抬升（强度适中）'] },
  shrapnel_storm: { name: '破片风暴', icon: '破片', color: '#90a4ae', description: '环境破片持续打击敌方，补足火力空档。', features: ['持续约 5 秒', '周期性小额伤害', '对杂兵和 Boss 都有效'] },
  lightning: { name: '毁灭闪电', icon: '毁灭', color: '#90a4ae', description: '全屏清杂兵的高价值环境道具。', features: ['清理当前敌机', '直接结算击杀分数', '可快速转危为安'] }
};

const bulletCards = [
  { key: 'laser', label: '激光束', icon: '⚡', color: '#7e57c2' },
  { key: 'burst', label: '弹幕弹', icon: '🔥', color: '#7e57c2' },
  { key: 'explosive', label: '爆炸弹', icon: '💣', color: '#7e57c2' },
  { key: 'pulse', label: '脉冲弹', icon: '🟦', color: '#7e57c2' },
  { key: 'needle', label: '针刺弹', icon: '🟩', color: '#7e57c2' },
  { key: 'ion', label: '离子弹', icon: '🟣', color: '#7e57c2' }
];

const attrCards = [
  { key: 'spread', label: '散弹', icon: '散弹', color: '#26a69a' },
  { key: 'pierce', label: '破甲', icon: '破甲', color: '#26a69a' },
  { key: 'rapid', label: '射速', icon: '射速', color: '#26a69a' },
  { key: 'missile', label: '导弹舱', icon: '导弹', color: '#26a69a' },
  { key: 'boost', label: '攻击强化', icon: '攻击', color: '#26a69a' },
  { key: 'plane', label: '战机强化', icon: '强化', color: '#26a69a' }
];

const survivalCards = [
  { key: 'heal', label: '回血', icon: '回血', color: '#26a69a' },
  { key: 'shield', label: '护盾', icon: '护盾', color: '#26a69a' },
  { key: 'barrier', label: '护罩墙', icon: '护罩', color: '#26a69a' }
];

const envCards = [
  { key: 'gravity_well', label: '重力井', icon: '重井', color: '#90a4ae' },
  { key: 'emp', label: '电磁干扰', icon: '电磁', color: '#90a4ae' },
  { key: 'updraft', label: '上升气流', icon: '气流', color: '#90a4ae' },
  { key: 'shrapnel_storm', label: '破片风暴', icon: '破片', color: '#90a4ae' },
  { key: 'lightning', label: '毁灭闪电', icon: '毁灭', color: '#90a4ae' }
];

const coreRules = [
  '手指拖动战机，自动开火；先活下来再追分。',
  '弹道武器是单选切换，但切换不降级；同类型拾取会继续升级。',
  '攻击强化每层 +1 伤害，持续 10 秒，最多 3 层。',
  '单人/组队：散弹/破甲上限 Lv.6。'
];

const quickPlay = [
  '前期先补射速+散弹，尽快稳定清怪节奏。',
  '遇到高防怪补破甲，避免伤害被吃掉。',
  '环境道具保命优先：气流救底线，EMP 抢喘息，重井聚怪。'
];

const activeDetail = computed(() => detailMap[detailKey.value] || null);

function handleStart() {
  emit('start', difficulty.value);
}

function selectDifficulty(value) {
  difficulty.value = value;
}

function goBack() {
  emit('back');
}

function toggleGuide() {
  showGuide.value = !showGuide.value;
  detailKey.value = '';
}

function openDetail(key) {
  if (!detailMap[key]) return;
  detailKey.value = key;
}

function closeDetail() {
  detailKey.value = '';
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
          v-if="!props.isGuest"
          class="leaderboard-btn"
          @click="viewLeaderboard"
        >
          🏆 排行榜
        </button>
      </div>
      <h1 class="title">✈️ 飞机大战</h1>
      <div class="player-info">
        <span>飞行员: {{ props.playerName }}</span>
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
              @click="selectDifficulty(diff.value)"
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
          📖 飞机大战说明
        </button>
      </div>

      <div class="instructions">
        <h3>3 秒速览</h3>
        <p>👆 拖动战机躲弹幕，系统自动开火</p>
        <p>🎯 先补射速/散弹，再补破甲打高防</p>
        <p>🛡️ 保命优先：护盾、护罩墙、环境道具</p>
      </div>
    </div>

    <div v-if="showGuide" class="guide-overlay" @click="toggleGuide">
      <div class="guide-modal" @click.stop>
        <button class="close-btn" @click="toggleGuide">✕</button>
        <h2>⚔️ 飞机大战玩法说明</h2>

        <div class="guide-section">
          <h3>🧭 核心规则</h3>
          <div class="rule-list">
            <div v-for="(rule, idx) in coreRules" :key="idx" class="rule-item">{{ rule }}</div>
          </div>
        </div>

        <div class="guide-section">
          <h3>🚀 上手顺序</h3>
          <div class="rule-list">
            <div v-for="(tip, idx) in quickPlay" :key="idx" class="rule-item">{{ tip }}</div>
          </div>
        </div>

        <div class="guide-section">
          <h3>🔫 弹道武器（点开看详情）</h3>
          <div class="weapon-grid">
            <div v-for="card in bulletCards" :key="card.key" class="weapon-item clickable" @click="openDetail(card.key)">
              <span class="weapon-icon" :style="{ background: card.color }">{{ card.icon }}</span>
              <span>{{ card.label }}</span>
            </div>
          </div>
        </div>

        <div class="guide-section">
          <h3>✨ 属性道具（可叠加）</h3>
          <div class="weapon-grid">
            <div v-for="card in attrCards" :key="card.key" class="weapon-item clickable" @click="openDetail(card.key)">
              <span class="weapon-icon" :style="{ background: card.color }">{{ card.icon }}</span>
              <span>{{ card.label }}</span>
            </div>
          </div>
        </div>

        <div class="guide-section">
          <h3>🛡️ 生存道具</h3>
          <div class="weapon-grid three-cols">
            <div v-for="card in survivalCards" :key="card.key" class="weapon-item clickable" @click="openDetail(card.key)">
              <span class="weapon-icon" :style="{ background: card.color }">{{ card.icon }}</span>
              <span>{{ card.label }}</span>
            </div>
          </div>
        </div>

        <div class="guide-section">
          <h3>🌪️ 环境道具</h3>
          <div class="weapon-grid five-cols">
            <div v-for="card in envCards" :key="card.key" class="weapon-item clickable" @click="openDetail(card.key)">
              <span class="weapon-icon" :style="{ background: card.color }">{{ card.icon }}</span>
              <span>{{ card.label }}</span>
            </div>
          </div>
        </div>

        <button class="understand-btn" @click="toggleGuide">我明白了，开始战斗</button>
      </div>
    </div>

    <div v-if="activeDetail" class="weapon-detail-overlay" @click="closeDetail">
      <div class="weapon-detail-modal" @click.stop>
        <button class="close-btn" @click="closeDetail">✕</button>
        <div class="weapon-detail-header" :style="{ background: activeDetail.color }">
          <span class="weapon-detail-icon">{{ activeDetail.icon }}</span>
          <h3>{{ activeDetail.name }}</h3>
        </div>
        <div class="weapon-detail-content">
          <p class="weapon-desc">{{ activeDetail.description }}</p>
          <div class="weapon-features">
            <div v-for="(feature, index) in activeDetail.features" :key="index" class="feature-item">
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
  max-width: 420px;
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
  font-size: 2.4rem;
  color: #fff;
  text-align: center;
  margin-bottom: 1rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.player-info {
  text-align: center;
  color: #4a9eff;
  font-size: 1.05rem;
  font-weight: bold;
  margin-bottom: 2rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.5rem;
  border-radius: 10px;
}

.form {
  margin-bottom: 2rem;
}

.difficulty-group {
  margin-bottom: 1.25rem;
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
  color: rgba(255, 255, 255, 0.82);
}

.instructions h3 {
  margin-bottom: 0.75rem;
  color: #fff;
}

.instructions p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.guide-overlay,
.weapon-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.weapon-detail-overlay {
  z-index: 1001;
}

.guide-modal {
  background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%);
  border-radius: 18px;
  padding: 1.5rem;
  max-width: 760px;
  width: min(94vw, 760px);
  max-height: 86vh;
  overflow-y: auto;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.2);
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
  font-size: 1.1rem;
  cursor: pointer;
}

.guide-modal h2 {
  color: #fff;
  margin-bottom: 1rem;
  text-align: center;
}

.guide-section {
  margin-bottom: 1rem;
  padding: 0.85rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.guide-section h3 {
  color: #fff;
  margin-bottom: 0.55rem;
  font-size: 1.02rem;
}

.rule-list {
  display: grid;
  gap: 0.45rem;
}

.rule-item {
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.9rem;
  line-height: 1.45;
}

.weapon-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.6rem;
}

.weapon-grid.three-cols {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.weapon-grid.five-cols {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.weapon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.35rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: #fff;
  font-size: 0.8rem;
  text-align: center;
}

.weapon-item.clickable {
  cursor: pointer;
  transition: all 0.25s;
}

.weapon-item.clickable:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.weapon-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 0.95rem;
}

.understand-btn {
  width: 100%;
  padding: 0.95rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  margin-top: 0.6rem;
}

.weapon-detail-modal {
  background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%);
  border-radius: 20px;
  max-width: 430px;
  width: 92%;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.weapon-detail-header {
  padding: 1.8rem 1.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
}

.weapon-detail-icon {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 1.6rem;
}

.weapon-detail-header h3 {
  color: #fff;
  margin: 0;
}

.weapon-detail-content {
  padding: 1.25rem;
  background: rgba(0, 0, 0, 0.2);
}

.weapon-desc {
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.95rem;
  margin-bottom: 1rem;
  text-align: center;
  line-height: 1.55;
}

.weapon-features {
  display: grid;
  gap: 0.65rem;
}

.feature-item {
  display: flex;
  gap: 0.45rem;
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.9rem;
  line-height: 1.45;
}

.feature-dot {
  color: #4a9eff;
  font-size: 1.1rem;
  line-height: 1.2;
}

@media (max-width: 820px) {
  .weapon-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .weapon-grid.five-cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .content {
    padding: 1.4rem 1rem;
    width: 95%;
  }
  .title {
    font-size: 1.85rem;
  }
  .difficulty-options {
    flex-direction: column;
  }
}
</style>
