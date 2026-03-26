<script setup>
import { ref } from 'vue';
import GameStart from './components/GameStart.vue';
import PlaneGame from './components/PlaneGame.vue';
import Leaderboard from './components/Leaderboard.vue';

const gameState = ref('start'); // start, playing, leaderboard
const playerName = ref('');
const difficulty = ref('medium');
const finalScore = ref(0);
const isVictory = ref(false);

function startGame(name, diff) {
  playerName.value = name;
  difficulty.value = diff;
  gameState.value = 'playing';
}

function gameOver(score, victory = false) {
  console.log('游戏结束，分数:', score, '通关:', victory);
  finalScore.value = score;
  isVictory.value = victory;
  gameState.value = 'leaderboard';
  console.log('切换到排行榜页面，玩家:', playerName.value, '难度:', difficulty.value, '分数:', finalScore.value);
}

function backToStart() {
  gameState.value = 'start';
  playerName.value = '';
  finalScore.value = 0;
  isVictory.value = false;
}
</script>

<template>
  <div class="app">
    <GameStart 
      v-if="gameState === 'start'" 
      @start="startGame"
    />
    <PlaneGame 
      v-else-if="gameState === 'playing'"
      :playerName="playerName"
      :difficulty="difficulty"
      @gameOver="gameOver"
    />
    <Leaderboard 
      v-else-if="gameState === 'leaderboard'"
      :playerName="playerName"
      :score="finalScore"
      :difficulty="difficulty"
      :isVictory="isVictory"
      @restart="backToStart"
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
  touch-action: none;
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
</style>
