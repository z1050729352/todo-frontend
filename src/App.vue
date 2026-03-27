<script setup>
import { ref, onMounted } from 'vue';
import { getAuthData, clearAuthData } from './utils/auth';
import Auth from './components/Auth.vue';
import GameHub from './components/GameHub.vue';
import GameStart from './components/GameStart.vue';
import PlaneGame from './components/PlaneGame.vue';
import Leaderboard from './components/Leaderboard.vue';
import LeaderboardView from './components/LeaderboardView.vue';

const appState = ref('auth'); // auth, hub, game-select, playing, game-over, leaderboard-view
const currentGame = ref('');
const playerName = ref('');
const difficulty = ref('medium');
const finalScore = ref(0);
const isVictory = ref(false);
const isGuest = ref(false);

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
}

function handleGuestLogin() {
  playerName.value = '游客';
  isGuest.value = true;
  appState.value = 'hub';
}

function handleLogout() {
  clearAuthData();
  playerName.value = '';
  isGuest.value = false;
  appState.value = 'auth';
}

function selectGame(gameId) {
  currentGame.value = gameId;
  if (gameId === 'plane-war') {
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
  checkAuth(); // 每次回到主页检查一下登录态
}

function backToGameSelect() {
  appState.value = 'game-select';
  finalScore.value = 0;
  isVictory.value = false;
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
    <!-- 登录注册页面 -->
    <Auth
      v-if="appState === 'auth'"
      @loginSuccess="handleLoginSuccess"
      @guestAccess="handleGuestLogin"
    />
    
    <!-- 游戏中心主页 -->
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
      @gameOver="gameOver"
      @backToHub="backToHub"
    />
    
    <!-- 飞机大战 - 游戏结束 -->
    <Leaderboard 
      v-else-if="appState === 'game-over' && currentGame === 'plane-war'"
      :playerName="playerName"
      :isGuest="isGuest"
      :score="finalScore"
      :difficulty="difficulty"
      :isVictory="isVictory"
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
  position: fixed;
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
}

/* 游戏中心和排行榜页面允许滚动 */
.app > .game-hub,
.app > .leaderboard-view {
  touch-action: pan-y; /* 允许垂直滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
