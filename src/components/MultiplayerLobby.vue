<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { getSocket } from '../socket';
import { showToast } from '../utils/toast';

const props = defineProps({
  roomData: Object,
  playerName: String
});

const emit = defineEmits(['startGame', 'leaveRoom']);

const isHost = props.roomData.role === 'host';
const gameType = ref(props.roomData.gameType);
const difficulty = ref('medium');
const timeLimit = ref(3); // Tetris only
const suggestionReceived = ref(null);
const opponentName = props.roomData.opponentName;

const difficultyLabel = (diff) => {
  if (diff === 'easy') return '简单';
  if (diff === 'hard') return '困难';
  return '普通';
};

const gameTypeLabel = (type) => {
  return type === 'plane-war' ? '飞机大战' : '俄罗斯方块';
};

function suggestSettings() {
  const socket = getSocket();
  if (socket) {
    socket.emit('suggest_game_settings', {
      roomId: props.roomData.roomId,
      settings: {
        gameType: gameType.value,
        difficulty: difficulty.value,
        timeLimit: timeLimit.value
      }
    });
    showToast('已向对方发送设置，等待同意...', 'info');
  }
}

function agreeSettings() {
  const socket = getSocket();
  if (socket && suggestionReceived.value) {
    socket.emit('agree_game_settings', {
      roomId: props.roomData.roomId,
      settings: suggestionReceived.value
    });
  }
}

function rejectSettings() {
  const socket = getSocket();
  if (socket && suggestionReceived.value) {
    socket.emit('reject_game_settings', { roomId: props.roomData.roomId });
  }
  suggestionReceived.value = null;
}

function leaveRoom() {
  const socket = getSocket();
  if (socket && props.roomData?.roomId) {
    socket.emit('leave_room', { roomId: props.roomData.roomId });
  }
  emit('leaveRoom');
}

onMounted(() => {
  const socket = getSocket();
  if (socket) {
    socket.on('game_settings_suggested', (settings) => {
      suggestionReceived.value = settings;
    });

    socket.on('start_multiplayer_game', (settings) => {
      emit('startGame', settings);
    });

    socket.on('game_settings_rejected', (data) => {
      if (isHost) {
        showToast(`${data?.username || '对方'}拒绝了当前设置`, 'warning');
      }
    });

    socket.on('opponent_disconnected', () => {
      showToast('对方已断开连接', 'error');
      emit('leaveRoom');
    });
  }
});

onUnmounted(() => {
  const socket = getSocket();
  if (socket) {
    socket.off('game_settings_suggested');
    socket.off('start_multiplayer_game');
    socket.off('game_settings_rejected');
    socket.off('opponent_disconnected');
  }
});

</script>

<template>
  <div class="lobby-container">
    <div class="lobby-card">
      <h2>双人游戏房间</h2>
      <p>你 vs {{ opponentName }}</p>
      
      <div v-if="isHost" class="host-controls">
        <h3>作为房主，请选择游戏设置：</h3>
        <div class="form-group">
          <label>游戏类型:</label>
          <select v-model="gameType">
            <option value="plane-war">✈️ 飞机大战</option>
            <option value="tetris">🧱 俄罗斯方块</option>
          </select>
        </div>
        
        <div class="form-group" v-if="gameType === 'plane-war'">
          <label>难度:</label>
          <select v-model="difficulty">
            <option value="easy">简单</option>
            <option value="medium">普通</option>
            <option value="hard">困难</option>
          </select>
        </div>
        
        <div class="form-group" v-if="gameType === 'tetris'">
          <label>难度:</label>
          <select v-model="difficulty">
            <option value="easy">简单</option>
            <option value="medium">普通</option>
            <option value="hard">困难</option>
          </select>
        </div>

        <div class="form-group" v-if="gameType === 'tetris'">
          <label>时间限制:</label>
          <select v-model="timeLimit">
            <option :value="3">3 分钟</option>
            <option :value="5">5 分钟</option>
            <option :value="10">10 分钟</option>
          </select>
        </div>
        
        <button class="primary-btn" @click="suggestSettings">发送邀请设置</button>
      </div>
      
      <div v-else class="guest-view">
        <div v-if="!suggestionReceived">
          <p>等待房主选择游戏设置...</p>
          <div class="loader"></div>
        </div>
        <div v-else class="suggestion-box">
          <h3>房主请求开始游戏：</h3>
          <p><strong>游戏:</strong> {{ gameTypeLabel(suggestionReceived.gameType) }}</p>
          <p><strong>难度:</strong> {{ difficultyLabel(suggestionReceived.difficulty) }}</p>
          <p v-if="suggestionReceived.gameType === 'tetris'"><strong>时间:</strong> {{ suggestionReceived.timeLimit }} 分钟</p>
          
          <div class="actions">
            <button class="accept-btn" @click="agreeSettings">同意并开始</button>
            <button class="reject-btn" @click="rejectSettings">拒绝</button>
          </div>
        </div>
      </div>

      <button class="leave-btn" @click="leaveRoom">离开房间</button>
    </div>
  </div>
</template>

<style scoped>
.lobby-container {
  width: 100vw; height: 100vh;
  display: flex; justify-content: center; align-items: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  color: white;
}

.lobby-card {
  background: rgba(255,255,255,0.1);
  padding: 30px; border-radius: 15px; width: 90%; max-width: 400px;
  border: 1px solid #00FFFF; text-align: center;
}

.form-group {
  margin: 15px 0; display: flex; justify-content: space-between; align-items: center;
}

select {
  background: #1a1a1a; color: white; border: 1px solid #00FFFF; padding: 5px 10px; border-radius: 5px;
}

button {
  padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; margin-top: 10px; width: 100%;
}

.primary-btn { background: #00FFFF; color: #000; }
.accept-btn { background: #4caf50; color: white; }
.reject-btn { background: #f44336; color: white; }
.leave-btn { background: transparent; border: 1px solid #f44336; color: #f44336; margin-top: 20px; }

.suggestion-box {
  background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; margin-top: 20px;
}
.actions { display: flex; gap: 10px; }

.loader {
  border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #00FFFF;
  border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;
  margin: 20px auto;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
