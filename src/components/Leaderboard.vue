<script setup>
import { ref, onMounted, computed } from 'vue';
import { getAuthData } from '../utils/auth';
import { api } from '../utils/api';

const props = defineProps({
  playerName: String,
  score: Number,
  difficulty: String,
  isVictory: Boolean,
  gameType: {
    type: String,
    default: 'plane-war'
  },
  isMultiplayer: {
    type: Boolean,
    default: false
  },
  roomData: {
    type: Object,
    default: null
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  resultMeta: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['restart', 'backToHub']);

const leaderboard = ref([]);
const currentRank = ref(null);
const loading = ref(true);
const savedEntryId = ref(null);

const difficultyLabels = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
};

const authUserName = computed(() => String(getAuthData()?.username || ''));

const gameLabel = computed(() => props.gameType === 'tetris' ? '俄罗斯方块' : '飞机大战');
const modeLabel = computed(() => {
  if (props.isMultiplayer) return props.gameType === 'tetris' ? '双人对战' : '双人合作';
  return `单人·${difficultyLabels[props.difficulty] || props.difficulty}`;
});
const rankTitle = computed(() => {
  if (props.isMultiplayer) return props.gameType === 'tetris' ? '对战' : '组队';
  return difficultyLabels[props.difficulty] || props.difficulty;
});

const resultKey = computed(() => {
  if (props.gameType === 'plane-war' && props.isMultiplayer) return 'plane-coop';
  if (props.gameType === 'tetris' && props.isMultiplayer) {
    const result = String(props.resultMeta?.result || '');
    if (result === 'draw') return 'tetris-draw';
    if (result === 'win' || props.isVictory) return 'tetris-win';
    return 'tetris-lose';
  }
  if (props.gameType === 'plane-war') return props.isVictory ? 'plane-clear' : 'plane-fail';
  if (props.gameType === 'tetris') return props.isVictory ? 'tetris-clear' : 'tetris-over';
  return 'default';
});

const heroConfig = computed(() => {
  const map = {
    'plane-clear': { icon: '✈️', title: '制空成功，任务通关', subtitle: '火力与走位都在线，这局飞得漂亮。', tone: 'victory' },
    'plane-fail': { icon: '⚠️', title: '战机受损，本局结束', subtitle: '再来一局，下一次会更稳。', tone: 'normal' },
    'tetris-clear': { icon: '🧱', title: '连消通关，节奏封神', subtitle: '压线操作很极限，节奏拿捏得非常好。', tone: 'victory' },
    'tetris-over': { icon: '🧩', title: '方块堆满，回合结束', subtitle: '这局先记账，下一局冲更高分。', tone: 'normal' },
    'plane-coop': { icon: '🤝', title: '协作任务完成', subtitle: '合作愉快，双机编队非常默契。', tone: 'coop' },
    'tetris-win': { icon: '🏆', title: '恭喜胜利', subtitle: '攻防节奏掌控到位，拿下这一局。', tone: 'victory' },
    'tetris-lose': { icon: '💪', title: '很遗憾本次落败', subtitle: '差距不大，调整节奏就能翻盘。', tone: 'normal' },
    'tetris-draw': { icon: '⚖️', title: '势均力敌，平局收场', subtitle: '双方发挥都很稳，下局决胜。', tone: 'coop' },
    default: { icon: '🎮', title: '本局结束', subtitle: '状态在线，继续挑战更高纪录。', tone: 'normal' }
  };
  return map[resultKey.value] || map.default;
});

function normalizeScore(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function getEntryScore(entry) {
  return normalizeScore(entry?.rankScore ?? entry?.score ?? 0);
}

const mySavedEntry = computed(() => leaderboard.value.find((item) => item?.id === savedEntryId.value) || null);
const globalBestScore = computed(() => {
  if (!leaderboard.value.length) return null;
  return leaderboard.value.reduce((best, item) => Math.max(best, getEntryScore(item)), 0);
});
const previousPersonalBest = computed(() => {
  const me = authUserName.value;
  if (!me) return null;
  const ownHistory = leaderboard.value
    .filter((item) => item?.playerId === me && item?.id !== savedEntryId.value)
    .map(getEntryScore);
  if (!ownHistory.length) return null;
  return Math.max(...ownHistory);
});
const isPersonalBest = computed(() => {
  if (!mySavedEntry.value) return false;
  if (previousPersonalBest.value == null) return true;
  return getEntryScore(mySavedEntry.value) > previousPersonalBest.value;
});
const isGlobalBest = computed(() => {
  if (!mySavedEntry.value || globalBestScore.value == null) return false;
  return getEntryScore(mySavedEntry.value) >= globalBestScore.value;
});
const personalDelta = computed(() => {
  if (!mySavedEntry.value || previousPersonalBest.value == null) return null;
  return Math.max(0, getEntryScore(mySavedEntry.value) - previousPersonalBest.value);
});

const resultTags = computed(() => {
  const tags = [
    gameLabel.value,
    modeLabel.value
  ];
  if (!props.isGuest && !loading.value && currentRank.value) tags.push(`当前排名 #${currentRank.value}`);
  if (props.isGuest) tags.push('游客模式');
  return tags;
});

const highlights = computed(() => {
  const list = [];
  if (props.isGuest) {
    list.push('登录后可保存战绩并参与全球排行');
    return list;
  }
  if (loading.value) return list;

  if (currentRank.value === 1) list.push('恭喜登顶本模式排行榜');
  else if (currentRank.value && currentRank.value <= 3) list.push('成功进入本模式排行榜前三');

  if (mySavedEntry.value && isGlobalBest.value && currentRank.value === 1) list.push('你刚刚打出了当前最高纪录');
  if (mySavedEntry.value && isPersonalBest.value) {
    if (previousPersonalBest.value == null) list.push('首个个人历史成绩已记录');
    else if ((personalDelta.value || 0) > 0) list.push(`个人新纪录，较历史最好提升 ${personalDelta.value}`);
  }

  if (props.gameType === 'plane-war' && props.isMultiplayer) {
    const teammateScore = normalizeScore(props.resultMeta?.teammateScore || 0);
    list.push(`协作得分：你 ${normalizeScore(props.score)} / 队友 ${teammateScore}`);
  }
  if (props.gameType === 'tetris' && props.isMultiplayer) {
    const enemy = normalizeScore(props.resultMeta?.opponentScore || 0);
    list.push(`对战比分：你 ${normalizeScore(props.score)} : ${enemy} 对手`);
  }
  return list.slice(0, 4);
});

async function saveScore() {
  if (props.isGuest) {
    await fetchLeaderboard();
    loading.value = false;
    return;
  }
  try {
    const authData = getAuthData();
    if (!authData?.token) return;
    const game = props.gameType === 'tetris' ? 'tetris' : 'aircraft';
    const mode = props.isMultiplayer ? (game === 'tetris' ? 'pvp' : 'coop') : props.difficulty;
    const payload = {
      score: props.score,
      duration: 0,
      roomId: props.roomData?.roomId,
      partnerId: props.roomData?.opponentName
    };
    const response = await api.post(`/rank/${game}/${mode}`, payload, {
      headers: { Authorization: `Bearer ${authData.token}` }
    });
    savedEntryId.value = response.data.id;
    await fetchLeaderboard();
    await fetchRank();
  } catch (error) {
    console.error('保存分数失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
    loading.value = false;
  }
}

async function fetchLeaderboard() {
  try {
    const game = props.gameType === 'tetris' ? 'tetris' : 'aircraft';
    const mode = props.isMultiplayer ? (game === 'tetris' ? 'pvp' : 'coop') : props.difficulty;
    const response = await api.get(`/rank/${game}/${mode}`, { params: { limit: 100 } });
    leaderboard.value = response.data?.items || [];
  } catch (error) {
    console.error('获取排行榜失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
  }
}

async function fetchRank() {
  if (!savedEntryId.value) {
    loading.value = false;
    return;
  }
  try {
    const idx = leaderboard.value.findIndex((e) => e && e.id === savedEntryId.value);
    currentRank.value = idx >= 0 ? idx + 1 : null;
  } catch (error) {
    console.error('获取排名失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
  } finally {
    loading.value = false;
  }
}

function handleRestart() {
  emit('restart');
}

function handleBackToHub() {
  emit('backToHub');
}

onMounted(async () => {
  await saveScore();
});
</script>

<template>
  <div class="leaderboard">
    <div class="bg-orb orb-a"></div>
    <div class="bg-orb orb-b"></div>
    <div class="content" :class="[`tone-${heroConfig.tone}`]">
      <section class="hero">
        <div class="hero-icon">{{ heroConfig.icon }}</div>
        <h1 class="hero-title">{{ heroConfig.title }}</h1>
        <p class="hero-subtitle">{{ heroConfig.subtitle }}</p>
        <div class="tags">
          <span v-for="tag in resultTags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </section>

      <section class="result-card">
        <div class="result-item">
          <span class="result-label">玩家</span>
          <span class="result-value">{{ playerName }}</span>
        </div>
        <div v-if="isMultiplayer && roomData?.opponentName" class="result-item">
          <span class="result-label">{{ gameType === 'tetris' ? '对手' : '队友' }}</span>
          <span class="result-value">{{ roomData.opponentName }}</span>
        </div>
        <div class="result-item">
          <span class="result-label">模式</span>
          <span class="result-value">{{ modeLabel }}</span>
        </div>
        <div class="result-item highlight">
          <span class="result-label">{{ gameType === 'tetris' ? '本局分数' : '任务积分' }}</span>
          <span class="result-value score">{{ normalizeScore(score) }}</span>
        </div>
        <div v-if="!isGuest && !loading && currentRank" class="result-item">
          <span class="result-label">世界排名</span>
          <span class="result-value rank">第 {{ currentRank }} 名</span>
        </div>
      </section>

      <section v-if="highlights.length" class="highlights">
        <h2>战报亮点</h2>
        <div class="highlight-list">
          <p v-for="line in highlights" :key="line" class="highlight-item">{{ line }}</p>
        </div>
      </section>

      <section class="leaderboard-section">
        <h2>排行榜 - {{ rankTitle }}</h2>
        <div v-if="loading" class="loading">正在加载排行榜...</div>
        <div v-else-if="leaderboard.length > 0" class="leaderboard-list">
          <div
            v-for="(item, index) in leaderboard"
            :key="item.id"
            class="leaderboard-item"
            :class="{ highlight: item.id === savedEntryId, top3: index < 3 }"
          >
            <div class="rank-badge" :class="`rank-${index + 1}`">{{ index + 1 }}</div>
            <div class="player-name">{{ item.playerId }}</div>
            <div class="player-score">{{ getEntryScore(item) }}</div>
          </div>
        </div>
        <div v-else class="empty">暂无记录，你是第一个</div>
      </section>

      <section class="button-group">
        <button class="restart-btn" @click="handleRestart">再玩一次</button>
        <button class="hub-btn" @click="handleBackToHub">返回游戏中心</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.leaderboard {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 10%, #273469 0%, #0a1025 40%, #060910 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow-y: auto;
  padding: 18px 0;
}

.bg-orb {
  position: fixed;
  border-radius: 999px;
  filter: blur(18px);
  opacity: 0.45;
  pointer-events: none;
}

.orb-a {
  width: 300px;
  height: 300px;
  background: #5d8bff;
  top: -100px;
  left: -100px;
  animation: orbFloatA 9s ease-in-out infinite;
}

.orb-b {
  width: 260px;
  height: 260px;
  background: #ff6a88;
  right: -70px;
  bottom: -60px;
  animation: orbFloatB 10s ease-in-out infinite;
}

@keyframes orbFloatA {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(35px, 26px); }
}

@keyframes orbFloatB {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-26px, -28px); }
}

.content {
  position: relative;
  z-index: 1;
  width: min(540px, 92vw);
  max-height: 92vh;
  overflow-y: auto;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(7, 13, 35, 0.82);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 46px rgba(0, 0, 0, 0.45);
  padding: 20px;
}

.content::-webkit-scrollbar {
  width: 4px;
}

.content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.35);
  border-radius: 999px;
}

