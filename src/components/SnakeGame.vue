<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { loadSnakeLeaderboard, saveSnakeRecord, formatDuration } from '../utils/snakeLeaderboard';

const props = defineProps({
  playerName: {
    type: String,
    default: ''
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  difficulty: {
    type: String,
    default: 'medium'
  }
});

const emit = defineEmits(['backToHub']);

const canvasRef = ref(null);
const paused = ref(false);
const gameEnded = ref(false);
const victory = ref(false);
const score = ref(0);
const elapsedMs = ref(0);
const leaderboard = ref([]);
const boostOn = ref(false);

const baseSpeed = computed(() => {
  if (props.difficulty === 'easy') return 160;
  if (props.difficulty === 'hard') return 300;
  return 220;
});

const difficultyLabel = computed(() => {
  if (props.difficulty === 'easy') return '休闲';
  if (props.difficulty === 'hard') return '困难';
  return '标准';
});

const playerLabel = computed(() => String(props.playerName || (props.isGuest ? '游客' : '玩家')));
const displayTime = computed(() => formatDuration(elapsedMs.value));

let ctx = null;
let rafId = 0;

let viewW = 0;
let viewH = 0;
let worldW = 0;
let worldH = 0;
let camX = 0;
let camY = 0;

const headRadius = 9;
const bodyRadius = 7.5;
const segmentSpacing = 10;

const winMs = 20 * 60 * 1000;

const snake = {
  points: [],
  dir: { x: 1, y: 0 }
};

const food = {
  x: 0,
  y: 0,
  r: 9
};

const item = {
  active: false,
  type: '',
  x: 0,
  y: 0,
  r: 12,
  bornMs: 0,
  expireMs: 0
};

let scoreMultiplier = 1;
let multiplierUntilMs = 0;
let slowUntilMs = 0;
let wrapEnabled = false;
let wrapOffered = false;

let nextItemSpawnMs = 0;

let lastTs = 0;
let nowMs = 0;
let isPointerDown = false;
let targetWorld = null;
let lastTapMs = 0;
let lastTapX = 0;
let lastTapY = 0;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalize(v) {
  const d = Math.hypot(v.x, v.y);
  if (d <= 1e-6) return { x: 1, y: 0 };
  return { x: v.x / d, y: v.y / d };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function setCanvasSize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  viewW = Math.max(1, Math.floor(rect.width));
  viewH = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  worldW = Math.max(viewW * 2, 600);
  worldH = Math.max(viewH * 2, 900);
  if (snake.points.length) {
    const h = snake.points[0];
    h.x = clamp(h.x, headRadius, worldW - headRadius);
    h.y = clamp(h.y, headRadius, worldH - headRadius);
  }
}

function randomFreePosition(radius) {
  for (let k = 0; k < 80; k++) {
    const p = {
      x: rand(radius + 10, worldW - radius - 10),
      y: rand(radius + 10, worldH - radius - 10)
    };
    if (snake.points.length) {
      const h = snake.points[0];
      if (Math.hypot(p.x - h.x, p.y - h.y) < 120) continue;
    }
    return p;
  }
  return { x: worldW / 2, y: worldH / 2 };
}

function respawnFood() {
  const p = randomFreePosition(food.r);
  food.x = p.x;
  food.y = p.y;
}

function resetGame() {
  paused.value = false;
  gameEnded.value = false;
  victory.value = false;
  score.value = 0;
  elapsedMs.value = 0;
  boostOn.value = false;
  scoreMultiplier = 1;
  multiplierUntilMs = 0;
  slowUntilMs = 0;
  wrapEnabled = false;
  wrapOffered = false;
  item.active = false;
  item.type = '';
  nextItemSpawnMs = 15000;
  snake.points = [];
  const start = { x: worldW / 2, y: worldH / 2 };
  snake.dir = { x: 1, y: 0 };
  for (let i = 0; i < 18; i++) {
    snake.points.push({ x: start.x - i * segmentSpacing, y: start.y });
  }
  targetWorld = { x: start.x + 200, y: start.y };
  respawnFood();
}

function speedNow() {
  let mul = 1;
  if (boostOn.value) mul *= 1.7;
  if (nowMs < slowUntilMs) mul *= 0.5;
  return baseSpeed.value * mul;
}

function updateCamera() {
  const h = snake.points[0];
  camX = clamp(h.x - viewW / 2, 0, worldW - viewW);
  camY = clamp(h.y - viewH / 2, 0, worldH - viewH);
}

function growSnake(segments = 8) {
  const tail = snake.points[snake.points.length - 1];
  for (let i = 0; i < segments; i++) {
    snake.points.push({ x: tail.x, y: tail.y });
  }
}

function spawnItem() {
  if (item.active) return;
  const pool = ['slow', 'multi'];
  if (!wrapEnabled && !wrapOffered) pool.push('pierce');
  const type = pool[Math.floor(Math.random() * pool.length)];
  if (type === 'pierce') wrapOffered = true;
  const p = randomFreePosition(item.r);
  item.active = true;
  item.type = type;
  item.x = p.x;
  item.y = p.y;
  item.bornMs = nowMs;
  item.expireMs = nowMs + 10000;
}

function applyItem(type) {
  if (type === 'slow') {
    slowUntilMs = nowMs + 5000;
    return;
  }
  if (type === 'multi') {
    scoreMultiplier = 2;
    multiplierUntilMs = nowMs + 5000;
    return;
  }
  if (type === 'pierce') {
    wrapEnabled = true;
  }
}

function handleEatFood() {
  const gain = Math.floor(10 * scoreMultiplier);
  score.value += gain;
  growSnake(10);
  respawnFood();
}

function checkSelfCollision() {
  const h = snake.points[0];
  for (let i = 10; i < snake.points.length; i++) {
    const p = snake.points[i];
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < headRadius + bodyRadius * 0.6) return true;
  }
  return false;
}

