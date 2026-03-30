<script setup>
import { ref, onMounted } from 'vue';
import { getAuthData } from '../utils/auth';
import { api } from '../utils/api';
import { getDuelNames, getDuelScores, getDuelWinner, isDuelRecord } from '../modules/DuelLeaderboard';

const emit = defineEmits(['back']);

const tab = ref('easy');
const leaderboard = ref([]);
const loading = ref(false);
const error = ref('');
const replayModal = ref({ open: false, entry: null });

const difficultyLabel = (diff) => {
  if (diff === 'easy') return '简单';
  if (diff === 'hard') return '困难';
  return '中等';
};

async function fetchLeaderboard() {
  loading.value = true;
  error.value = '';
  try {
    const authData = getAuthData();
    const headers = authData?.token ? { 'Authorization': `Bearer ${authData.token}` } : {};
    
    const response = await api.get('/scores', {
      params: tab.value === 'duel' ? { gameMode: 'duel', gameType: 'tetris', limit: 50 } : { difficulty: tab.value, limit: 50 },
      headers
    });
    leaderboard.value = response.data;
  } catch (err) {
    console.error('获取排行榜失败:', err);
    error.value = '获取排行榜失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function changeTab(next) {
  tab.value = next;
  fetchLeaderboard();
}

function goBack() {
  emit('back');
}

function openReplay(entry) {
  replayModal.value = { open: true, entry };
}

function closeReplay() {
  replayModal.value = { open: false, entry: null };
}

onMounted(() => {
  fetchLeaderboard();
});
</script>

<template>
  <div class="leaderboard-view">
    <div class="leaderboard-container">
      <div class="header">
        <button class="back-btn" @click="goBack">← 返回</button>
        <h1 class="title">🏆 排行榜</h1>
      </div>

      <div class="difficulty-tabs">
        <button 
          class="tab"
          :class="{ active: tab === 'easy' }"
          @click="changeTab('easy')"
        >
          简单
        </button>
        <button 
          class="tab"
          :class="{ active: tab === 'duel' }"
          @click="changeTab('duel')"
        >
          对战
        </button>
        <button 
          class="tab"
          :class="{ active: tab === 'medium' }"
          @click="changeTab('medium')"
        >
          中等
        </button>
        <button 
          class="tab"
          :class="{ active: tab === 'hard' }"
          @click="changeTab('hard')"
        >
          困难
        </button>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>

      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="fetchLeaderboard" class="retry-btn">重试</button>
      </div>

      <div v-else-if="leaderboard.length === 0" class="empty">
        <p>暂无排行榜数据</p>
        <p class="empty-hint">快去创造第一个记录吧！</p>
      </div>

      <div v-else class="leaderboard-list">
        <template v-if="tab === 'duel'">
          <div class="duel-list">
            <div v-if="leaderboard.filter(isDuelRecord).length === 0" class="empty">
              <p>暂无对战记录</p>
              <p class="empty-hint">去和好友来一局吧！</p>
            </div>
            <template v-else>
              <div
                v-for="entry in leaderboard.filter(isDuelRecord)"
                :key="entry._id"
                class="duel-card"
                @click="openReplay(entry)"
              >
                <div class="duel-side" :class="{ winner: getDuelWinner(entry) === 'A' }">
                  <div v-if="getDuelWinner(entry) === 'A'" class="winner-stamp">胜</div>
                  <div class="duel-name">{{ getDuelNames(entry).aName }}</div>
                  <div class="duel-score">A {{ getDuelScores(entry).aScore }}分</div>
                </div>
                <div class="duel-center">VS</div>
                <div class="duel-side" :class="{ winner: getDuelWinner(entry) === 'B' }">
                  <div v-if="getDuelWinner(entry) === 'B'" class="winner-stamp">胜</div>
                  <div class="duel-name">{{ getDuelNames(entry).bName }}</div>
                  <div class="duel-score">B {{ getDuelScores(entry).bScore }}分</div>
                </div>
                <div class="duel-meta">
                  <span class="duel-diff">{{ difficultyLabel(entry.difficulty) }}</span>
                  <span class="duel-date">{{ new Date(entry.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }}</span>
                </div>
              </div>
            </template>
          </div>
        </template>
        <template v-else>
          <div 
            v-for="(entry, index) in leaderboard" 
            :key="entry._id"
            class="leaderboard-item"
            :class="{ 
              'rank-1': index === 0,
              'rank-2': index === 1,
              'rank-3': index === 2
            }"
          >
            <div class="rank">
              <span v-if="index === 0" class="medal">🥇</span>
              <span v-else-if="index === 1" class="medal">🥈</span>
              <span v-else-if="index === 2" class="medal">🥉</span>
              <span v-else class="rank-number">{{ index + 1 }}</span>
            </div>
            <div class="player-info">
              <div class="player-name">{{ entry.playerName }}</div>
              <div class="player-meta">
                <span class="score">{{ entry.score }}分</span>
                <span v-if="entry.isVictory" class="victory-badge">✓ 通关</span>
              </div>
            </div>
            <div class="date">
              {{ new Date(entry.createdAt).toLocaleDateString('zh-CN', { 
                month: 'short', 
                day: 'numeric' 
              }) }}
            </div>
          </div>
        </template>
      </div>

      <div v-if="replayModal.open" class="replay-overlay" @click.self="closeReplay">
        <div class="replay-modal">
          <div class="replay-header">
            <div class="replay-title">对战回放数据</div>
            <button class="replay-close" @click="closeReplay">×</button>
          </div>
          <pre class="replay-content">{{ JSON.stringify(replayModal.entry?.duel?.replay || replayModal.entry, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-view {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}

.leaderboard-container {
  width: 100%;
  max-width: 600px;
  animation: fadeIn 0.5s ease-out;
  padding-bottom: 40px;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
  position: relative;
}

.back-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(-3px);
}

.title {
  flex: 1;
  text-align: center;
  font-size: 2rem;
  color: #fff;
  text-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  margin-right: 100px;
}

.difficulty-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.1);
  padding: 5px;
  border-radius: 25px;
  backdrop-filter: blur(10px);
}

.tab {
  flex: 1;
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
}

.tab.active {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
  font-weight: bold;
}

.tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.loading, .error, .empty {
  text-align: center;
  padding: 60px 20px;
  color: #fff;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error p {
  font-size: 1.1rem;
  margin-bottom: 20px;
}

.retry-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 12px 30px;
  border-radius: 25px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.empty-hint {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-top: 10px;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  padding-right: 5px;
}

.leaderboard-list::-webkit-scrollbar {
  width: 6px;
}

.leaderboard-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.leaderboard-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.leaderboard-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.duel-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.duel-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 50px 1fr;
  gap: 12px;
  align-items: stretch;
  background: rgba(255, 255, 255, 0.15);
  padding: 14px;
  border-radius: 16px;
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
  overflow: hidden;
}

