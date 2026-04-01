<script setup>
import { ref, computed, onMounted } from 'vue';
import { loadSnakeLeaderboard, clearSnakeLeaderboard, formatDuration } from '../utils/snakeLeaderboard';

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

const emit = defineEmits(['start', 'back']);

const difficulty = ref('medium');
const showGuide = ref(false);
const showLeaderboard = ref(false);
const leaderboard = ref([]);

const difficulties = [
  { value: 'easy', label: '休闲', desc: '慢一点，容错更高' },
  { value: 'medium', label: '标准', desc: '经典节奏' },
  { value: 'hard', label: '困难', desc: '更快更刺激' }
];

const playerLabel = computed(() => String(props.playerName || (props.isGuest ? '游客' : '玩家')));

function handleStart() {
  emit('start', difficulty.value);
}

function goBack() {
  emit('back');
}

function toggleGuide() {
  showGuide.value = !showGuide.value;
}

function toggleLeaderboard() {
  showLeaderboard.value = !showLeaderboard.value;
  if (showLeaderboard.value) {
    leaderboard.value = loadSnakeLeaderboard();
  }
}

function handleClear() {
  if (!window.confirm('确定清空本机贪吃蛇排行榜？')) return;
  clearSnakeLeaderboard();
  leaderboard.value = [];
}

function difficultyLabel(v) {
  if (v === 'easy') return '休闲';
  if (v === 'medium') return '标准';
  if (v === 'hard') return '困难';
  return v;
}

function refreshLeaderboard() {
  leaderboard.value = loadSnakeLeaderboard();
}

onMounted(() => {
  refreshLeaderboard();
});
</script>

<template>
  <div class="snake-start">
    <div class="content">
      <div class="header-actions">
        <button class="btn ghost" @click="goBack">← 返回</button>
        <button class="btn ghost" @click="toggleLeaderboard">🏆 排行榜</button>
      </div>

      <h1 class="title">🐍 贪吃蛇</h1>
      <div class="player-info">玩家: {{ playerLabel }}</div>

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

        <button class="btn primary" @click="handleStart">开始游戏</button>
        <button class="btn ghost" @click="toggleGuide">玩法说明</button>
      </div>

      <div class="instructions">
        <h3>操作</h3>
        <p>👆 手指触摸到哪里，蛇就朝哪里走</p>
        <p>⚡ 双击屏幕：加速 / 恢复</p>
        <p>⏸️ 右上角暂停：继续 / 重新开始</p>
        <p>🏁 坚持满 20 分钟获胜</p>
      </div>
    </div>

    <div v-if="showGuide" class="overlay" @click="toggleGuide">
      <div class="modal" @click.stop>
        <button class="close" @click="toggleGuide">✕</button>
        <h2>道具</h2>
        <div class="guide-list">
          <div class="guide-item">
            <span class="tag slow">缓</span>
            <div class="text">速度减半，持续 5 秒</div>
          </div>
          <div class="guide-item">
            <span class="tag pierce">穿</span>
            <div class="text">穿墙一次出现，获得后持续到结束</div>
          </div>
          <div class="guide-item">
            <span class="tag multi">倍</span>
            <div class="text">分数倍增，持续 5 秒</div>
          </div>
        </div>
        <div class="tip">道具每 15 秒随机出现一次，存在 10 秒</div>
        <button class="btn primary full" @click="toggleGuide">我知道了</button>
      </div>
    </div>

    <div v-if="showLeaderboard" class="overlay" @click="toggleLeaderboard">
      <div class="modal wide" @click.stop>
        <div class="modal-head">
          <h2>🏆 贪吃蛇排行榜</h2>
          <div class="head-actions">
            <button class="btn ghost small" @click="refreshLeaderboard">刷新</button>
            <button class="btn ghost small danger" @click="handleClear">清空</button>
            <button class="close" @click="toggleLeaderboard">✕</button>
          </div>
        </div>

        <div v-if="leaderboard.length === 0" class="empty">暂无记录</div>
        <div v-else class="rank-list">
          <div v-for="(item, idx) in leaderboard.slice(0, 30)" :key="item.id" class="rank-row">
            <div class="rk">{{ idx + 1 }}</div>
            <div class="nm">{{ item.name }}</div>
            <div class="sc">{{ item.score }}</div>
            <div class="tm">{{ formatDuration(item.durationMs) }}</div>
            <div class="df">{{ difficultyLabel(item.difficulty) }}</div>
            <div class="vx">{{ item.victory ? '胜利' : '失败' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snake-start {
  width: 100%;
  height: 100%;
  background: radial-gradient(1200px 800px at 50% 10%, rgba(79, 172, 254, 0.25), transparent 60%),
    linear-gradient(180deg, #0b0f14 0%, #101826 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.content {
  width: min(420px, 92vw);
  max-height: 92vh;
  overflow-y: auto;
  padding: 20px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
}

.header-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.title {
  text-align: center;
  color: #fff;
  font-size: 2.1rem;
  margin: 10px 0 6px;
}

.player-info {
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 14px;
}

.form {
  display: grid;
  gap: 12px;
}

.difficulty-group label {
  display: block;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 10px;
  font-size: 0.95rem;
}

.difficulty-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.difficulty-option {
  padding: 12px 12px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.10);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.difficulty-option:hover {
  transform: translateY(-1px);
  background: rgba(0, 0, 0, 0.35);
}

.difficulty-option.active {
  border-color: rgba(79, 172, 254, 0.9);
  box-shadow: 0 0 0 2px rgba(79, 172, 254, 0.15) inset;
}

.diff-label {
  color: #fff;
  font-weight: 700;
  margin-bottom: 4px;
}

.diff-desc {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.9rem;
}

.btn {
  border: none;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease;
  user-select: none;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn.primary {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #071018;
  font-weight: 800;
}

.btn.ghost {
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
}

.btn.small {
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 0.9rem;
}

.btn.danger {
  color: #ffb2b2;
}

.btn.full {
  width: 100%;
}

.instructions {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.85);
}

.instructions h3 {
  margin-bottom: 8px;
  color: #fff;
}

.instructions p {
  font-size: 0.95rem;
  line-height: 1.6;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 16px;
}

.modal {
  width: min(520px, 94vw);
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px;
  background: rgba(16, 24, 38, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 16px 14px 14px;
  position: relative;
  color: rgba(255, 255, 255, 0.9);
}

.modal.wide {
  width: min(720px, 96vw);
}

.close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.1rem;
  cursor: pointer;
}

.guide-list {
  display: grid;
  gap: 10px;
  margin: 12px 0 10px;
}

.guide-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.tag {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #0b0f14;
  font-weight: 900;
}

.tag.slow {
  background: #2ed573;
}

.tag.pierce {
  background: #ffa502;
}

.tag.multi {
  background: #4facfe;
}

.text {
  flex: 1;
}

.tip {
  opacity: 0.85;
  font-size: 0.95rem;
  margin-bottom: 12px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-right: 40px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-list {
  margin-top: 12px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.rank-row {
  display: grid;
  grid-template-columns: 46px 1fr 86px 86px 70px 70px;
  gap: 8px;
  padding: 10px 10px;
  background: rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
  font-size: 0.95rem;
}

.rank-row:last-child {
  border-bottom: none;
}

.rk {
  color: rgba(255, 255, 255, 0.7);
}

.nm {
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc {
  text-align: right;
  font-weight: 800;
  color: #4facfe;
}

.tm, .df, .vx {
  text-align: right;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
}

.empty {
  margin-top: 14px;
  text-align: center;
  opacity: 0.85;
  padding: 20px 0 8px;
}
</style>