function endGame(v) {
  if (gameEnded.value) return;
  gameEnded.value = true;
  victory.value = Boolean(v);
  leaderboard.value = saveSnakeRecord({
    name: playerLabel.value,
    score: score.value,
    durationMs: elapsedMs.value,
    victory: victory.value,
    difficulty: props.difficulty
  });
}

function update(dt) {
  nowMs = elapsedMs.value;
  if (nowMs >= winMs) {
    elapsedMs.value = winMs;
    endGame(true);
    return;
  }

  if (nowMs >= multiplierUntilMs) scoreMultiplier = 1;
  if (item.active && nowMs >= item.expireMs) {
    item.active = false;
    item.type = '';
  }
  if (!item.active && nowMs >= nextItemSpawnMs) {
    spawnItem();
    nextItemSpawnMs = nowMs + 15000;
  }

  let desired = snake.dir;
  if (targetWorld) {
    const h = snake.points[0];
    desired = normalize({ x: targetWorld.x - h.x, y: targetWorld.y - h.y });
  }
  snake.dir.x = lerp(snake.dir.x, desired.x, 0.18);
  snake.dir.y = lerp(snake.dir.y, desired.y, 0.18);
  snake.dir = normalize(snake.dir);

  const h = snake.points[0];
  h.x += snake.dir.x * speedNow() * dt;
  h.y += snake.dir.y * speedNow() * dt;

  if (wrapEnabled) {
    let dx = 0;
    let dy = 0;
    if (h.x < 0) dx = worldW;
    if (h.x > worldW) dx = -worldW;
    if (h.y < 0) dy = worldH;
    if (h.y > worldH) dy = -worldH;
    if (dx || dy) {
      for (const p of snake.points) {
        p.x += dx;
        p.y += dy;
      }
    }
  } else {
    if (h.x < headRadius || h.x > worldW - headRadius || h.y < headRadius || h.y > worldH - headRadius) {
      endGame(false);
      return;
    }
  }

  for (let i = 1; i < snake.points.length; i++) {
    const prev = snake.points[i - 1];
    const cur = snake.points[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const d = Math.hypot(dx, dy);
    if (d > segmentSpacing) {
      cur.x = prev.x + (dx / d) * segmentSpacing;
      cur.y = prev.y + (dy / d) * segmentSpacing;
    }
  }

  if (Math.hypot(h.x - food.x, h.y - food.y) <= headRadius + food.r) {
    handleEatFood();
  }

  if (item.active) {
    if (Math.hypot(h.x - item.x, h.y - item.y) <= headRadius + item.r) {
      const t = item.type;
      item.active = false;
      item.type = '';
      applyItem(t);
    }
  }

  if (checkSelfCollision()) {
    endGame(false);
    return;
  }
}

function drawCircle(x, y, r, fillStyle, strokeStyle = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function drawWalls() {
  if (wrapEnabled) return;
  const left = 0;
  const top = 0;
  const right = worldW;
  const bottom = worldH;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(left - camX, top - camY, right - left, bottom - top);
  ctx.stroke();
}

function drawHud() {
  const padTop = 12 + (Number(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top').replace('px', '')) || 0);
  const padSide = 12;

  const leftX = padSide;
  const topY = padTop;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(leftX, topY, 160, 60);
  ctx.fillRect(viewW - padSide - 124, topY, 124, 60);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`分数 ${score.value}`, leftX + 12, topY + 24);
  ctx.fillText(`时间 ${displayTime.value}`, leftX + 12, topY + 46);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 14px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
  ctx.fillText(difficultyLabel.value, viewW - padSide - 124 + 12, topY + 24);

  const effects = [];
  if (boostOn.value) effects.push('⚡');
  if (nowMs < slowUntilMs) effects.push('缓');
  if (nowMs < multiplierUntilMs) effects.push('倍');
  if (wrapEnabled) effects.push('穿');
  ctx.fillText(effects.join(' '), viewW - padSide - 124 + 12, topY + 46);
}

function render() {
  if (!ctx) return;
  updateCamera();
  ctx.clearRect(0, 0, viewW, viewH);

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, viewW, viewH);

  drawWalls();

  drawCircle(food.x - camX, food.y - camY, food.r, '#00f2fe', 'rgba(255,255,255,0.35)', 2);

  if (item.active) {
    const label = item.type === 'slow' ? '缓' : item.type === 'multi' ? '倍' : '穿';
    const color = item.type === 'slow' ? '#2ed573' : item.type === 'multi' ? '#4facfe' : '#ffa502';
    drawCircle(item.x - camX, item.y - camY, item.r, color, 'rgba(0,0,0,0.25)', 3);
    ctx.fillStyle = '#0b0f14';
    ctx.font = '900 16px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, item.x - camX, item.y - camY + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  const n = snake.points.length;
  for (let i = n - 1; i >= 1; i--) {
    const p = snake.points[i];
    const t = i / n;
    const r = lerp(bodyRadius, bodyRadius * 0.75, t);
    drawCircle(p.x - camX, p.y - camY, r, 'rgba(79, 172, 254, 0.85)');
  }
  const h = snake.points[0];
  drawCircle(h.x - camX, h.y - camY, headRadius, '#4facfe', 'rgba(255,255,255,0.35)', 2);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const ex = h.x - camX + snake.dir.x * 5;
  const ey = h.y - camY + snake.dir.y * 5;
  drawCircle(ex + -snake.dir.y * 4, ey + snake.dir.x * 4, 2.3, 'rgba(0,0,0,0.75)');
  drawCircle(ex + snake.dir.y * 4, ey + -snake.dir.x * 4, 2.3, 'rgba(0,0,0,0.75)');

  drawHud();
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (!paused.value && !gameEnded.value) {
    elapsedMs.value += dt * 1000;
    update(dt);
  } else {
    nowMs = elapsedMs.value;
  }

  render();
  rafId = requestAnimationFrame(tick);
}

function screenToWorld(clientX, clientY) {
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (viewW / rect.width);
  const y = (clientY - rect.top) * (viewH / rect.height);
  return { x: camX + x, y: camY + y };
}

function updateTargetFromEvent(e) {
  const pt = screenToWorld(e.clientX, e.clientY);
  targetWorld = pt;
}

function handlePointerDown(e) {
  if (!canvasRef.value) return;
  canvasRef.value.setPointerCapture?.(e.pointerId);
  isPointerDown = true;
  updateTargetFromEvent(e);

  const now = performance.now();
  const dx = e.clientX - lastTapX;
  const dy = e.clientY - lastTapY;
  const near = Math.hypot(dx, dy) < 40;
  if (now - lastTapMs < 280 && near) {
    boostOn.value = !boostOn.value;
    lastTapMs = 0;
  } else {
    lastTapMs = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
  }
}

function handlePointerMove(e) {
  if (!isPointerDown) return;
  updateTargetFromEvent(e);
}

function handlePointerUp() {
  isPointerDown = false;
}

function togglePause() {
  if (gameEnded.value) return;
  paused.value = !paused.value;
}

function resume() {
  paused.value = false;
}

function restart() {
  resetGame();
}

function backToHub() {
  if (!window.confirm('确认返回游戏中心？进度不会保存。')) return;
  emit('backToHub');
}

watch(gameEnded, (v) => {
  if (v) paused.value = true;
});

onMounted(() => {
  setCanvasSize();
  resetGame();
  leaderboard.value = loadSnakeLeaderboard();

  window.addEventListener('resize', setCanvasSize, { passive: true });
  rafId = requestAnimationFrame(tick);
});

onUnmounted(() => {
  window.removeEventListener('resize', setCanvasSize);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<template>
  <div class="snake-game">
    <canvas
      ref="canvasRef"
      class="game-canvas"
      @pointerdown.prevent="handlePointerDown"
      @pointermove.prevent="handlePointerMove"
      @pointerup.prevent="handlePointerUp"
      @pointercancel.prevent="handlePointerUp"
      @dblclick.prevent="boostOn = !boostOn"
    ></canvas>

    <div class="top-ui">
      <button class="ui-btn left" @click="backToHub">←</button>
      <button class="ui-btn right" @click="togglePause">⏸</button>
    </div>

    <div v-if="paused" class="overlay" @click="gameEnded ? null : resume()">
      <div class="panel" @click.stop>
        <div v-if="gameEnded" class="result">
          <div class="result-title">{{ victory ? '🎉 胜利' : '💀 失败' }}</div>
          <div class="result-row">分数：{{ score }}</div>
          <div class="result-row">时间：{{ displayTime }}</div>
          <div class="result-row">难度：{{ difficultyLabel }}</div>
        </div>
        <div v-else class="result">
          <div class="result-title">⏸ 已暂停</div>
        </div>

        <div class="btns">
          <button v-if="!gameEnded" class="btn primary" @click="resume">继续游戏</button>
          <button class="btn ghost" @click="restart">重新开始</button>
          <button class="btn ghost" @click="backToHub">返回</button>
        </div>

        <div v-if="gameEnded" class="rank">
          <div class="rank-title">🏆 本机排行榜</div>
          <div v-if="leaderboard.length === 0" class="rank-empty">暂无记录</div>
          <div v-else class="rank-list">
            <div v-for="(item, idx) in leaderboard.slice(0, 15)" :key="item.id" class="rank-row">
              <div class="rk">{{ idx + 1 }}</div>
              <div class="nm">{{ item.name }}</div>
              <div class="sc">{{ item.score }}</div>
              <div class="tm">{{ formatDuration(item.durationMs) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snake-game {
  width: 100%;
  height: 100%;
  background: #0b0f14;
  position: relative;
  overflow: hidden;
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.top-ui {
  position: absolute;
  top: calc(12px + var(--safe-area-top, 0px));
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
}

.ui-btn {
  pointer-events: auto;
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.ui-btn.left {
  left: 12px;
}

.ui-btn.right {
  right: 12px;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  padding: 16px;
}

.panel {
  width: min(520px, 94vw);
  max-height: 86vh;
  overflow-y: auto;
  background: rgba(16, 24, 38, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  padding: 14px 14px;
}

.result {
  color: rgba(255, 255, 255, 0.92);
}

.result-title {
  font-size: 1.5rem;
  font-weight: 900;
  margin-bottom: 8px;
}

.result-row {
  margin: 4px 0;
  opacity: 0.92;
}

.btns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 12px;
}

.btn {
  border: none;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
  user-select: none;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn.primary {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #071018;
  font-weight: 900;
}

.btn.ghost {
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.92);
}

.rank {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.92);
}

.rank-title {
  font-weight: 900;
  margin-bottom: 10px;
}

.rank-empty {
  opacity: 0.85;
}

.rank-list {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.rank-row {
  display: grid;
  grid-template-columns: 44px 1fr 80px 80px;
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
  opacity: 0.8;
}

.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc {
  text-align: right;
  font-weight: 900;
  color: #4facfe;
}

.tm {
  text-align: right;
  opacity: 0.85;
}
</style>

