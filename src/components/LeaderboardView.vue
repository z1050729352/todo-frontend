<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const emit = defineEmits(['back']);

const difficulty = ref('easy');
const leaderboard = ref([]);
const loading = ref(false);
const error = ref('');

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:12580';

async function fetchLeaderboard() {
  loading.value = true;
  error.value = '';
  try {
    const response = await axios.get(`${API_URL}/api/scores`, {
      params: { difficulty: difficulty.value }
    });
    leaderboard.value = response.data;
  } catch (err) {
    console.error('获取排行榜失败:', err);
    error.value = '获取排行榜失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function changeDifficulty(diff) {
  difficulty.value = diff;
  fetchLeaderboard();
}

function goBack() {
  emit('back');
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
          :class="{ active: difficulty === 'easy' }"
          @click="changeDifficulty('easy')"
        >
          简单
        </button>
        <button 
          class="tab"
          :class="{ active: difficulty === 'medium' }"
          @click="changeDifficulty('medium')"
        >
          中等
        </button>
        <button 
          class="tab"
          :class="{ active: difficulty === 'hard' }"
          @click="changeDifficulty('hard')"
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-view {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.leaderboard-container {
  width: 100%;
  max-width: 600px;
  animation: fadeIn 0.5s ease-out;
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