.duel-card:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-2px);
}

.duel-side {
  position: relative;
  border-radius: 12px;
  padding: 14px 12px;
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-height: 76px;
}

.duel-side.winner {
  background: rgba(255, 215, 0, 0.12);
  box-shadow: 0 0 18px rgba(255, 215, 0, 0.25);
  animation: winner-pulse 1.2s ease-in-out infinite;
}

@keyframes winner-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(255, 215, 0, 0.18); }
  50% { box-shadow: 0 0 26px rgba(255, 215, 0, 0.38); }
}

.winner-stamp {
  position: absolute;
  top: 8px;
  left: 10px;
  transform: rotate(-15deg);
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffe082, #ffca28, #ffb300);
  color: rgba(0, 0, 0, 0.85);
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 1px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
}

.duel-center {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 2px;
}

.duel-name {
  font-weight: 800;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.95);
}

.duel-score {
  font-weight: 800;
  font-size: 16px;
  color: #fff;
}

.duel-meta {
  position: absolute;
  right: 14px;
  bottom: 10px;
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.duel-diff {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.2);
}

.replay-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.replay-modal {
  width: min(760px, 92vw);
  max-height: min(80vh, 700px);
  background: rgba(30, 30, 30, 0.95);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.replay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
}

.replay-title {
  color: #fff;
  font-weight: 800;
}

.replay-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.replay-content {
  padding: 14px;
  margin: 0;
  overflow: auto;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(255, 255, 255, 0.15);
  padding: 15px 20px;
  border-radius: 15px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  animation: slideIn 0.5s ease-out backwards;
  animation-delay: calc(var(--index, 0) * 0.05s);
}

.leaderboard-item:nth-child(1) { --index: 0; }
.leaderboard-item:nth-child(2) { --index: 1; }
.leaderboard-item:nth-child(3) { --index: 2; }
.leaderboard-item:nth-child(4) { --index: 3; }
.leaderboard-item:nth-child(5) { --index: 4; }
.leaderboard-item:nth-child(6) { --index: 5; }
.leaderboard-item:nth-child(7) { --index: 6; }
.leaderboard-item:nth-child(8) { --index: 7; }
.leaderboard-item:nth-child(9) { --index: 8; }
.leaderboard-item:nth-child(10) { --index: 9; }

.leaderboard-item:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateX(5px);
}

.leaderboard-item.rank-1 {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 193, 7, 0.2));
  border: 2px solid rgba(255, 215, 0, 0.5);
}

.leaderboard-item.rank-2 {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.3), rgba(158, 158, 158, 0.2));
  border: 2px solid rgba(192, 192, 192, 0.5);
}

.leaderboard-item.rank-3 {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.3), rgba(184, 115, 51, 0.2));
  border: 2px solid rgba(205, 127, 50, 0.5);
}

.rank {
  min-width: 50px;
  text-align: center;
}

.medal {
  font-size: 2rem;
}

.rank-number {
  font-size: 1.5rem;
  font-weight: bold;
  color: #fff;
}

.player-info {
  flex: 1;
}

.player-name {
  font-size: 1.1rem;
  font-weight: bold;
  color: #fff;
  margin-bottom: 5px;
}

.player-meta {
  display: flex;
  gap: 10px;
  align-items: center;
}

.score {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.victory-badge {
  background: rgba(76, 175, 80, 0.3);
  color: #4caf50;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: bold;
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.date {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  min-width: 60px;
  text-align: right;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 480px) {
  .title {
    font-size: 1.5rem;
    margin-right: 80px;
  }

  .back-btn {
    padding: 8px 16px;
    font-size: 0.9rem;
  }

  .leaderboard-item {
    padding: 12px 15px;
    gap: 10px;
  }

  .medal {
    font-size: 1.5rem;
  }

  .rank-number {
    font-size: 1.2rem;
  }

  .player-name {
    font-size: 1rem;
  }

  .score {
    font-size: 0.85rem;
  }

  .date {
    font-size: 0.75rem;
    min-width: 50px;
  }
}
</style>
