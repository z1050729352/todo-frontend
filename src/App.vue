<script setup>
import { ref } from 'vue';
import GameHub from './components/GameHub.vue';
import GameStart from './components/GameStart.vue';
import PlaneGame from './components/PlaneGame.vue';
import Leaderboard from './components/Leaderboard.vue';
import LeaderboardView from './components/LeaderboardView.vue';

const appState = ref('hub'); // hub, game-select, playing, game-over, leaderboard-view
const currentGame = ref('');
const playerName = ref('');
const difficulty = ref('medium');
const finalScore = ref(0);
const isVictory = ref(false);

function selectGame(gameId) {
  currentGame.value = gameId;
  if (gameId === 'plane-war') {
    appState.value = 'game-select';
  }
}

function startGame(name, diff) {
  playerName.value = name;
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
  playerName.value = '';
  finalScore.value = 0;
  isVictory.value = false;
}

function backToGameSelect() {
  appState.value = 'game-select';
  playerName.value = '';
  finalScore.value = 0;
  isVictory.value = false;
}

function viewLeaderboard() {
  appState.value = 'leaderboard-view';
}
</script>

<template>
  <div class="app">
    <!-- 游戏中心主页 -->
    <GameHub 
      v-if="appState === 'hub'" 
      @selectGame="selectGame"
      @viewLeaderboard="viewLeaderboard"
    />
    
    <!-- 独立排行榜页面 -->
    <LeaderboardView
      v-else-if="appState === 'leaderboard-view'"
      @back="backToHub"
    />
    
    <!-- 飞机大战 - 开始页面 -->
    <GameStart 
      v-else-if="appState === 'game-select' && currentGame === 'plane-war'" 
      @start="startGame"
      @back="backToHub"
    />
    
    <!-- 飞机大战 - 游戏中 -->
    <PlaneGame 
      v-else-if="appState === 'playing' && currentGame === 'plane-war'"
      :playerName="playerName"
      :difficulty="difficulty"
      @gameOver="gameOver"
    />
    
    <!-- 飞机大战 - 游戏结束 -->
    <Leaderboard 
      v-else-if="appState === 'game-over' && currentGame === 'plane-war'"
      :playerName="playerName"
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