.tone-victory {
  border-color: rgba(255, 215, 110, 0.45);
  box-shadow: 0 14px 52px rgba(255, 195, 0, 0.25);
}

.tone-coop {
  border-color: rgba(113, 232, 255, 0.42);
  box-shadow: 0 14px 52px rgba(63, 217, 255, 0.2);
}

.hero {
  text-align: center;
  margin-bottom: 14px;
  animation: heroIn 0.45s ease;
}

@keyframes heroIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 10px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.14);
  font-size: 28px;
}

.hero-title {
  color: #fff;
  font-size: 1.6rem;
  font-weight: 900;
}

.hero-subtitle {
  margin-top: 8px;
  color: rgba(233, 240, 255, 0.84);
  font-size: 0.95rem;
  line-height: 1.5;
}

.tags {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.tag {
  padding: 4px 10px;
  border-radius: 999px;
  color: rgba(242, 246, 255, 0.95);
  font-size: 0.76rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
}

.result-card {
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
}

.result-item:last-child {
  border-bottom: 0;
}

.result-label {
  color: rgba(228, 236, 255, 0.68);
  font-size: 0.88rem;
}

.result-value {
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  text-align: right;
}

.result-item.highlight .result-value.score {
  color: #ffe66d;
  font-size: 2rem;
  line-height: 1.1;
  text-shadow: 0 0 14px rgba(255, 230, 109, 0.45);
}

.result-value.rank {
  color: #9cd3ff;
}

.highlights {
  margin-bottom: 12px;
  border-radius: 14px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(135deg, rgba(65, 115, 255, 0.16), rgba(95, 228, 255, 0.08));
}

.highlights h2 {
  font-size: 1rem;
  color: #fff;
  margin-bottom: 8px;
}

.highlight-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.highlight-item {
  color: rgba(240, 247, 255, 0.92);
  font-size: 0.9rem;
  line-height: 1.45;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.leaderboard-section {
  margin-bottom: 12px;
}

.leaderboard-section h2 {
  color: #fff;
  font-size: 1.1rem;
  text-align: center;
  margin-bottom: 10px;
}

.loading,
.empty {
  text-align: center;
  color: rgba(224, 233, 255, 0.7);
  padding: 18px 10px;
}

.leaderboard-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.24);
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.leaderboard-item.top3 {
  background: rgba(255, 215, 87, 0.12);
}

.leaderboard-item.highlight {
  border-color: rgba(118, 200, 255, 0.8);
  background: rgba(69, 155, 255, 0.18);
  box-shadow: 0 0 0 1px rgba(118, 200, 255, 0.2) inset;
}

.rank-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.86rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #ffd76f, #ffedbb);
  color: #1c1507;
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #d1d8e8, #f1f5ff);
  color: #1e2535;
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #d89963, #f3d3b8);
  color: #2b1c12;
}

.player-name {
  flex: 1;
  color: #fff;
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-score {
  color: #ffe66d;
  font-size: 0.96rem;
  font-weight: 800;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.restart-btn,
.hub-btn {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  color: #fff;
  border: none;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.restart-btn {
  background: linear-gradient(135deg, #4f7fff, #9b63ff);
  box-shadow: 0 8px 20px rgba(91, 122, 255, 0.35);
}

.hub-btn {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.restart-btn:hover,
.hub-btn:hover {
  transform: translateY(-1px);
}

.restart-btn:active,
.hub-btn:active {
  transform: translateY(0);
}

@media (max-width: 480px) {
  .content {
    width: 95vw;
    padding: 14px;
  }

  .hero-title {
    font-size: 1.35rem;
  }

  .result-item.highlight .result-value.score {
    font-size: 1.7rem;
  }

  .leaderboard-list {
    max-height: 220px;
  }
}
</style>
