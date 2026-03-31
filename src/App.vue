<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getAuthData, clearAuthData } from './utils/auth';
import { initSocket, disconnectSocket, getSocket } from './socket';
import Auth from './components/Auth.vue';
import GameHub from './components/GameHub.vue';
import GameStart from './components/GameStart.vue';
import PlaneGame from './components/PlaneGame.vue';
import TetrisStart from './components/TetrisStart.vue';
import TetrisGame from './components/TetrisGame.vue';
import Leaderboard from './components/Leaderboard.vue';
import LeaderboardView from './components/LeaderboardView.vue';
import RoomScene from './components/RoomScene.vue';
import ToastContainer from './components/ToastContainer.vue';
import GlobalLoading from './components/GlobalLoading.vue';
import { showToast } from './utils/toast';
import { createInviteInbox } from './utils/inviteInbox';

const appState = ref('auth'); // auth, hub, game-select, room, playing, game-over, leaderboard-view
const currentGame = ref('');
const playerName = ref('');
const difficulty = ref('medium');
const finalScore = ref(0);
const isVictory = ref(false);
const isGuest = ref(false);
const isMultiplayer = ref(false);
const multiplayerData = ref(null);

const inviteInbox = createInviteInbox(typeof window !== 'undefined' ? window.localStorage : null);
const inviteProcessing = new Set();

const finalPlayerName = computed(() => {
  if (isMultiplayer.value && multiplayerData.value && multiplayerData.value.opponentName) {
    if (currentGame.value === 'tetris') {
      return `${playerName.value} VS ${multiplayerData.value.opponentName}`;
    }
    return `${playerName.value} & ${multiplayerData.value.opponentName}`;
  }
  return playerName.value;
});

onMounted(() => {
  checkAuth();
});

function checkAuth() {
  const parsed = getAuthData();
  if (parsed) {
    if (parsed.expire > Date.now()) {
      playerName.value = parsed.username;
      isGuest.value = false;
      appState.value = 'hub';
      initSocket(parsed.token);
      setupSocketListeners();
      return;
    } else {
      clearAuthData();
    }
  }
  appState.value = 'auth';
}

function handleLoginSuccess(username) {
  playerName.value = username;
  isGuest.value = false;
  appState.value = 'hub';
  const parsed = getAuthData();
  if (parsed) {
    initSocket(parsed.token);
    setupSocketListeners();
  }
}

function setupSocketListeners() {
  const socket = getSocket();
  if (!socket) return;
  
  socket.off('game_invite');
  socket.off('room_joined');
  socket.off('invite_rejected');

  socket.on('game_invite', (data) => {
    const inviteId = String(data?.inviteId || '');
    const fromUserId = String(data?.fromUserId || '');
    const gameType = String(data?.gameType || '');
    const fromUsername = String(data?.fromUsername || '');
    if (!inviteId || !fromUserId || !gameType) return;
    if (!inviteInbox.shouldPrompt(inviteId)) return;
    if (inviteProcessing.has(inviteId)) return;
    inviteProcessing.add(inviteId);

    const ok = window.confirm(`好友 ${fromUsername} 邀请你玩 ${gameType === 'plane-war' ? '飞机大战' : '俄罗斯方块'}，是否接受？`);
    inviteInbox.markHandled(inviteId, ok ? 'accepted' : 'rejected');
    if (ok) {
      socket.emit('accept_invite', { inviteId, fromUserId, gameType });
    } else {
      socket.emit('reject_invite', { inviteId, fromUserId, gameType });
    }
    setTimeout(() => inviteProcessing.delete(inviteId), 1200);
  });

  socket.on('room_joined', (data) => {
    appState.value = 'room';
    currentGame.value = data.gameType;
    isMultiplayer.value = true;
    multiplayerData.value = data;
  });

  socket.on('invite_rejected', (data) => {
    showToast(`好友 ${data.username} 拒绝了你的邀请`, 'warning');
  });
}

function startMultiplayerGame(settings) {
  currentGame.value = settings.gameType;
  difficulty.value = settings.difficulty || 'medium';
  if (settings.timeLimit) {
    multiplayerData.value.timeLimit = settings.timeLimit;
  }
  if (settings.seed) {
    multiplayerData.value.seed = settings.seed;
  }
  appState.value = 'playing';
}

function handleGuestLogin() {
  playerName.value = '游客';
  isGuest.value = true;
  appState.value = 'hub';
}

function handleLogout() {
  clearAuthData();
  disconnectSocket();
  playerName.value = '';
  isGuest.value = false;
  appState.value = 'auth';
}

