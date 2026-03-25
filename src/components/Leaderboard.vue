<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const props = defineProps({
  playerName: String,
  score: Number,
  difficulty: String
});

const emit = defineEmits(['restart']);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:12580/api'
});

const leaderboard = ref([]);
const currentRank = ref(null);
const loading = ref(true);
const savedScoreId = ref(null);

const difficultyLabels = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
};

async function saveScore() {
  try {
    console.log('正在保存分数...', {
      playerName: props.playerName,
      score: props.score,
      difficulty: props.difficulty
    });
    
    const response = await api.post('/scores', {
      playerName: props.playerName,
      score: props.score,
      difficulty: props.difficulty
    });
    
    console.log('分数保存成功:', response.data);
    savedScoreId.value = response.data._id;
    await fetchLeaderboard();
    await fetchRank();
  } catch (error) {
    console.error('保存分数失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
    // 即使保存失败也尝试获取排行榜
    loading.value = false;
  }
}

async function fetchLeaderboard() {
  try {
    console.log('正在获取排行榜...');
    const response = await api.get('/scores', {
      params: {
        difficulty: props.difficulty,
        limit: 50
      }
    });
    console.log('排行榜数据:', response.data);
    leaderboard.value = response.data;
  } catch (error) {
    console.error('获取排行榜失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
  }
}

async function fetchRank() {
  if (!savedScoreId.value) {
    loading.value = false;
    return;
  }
  
  try {
    console.log('正在获取排名...');
    const response = await api.get(`/scores/rank/${savedScoreId.value}`);
    console.log('排名数据:', response.data);
    currentRank.value = response.data.rank;
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

onMounted(async () => {
  await saveScore();
});
</script>

<template>
  <div class="leaderboard">
    <div class="stars"></div>
    <div class="content">
      <h1 class="title">🏆 游戏结束</h1>
      
      <div class="result-card">
        <div class="result-item">
          <span class="result-label">玩家</span>
          <span class="result-value">{{ playerName }}</span>
        </div>
        <div class="result-item">
          <span class="result-label">难度</span>
          <span class="result-value">{{ difficultyLabels[difficulty] }}</span>
        </div>
        <div class="result-item highlight">
          <span class="result-label">得分</span>
          <span class="result-value score">{{ score }}</span>
        </div>
        <div v-if="!loading && currentRank" class="result-item">
          <span class="result-label">排名</span>
          <span class="result-value rank">第 {{ currentRank }} 名</span>
        </div>
      </div>

      <div class="leaderboard-section">
        <h2>排行榜 - {{ difficultyLabels[difficulty] }}</h2>
        
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else-if="leaderboard.length > 0" class="leaderboard-list">
          <div 
            v-for="(item, index) in leaderboard" 
            :key="item._id"
            class="leaderboard-item"
            :class="{ 
              highlight: item._id === savedScoreId,
              top3: index < 3 
            }"
          >
            <div class="rank-badge" :class="`rank-${index + 1}`">
              {{ index + 1 }}
            </div>
            <div class="player-name">{{ item.playerName }}</div>
            <div class="player-score">{{ item.score }}</div>
          </div>
        </div>
        
        <div v-else class="empty">
          暂无记录，你是第一个！
        </div>
      </div>

      <button class="restart-btn" @click="handleRestart">
        再玩一次
      </button>
    </div>
  </div>
</template>

<style scoped>
.leaderboard {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0a0e27 0%, #1a1f3a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow-y: auto;
  padding: 20px 0;
  -webkit-overflow-scrolling: touch;
}

.stars {
  position: fixed;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(2px 2px at 20% 30%, white, transparent),
    radial-gradient(2px 2px at 60% 70%, white, transparent),
    radial-gradient(1px 1px at 50% 50%, white, transparent),
    radial-gradient(1px 1px at 80% 10%, white, transparent),
    radial-gradient(2px 2px at 90% 60%, white, transparent);
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
  max-width: 500px;
  width: 90%;
  max-height: 90%;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
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
  font-size: 2rem;
  color: #fff;
  text-align: center;
  margin-bottom: 1.5rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.result-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.result-item:last-child {
  border-bottom: none;
}

.result-item.highlight {
  padding: 1rem 0;
}

.result-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.result-value {
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
}

.result-value.score {
  font-size: 2rem;
  color: #ffeb3b;
  text-shadow: 0 0 10px rgba(255, 235, 59, 0.5);
}

.result-value.rank {
  color: #4a9eff;
}

.leaderboard-section {
  margin-bottom: 1.5rem;
}

.leaderboard-section h2 {
  color: #fff;
  font-size: 1.3rem;
  margin-bottom: 1rem;
  text-align: center;
}

.loading {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  padding: 2rem;
}

.leaderboard-list {
  max-height: 300px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 0.5rem;
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

.leaderboard-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  transition: all 0.3s;
}

.leaderboard-item.highlight {
  background: rgba(74, 158, 255, 0.2);
  border: 2px solid #4a9eff;
}

.leaderboard-item.top3 {
  background: rgba(255, 215, 0, 0.1);
}

.rank-badge {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  margin-right: 1rem;
  flex-shrink: 0;
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #ffd700, #ffed4e);
  color: #000;
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #c0c0c0, #e8e8e8);
  color: #000;
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #cd7f32, #e8a87c);
  color: #000;
}

.player-name {
  flex: 1;
  color: #fff;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-score {
  color: #ffeb3b;
  font-weight: bold;
  font-size: 1rem;
  margin-left: 1rem;
}

.empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 2rem;
}

.restart-btn {
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
}

.restart-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.restart-btn:active {
  transform: translateY(0);
}

@media (max-width: 480px) {
  .content {
    padding: 1rem;
    width: 95%;
  }
  
  .title {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  
  .result-card {
    padding: 1rem;
  }
  
  .result-value.score {
    font-size: 1.5rem;
  }
  
  .leaderboard-section h2 {
    font-size: 1.1rem;
  }
  
  .leaderboard-list {
    max-height: 250px;
  }
  
  .leaderboard-item {
    padding: 0.6rem;
  }
  
  .rank-badge {
    width: 26px;
    height: 26px;
    font-size: 0.85rem;
  }
  
  .player-name {
    font-size: 0.85rem;
  }
  
  .player-score {
    font-size: 0.9rem;
  }
}

@media (max-height: 700px) {
  .content {
    padding: 1rem;
  }
  
  .title {
    font-size: 1.3rem;
    margin-bottom: 0.8rem;
  }
  
  .result-card {
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .result-item {
    padding: 0.5rem 0;
  }
  
  .leaderboard-section {
    margin-bottom: 1rem;
  }
  
  .leaderboard-list {
    max-height: 200px;
  }
}
</style>