function selectGame(gameId) {
  currentGame.value = gameId;
  if (gameId === 'plane-war' || gameId === 'tetris') {
    appState.value = 'game-select';
  }
}

function startGame(diff) {
  // 此时playerName已经由登录状态维护，无需再次输入
  difficulty.value = diff;
  appState.value = 'playing';
}

function gameOver(score, victory = false) {
  finalScore.value = score;
  isVictory.value = victory;
  appState.value = 'game-over';
}

function backToHub() {
  appState.value = 'hub';
  currentGame.value = '';
  finalScore.value = 0;
  isVictory.value = false;
  isMultiplayer.value = false;
  multiplayerData.value = null;
  checkAuth(); // 每次回到主页检查一下登录态
}

function backToGameSelect() {
  appState.value = 'game-select';
  finalScore.value = 0;
  isVictory.value = false;
  isMultiplayer.value = false;
  multiplayerData.value = null;
  checkAuth(); // 返回游戏选择也检查登录态
}

function handleLeaderboardBack() {
  if (currentGame.value === 'plane-war') {
    appState.value = 'game-select';
  } else {
    appState.value = 'hub';
  }
}

function viewLeaderboard() {
  appState.value = 'leaderboard-view';
}
</script>

<template>
  <div class="app">
    <GlobalLoading />
    <ToastContainer />
    
    <!-- 登录注册页面 -->
    <Auth
      v-if="appState === 'auth'"
      @loginSuccess="handleLoginSuccess"
      @guestAccess="handleGuestLogin"
    />
    
    <!-- GAME BOSS -->
    <GameHub 
      v-else-if="appState === 'hub'" 
      :playerName="playerName"
      :isGuest="isGuest"
      @selectGame="selectGame"
      @viewLeaderboard="viewLeaderboard"
      @logout="handleLogout"
    />
    
    <!-- 独立排行榜页面 -->
    <LeaderboardView
      v-else-if="appState === 'leaderboard-view'"
      @back="handleLeaderboardBack"
    />

    <!-- 房间 -->
    <RoomScene
      v-else-if="appState === 'room'"
      :roomData="multiplayerData"
      :playerName="playerName"
      @startGame="startMultiplayerGame"
      @leaveRoom="backToHub"
    />
    
    <!-- 飞机大战 - 开始页面 -->
    <GameStart 
      v-else-if="appState === 'game-select' && currentGame === 'plane-war'" 
      :playerName="playerName"
      :isGuest="isGuest"
      @start="startGame"
      @back="backToHub"
      @viewLeaderboard="viewLeaderboard"
    />
    
    <!-- 飞机大战 - 游戏中 -->
    <PlaneGame 
      v-else-if="appState === 'playing' && currentGame === 'plane-war'"
      :playerName="playerName"
      :isGuest="isGuest"
      :difficulty="difficulty"
      :isMultiplayer="isMultiplayer"
      :roomData="multiplayerData"
      @gameOver="gameOver"
      @backToHub="backToHub"
    />
    
    <!-- 俄罗斯方块 - 开始页面 -->
    <TetrisStart 
      v-else-if="appState === 'game-select' && currentGame === 'tetris'" 
      :playerName="playerName"
      :isGuest="isGuest"
      @start="startGame"
      @back="backToHub"
      @viewLeaderboard="viewLeaderboard"
    />
    
    <!-- 俄罗斯方块 - 游戏中 -->
    <TetrisGame 
      v-else-if="appState === 'playing' && currentGame === 'tetris'"
      :playerName="playerName"
      :isGuest="isGuest"
      :difficulty="difficulty"
      :isMultiplayer="isMultiplayer"
      :roomData="multiplayerData"
      @gameOver="gameOver"
      @backToHub="backToHub"
    />
    
    <!-- 飞机大战 - 游戏结束 -->
    <Leaderboard 
      v-else-if="appState === 'game-over' && (currentGame === 'plane-war' || currentGame === 'tetris')"
      :playerName="finalPlayerName"
      :isGuest="isGuest"
      :score="finalScore"
      :difficulty="difficulty"
      :isVictory="isVictory"
      :gameType="currentGame"
      :isMultiplayer="isMultiplayer"
      :roomData="multiplayerData"
      @restart="backToGameSelect"
      @backToHub="backToHub"
    />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

#app {
  width: 100%;
  height: 100%;
}

.app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding-top: var(--safe-area-top, 0px);
  padding-bottom: var(--safe-area-bottom, 0px);
}

/* 游戏中心和排行榜页面允许滚动 */
.app > .game-hub,
.app > .leaderboard-view {
  touch-action: pan-y; /* 允许垂直滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
