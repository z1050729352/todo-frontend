<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { loadSnakeLeaderboard, saveSnakeRecord, formatDuration } from '../utils/snakeLeaderboard';

// ─────────────────────────────────────────────
// 核心设计（slither.io 风格）
//
// 1. 蛇用「角度」驱动，每帧最多转 MAX_TURN_RATE rad/s
//    → 彻底消除反向绕圈撞自己的问题
//
// 2. 触摸控制：用触摸点相对蛇头的方向角来决定目标角
//    → 跟手，不追世界坐标点
//
// 3. 反向保护：目标角与当前角差值 > π 时自动取最短路径
//    → 不会因为手指在蛇头后方而强行 U 形转弯
//
// 4. 身体用「链式跟随」：每个节点跟随前一个节点，
//    间距固定，不会因速度变化而拉伸
// ─────────────────────────────────────────────

const props = defineProps({
  playerName: { type: String, default: '' },
  isGuest:    { type: Boolean, default: false },
  difficulty: { type: String, default: 'medium' }
});

const emit = defineEmits(['backToHub']);

const canvasRef = ref(null);
const paused    = ref(false);
const gameEnded = ref(false);
const victory   = ref(false);
const score     = ref(0);
const elapsedMs = ref(0);
const leaderboard = ref([]);
const boostOn   = ref(false);

// ── 难度参数 ──────────────────────────────────
// baseSpeed: 像素/秒
// maxTurnRate: 弧度/秒（越大转弯越灵活）
const DIFF = {
  easy:   { baseSpeed: 140, maxTurnRate: 3.2 },
  medium: { baseSpeed: 190, maxTurnRate: 3.8 },
  hard:   { baseSpeed: 260, maxTurnRate: 4.4 },
};

const diffCfg = computed(() => DIFF[props.difficulty] || DIFF.medium);

const difficultyLabel = computed(() => {
  if (props.difficulty === 'easy') return '休闲';
  if (props.difficulty === 'hard') return '困难';
  return '标准';
});

const playerLabel = computed(() =>
  String(props.playerName || (props.isGuest ? '游客' : '玩家'))
);
const displayTime = computed(() => formatDuration(elapsedMs.value));

// ── Canvas / 世界 ─────────────────────────────
let ctx   = null;
let rafId = 0;
let viewW = 0, viewH = 0;
let worldW = 0, worldH = 0;
let camX = 0, camY = 0;

// ── 蛇的几何常量 ──────────────────────────────
const HEAD_R   = 10;   // 头部半径（碰撞用）
const BODY_R   = 8;    // 身体半径（渲染用）
const SEG_DIST = 11;   // 节点间距（固定，不随速度变化）

// 自碰检测跳过前 N 个节点（头部附近的身体不参与检测）
const SELF_SKIP = 14;

const WIN_MS = 20 * 60 * 1000;

// ── 蛇状态（角度驱动）────────────────────────
// angle: 当前朝向角（弧度），0 = 向右，顺时针增大
// targetAngle: 玩家期望的目标角
const snake = {
  segs: [],      // [{ x, y }]，segs[0] 是头
  angle: 0,
  targetAngle: 0
};

// ── 食物 ──────────────────────────────────────
const food = { x: 0, y: 0, r: 10 };

// ── 道具 ──────────────────────────────────────
const item = {
  active: false, type: '', x: 0, y: 0, r: 13,
  bornMs: 0, expireMs: 0
};

// ── 状态变量 ──────────────────────────────────
let scoreMultiplier  = 1;
let multiplierUntilMs = 0;
let slowUntilMs      = 0;
let wrapEnabled      = false;
let wrapOffered      = false;
let nextItemSpawnMs  = 0;

let lastTs = 0;
let nowMs  = 0;

// ── 输入状态 ──────────────────────────────────
// 用「触摸点相对蛇头的屏幕方向」来设置 targetAngle
// 而不是追世界坐标点，这样更跟手
let isPointerDown = false;
let touchScreenX  = 0;   // 当前触摸点的屏幕坐标
let touchScreenY  = 0;
let hasTouchTarget = false;
let lastTapMs = 0;
let lastTapX  = 0;
let lastTapY  = 0;

// ── 工具函数 ──────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max)     { return min + Math.random() * (max - min); }
function lerp(a, b, t)      { return a + (b - a) * t; }

// 将角度归一化到 [-π, π]
function normalizeAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 两角之间的最短差值（带符号，[-π, π]）
function angleDiff(from, to) {
  return normalizeAngle(to - from);
}

function setCanvasSize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  viewW = Math.max(1, Math.floor(rect.width));
  viewH = Math.max(1, Math.floor(rect.height));
  canvas.width  = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  worldW = Math.max(viewW * 2.5, 800);
  worldH = Math.max(viewH * 2.5, 1200);
  if (snake.segs.length) {
    const h = snake.segs[0];
    h.x = clamp(h.x, HEAD_R, worldW - HEAD_R);
    h.y = clamp(h.y, HEAD_R, worldH - HEAD_R);
  }
}

function randomFreePosition(radius) {
  for (let k = 0; k < 80; k++) {
    const p = {
      x: rand(radius + 20, worldW - radius - 20),
      y: rand(radius + 20, worldH - radius - 20)
    };
    if (snake.segs.length) {
      const h = snake.segs[0];
      if (Math.hypot(p.x - h.x, p.y - h.y) < 150) continue;
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
  paused.value    = false;
  gameEnded.value = false;
  victory.value   = false;
  score.value     = 0;
  elapsedMs.value = 0;
  boostOn.value   = false;
  scoreMultiplier  = 1;
  multiplierUntilMs = 0;
  slowUntilMs      = 0;
  wrapEnabled      = false;
  wrapOffered      = false;
  item.active      = false;
  item.type        = '';
  nextItemSpawnMs  = 15000;
  lastTs           = 0;
  hasTouchTarget   = false;

  snake.segs  = [];
  snake.angle = 0;  // 初始朝右
  snake.targetAngle = 0;

  const sx = worldW / 2;
  const sy = worldH / 2;
  // 初始 20 节，向右排列
  for (let i = 0; i < 20; i++) {
    snake.segs.push({ x: sx - i * SEG_DIST, y: sy });
  }
  respawnFood();
}

function speedNow() {
  let spd = diffCfg.value.baseSpeed;
  if (boostOn.value)      spd *= 1.7;
  if (nowMs < slowUntilMs) spd *= 0.5;
  return spd;
}

function updateCamera() {
  const h = snake.segs[0];
  camX = clamp(h.x - viewW / 2, 0, Math.max(0, worldW - viewW));
  camY = clamp(h.y - viewH / 2, 0, Math.max(0, worldH - viewH));
}

function growSnake(count = 8) {
  const tail = snake.segs[snake.segs.length - 1];
  for (let i = 0; i < count; i++) {
    snake.segs.push({ x: tail.x, y: tail.y });
  }
}

function spawnItem() {
  if (item.active) return;
  const pool = ['slow', 'multi'];
  if (!wrapEnabled && !wrapOffered) pool.push('pierce');
  const type = pool[Math.floor(Math.random() * pool.length)];
  if (type === 'pierce') wrapOffered = true;
  const p = randomFreePosition(item.r);
  item.active   = true;
  item.type     = type;
  item.x        = p.x;
  item.y        = p.y;
  item.bornMs   = nowMs;
  item.expireMs = nowMs + 10000;
}

function applyItem(type) {
  if (type === 'slow')   { slowUntilMs = nowMs + 5000; return; }
  if (type === 'multi')  { scoreMultiplier = 2; multiplierUntilMs = nowMs + 5000; return; }
  if (type === 'pierce') { wrapEnabled = true; }
}

function handleEatFood() {
  score.value += Math.floor(10 * scoreMultiplier);
  growSnake(10);
  respawnFood();
}

// ── 自碰检测 ──────────────────────────────────
// 跳过前 SELF_SKIP 个节点（头部附近的身体弯曲时不触发）
// 碰撞半径收紧到 0.55，减少误判
function checkSelfCollision() {
  const h = snake.segs[0];
  for (let i = SELF_SKIP; i < snake.segs.length; i++) {
    const p = snake.segs[i];
    if (Math.hypot(h.x - p.x, h.y - p.y) < (HEAD_R + BODY_R) * 0.55) return true;
  }
  return false;
}

function endGame(v) {
  if (gameEnded.value) return;
  gameEnded.value = true;
  victory.value   = Boolean(v);
  leaderboard.value = saveSnakeRecord({
    name:       playerLabel.value,
    score:      score.value,
    durationMs: elapsedMs.value,
    victory:    victory.value,
    difficulty: props.difficulty
  });
}

// ── 核心 update ───────────────────────────────
function update(dt) {
  nowMs = elapsedMs.value;

  if (nowMs >= WIN_MS) {
    elapsedMs.value = WIN_MS;
    endGame(true);
    return;
  }

  // 道具/倍率过期
  if (nowMs >= multiplierUntilMs) scoreMultiplier = 1;
  if (item.active && nowMs >= item.expireMs) { item.active = false; item.type = ''; }
  if (!item.active && nowMs >= nextItemSpawnMs) {
    spawnItem();
    nextItemSpawnMs = nowMs + 15000;
  }

  // ── 转向：角度驱动，每帧最多转 maxTurnRate * dt 弧度 ──
  // 用 angleDiff 取最短路径，彻底避免反向绕圈
  if (hasTouchTarget) {
    const h = snake.segs[0];
    // 把触摸屏幕坐标转成相对蛇头的方向角
    const hScreenX = h.x - camX;
    const hScreenY = h.y - camY;
    const dx = touchScreenX - hScreenX;
    const dy = touchScreenY - hScreenY;
    // 只有触摸点离蛇头足够远才更新目标角（避免手指压在头上时抖动）
    if (Math.hypot(dx, dy) > 12) {
      snake.targetAngle = Math.atan2(dy, dx);
    }
  }

  const maxTurn = diffCfg.value.maxTurnRate * dt;
  const diff    = angleDiff(snake.angle, snake.targetAngle);
  // 限制每帧转角
  const turn    = clamp(diff, -maxTurn, maxTurn);
  snake.angle   = normalizeAngle(snake.angle + turn);

  const spd = speedNow();
  const dx  = Math.cos(snake.angle) * spd * dt;
  const dy  = Math.sin(snake.angle) * spd * dt;

  const h = snake.segs[0];
  h.x += dx;
  h.y += dy;

  // 边界处理
  if (wrapEnabled) {
    let ox = 0, oy = 0;
    if (h.x < 0)       ox =  worldW;
    if (h.x > worldW)  ox = -worldW;
    if (h.y < 0)       oy =  worldH;
    if (h.y > worldH)  oy = -worldH;
    if (ox || oy) {
      for (const s of snake.segs) { s.x += ox; s.y += oy; }
    }
  } else {
    if (h.x < HEAD_R || h.x > worldW - HEAD_R ||
        h.y < HEAD_R || h.y > worldH - HEAD_R) {
      endGame(false);
      return;
    }
  }

  // ── 身体链式跟随（固定间距，不拉伸）────────
  for (let i = 1; i < snake.segs.length; i++) {
    const prev = snake.segs[i - 1];
    const cur  = snake.segs[i];
    const ddx  = cur.x - prev.x;
    const ddy  = cur.y - prev.y;
    const d    = Math.hypot(ddx, ddy);
    if (d > SEG_DIST) {
      const ratio = SEG_DIST / d;
      cur.x = prev.x + ddx * ratio;
      cur.y = prev.y + ddy * ratio;
    }
  }

  // 吃食物
  if (Math.hypot(h.x - food.x, h.y - food.y) <= HEAD_R + food.r) {
    handleEatFood();
  }

  // 吃道具
  if (item.active && Math.hypot(h.x - item.x, h.y - item.y) <= HEAD_R + item.r) {
    const t = item.type;
    item.active = false;
    item.type   = '';
    applyItem(t);
  }

  // 自碰
  if (checkSelfCollision()) {
    endGame(false);
  }
}

// ── 渲染 ──────────────────────────────────────
function drawCircle(x, y, r, fillStyle, strokeStyle = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.lineWidth   = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function drawWalls() {
  if (wrapEnabled) return;
  ctx.strokeStyle = 'rgba(79,172,254,0.22)';
  ctx.lineWidth   = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.rect(-camX, -camY, worldW, worldH);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 绘制网格（给玩家空间感）
function drawGrid() {
  const step = 80;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 1;
  const startX = Math.floor(camX / step) * step;
  const startY = Math.floor(camY / step) * step;
  ctx.beginPath();
  for (let x = startX; x < camX + viewW + step; x += step) {
    ctx.moveTo(x - camX, 0);
    ctx.lineTo(x - camX, viewH);
  }
  for (let y = startY; y < camY + viewH + step; y += step) {
    ctx.moveTo(0, y - camY);
    ctx.lineTo(viewW, y - camY);
  }
  ctx.stroke();
}

function drawFood() {
  const fx = food.x - camX;
  const fy = food.y - camY;
  // 发光效果
  const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, food.r * 2.2);
  grd.addColorStop(0,   'rgba(0,242,254,0.55)');
  grd.addColorStop(1,   'rgba(0,242,254,0)');
  ctx.beginPath();
  ctx.arc(fx, fy, food.r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  drawCircle(fx, fy, food.r, '#00f2fe', 'rgba(255,255,255,0.5)', 2);
}

function drawItem() {
  if (!item.active) return;
  const ix = item.x - camX;
  const iy = item.y - camY;
  const label = item.type === 'slow' ? '缓' : item.type === 'multi' ? '倍' : '穿';
  const color = item.type === 'slow' ? '#2ed573' : item.type === 'multi' ? '#ffd32a' : '#ffa502';

  // 脉冲光晕
  const pulse = 0.7 + 0.3 * Math.sin(nowMs / 300);
  const grd = ctx.createRadialGradient(ix, iy, 0, ix, iy, item.r * 2.5 * pulse);
  grd.addColorStop(0, color.replace(')', ',0.4)').replace('rgb', 'rgba'));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(ix, iy, item.r * 2.5 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  drawCircle(ix, iy, item.r, color, 'rgba(0,0,0,0.3)', 3);
  ctx.fillStyle    = '#0b0f14';
  ctx.font         = '900 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, ix, iy + 1);
  ctx.textAlign    = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawSnake() {
  const n = snake.segs.length;
  if (n === 0) return;

  // 身体（从尾到头，头覆盖在最上层）
  for (let i = n - 1; i >= 1; i--) {
    const p = snake.segs[i];
    const t = i / n;
    // 尾部渐细
    const r = lerp(BODY_R * 0.6, BODY_R, Math.min(1, (n - i) / 12));
    // 颜色：头部亮蓝，尾部深蓝
    const alpha = lerp(0.55, 0.9, 1 - t);
    drawCircle(p.x - camX, p.y - camY, r, `rgba(79,172,254,${alpha.toFixed(2)})`);
  }

  // 头部
  const h = snake.segs[0];
  const hx = h.x - camX;
  const hy = h.y - camY;

  // 头部光晕
  const hGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, HEAD_R * 2);
  hGrd.addColorStop(0, 'rgba(79,172,254,0.35)');
  hGrd.addColorStop(1, 'rgba(79,172,254,0)');
  ctx.beginPath();
  ctx.arc(hx, hy, HEAD_R * 2, 0, Math.PI * 2);
  ctx.fillStyle = hGrd;
  ctx.fill();

  drawCircle(hx, hy, HEAD_R, '#4facfe', 'rgba(255,255,255,0.45)', 2.5);

  // 眼睛（跟随朝向角）
  const eyeOffset = 5;
  const eyeR      = 2.5;
  const perpX = -Math.sin(snake.angle);
  const perpY =  Math.cos(snake.angle);
  const fwdX  =  Math.cos(snake.angle) * 4;
  const fwdY  =  Math.sin(snake.angle) * 4;
  drawCircle(hx + fwdX + perpX * eyeOffset, hy + fwdY + perpY * eyeOffset, eyeR, '#fff');
  drawCircle(hx + fwdX - perpX * eyeOffset, hy + fwdY - perpY * eyeOffset, eyeR, '#fff');
  drawCircle(hx + fwdX + perpX * eyeOffset + Math.cos(snake.angle), hy + fwdY + perpY * eyeOffset + Math.sin(snake.angle), 1.3, '#1a1a2e');
  drawCircle(hx + fwdX - perpX * eyeOffset + Math.cos(snake.angle), hy + fwdY - perpY * eyeOffset + Math.sin(snake.angle), 1.3, '#1a1a2e');
}

// 兼容性圆角矩形（Safari 15 以下不支持 roundRect）
function fillRoundRect(x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function drawHud() {
  const safeTop = Number(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--safe-area-top').replace('px', '')
  ) || 0;
  const padTop  = 12 + safeTop;
  const padSide = 12;

  // 左侧：分数 + 时间
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  fillRoundRect(padSide, padTop, 160, 64, 10);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font      = '700 16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`分数  ${score.value}`,       padSide + 12, padTop + 24);
  ctx.fillText(`时间  ${displayTime.value}`, padSide + 12, padTop + 48);

  // 右侧：难度 + 状态
  const rw = 130;
  const rx = viewW - padSide - rw;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  fillRoundRect(rx, padTop, rw, 64, 10);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font      = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(difficultyLabel.value, rx + 12, padTop + 24);

  const effects = [];
  if (boostOn.value)             effects.push('⚡加速');
  if (nowMs < slowUntilMs)       effects.push('🐢缓速');
  if (nowMs < multiplierUntilMs) effects.push('✨倍分');
  if (wrapEnabled)               effects.push('🌀穿墙');
  ctx.fillStyle = '#4facfe';
  ctx.font      = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(effects.join(' '), rx + 12, padTop + 48);

  // 进度条（距离胜利）
  const barW = viewW - padSide * 2;
  const barH = 4;
  const barY = padTop + 72;
  const prog = Math.min(1, elapsedMs.value / WIN_MS);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  fillRoundRect(padSide, barY, barW, barH, 2);
  ctx.fillStyle = '#4facfe';
  fillRoundRect(padSide, barY, barW * prog, barH, 2);
}

function render() {
  if (!ctx) return;
  updateCamera();
  ctx.clearRect(0, 0, viewW, viewH);

  // 背景
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, viewW, viewH);

  drawGrid();
  drawWalls();
  drawFood();
  drawItem();
  drawSnake();
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

// ── 输入处理 ──────────────────────────────────
// 核心改变：记录触摸的「屏幕坐标」，在 update() 里
// 实时计算相对蛇头的方向角，而不是追世界坐标点
// 这样手指移动时方向立刻响应，不会有追点的延迟感

function getScreenXY(e) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (viewW / rect.width),
    y: (e.clientY - rect.top)  * (viewH / rect.height)
  };
}

function handlePointerDown(e) {
  if (!canvasRef.value) return;
  canvasRef.value.setPointerCapture?.(e.pointerId);
  isPointerDown = true;

  const { x, y } = getScreenXY(e);
  touchScreenX   = x;
  touchScreenY   = y;
  hasTouchTarget = true;

  // 双击检测（同一区域 280ms 内两次点击 → 切换加速）
  const now = performance.now();
  const near = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 50;
  if (now - lastTapMs < 280 && near) {
    boostOn.value = !boostOn.value;
    lastTapMs = 0;
  } else {
    lastTapMs = now;
    lastTapX  = e.clientX;
    lastTapY  = e.clientY;
  }
}

function handlePointerMove(e) {
  if (!isPointerDown) return;
  const { x, y } = getScreenXY(e);
  touchScreenX   = x;
  touchScreenY   = y;
  hasTouchTarget = true;
}

function handlePointerUp() {
  isPointerDown = false;
  // 松手后保持最后方向，不清除 hasTouchTarget
  // 这样蛇会继续朝最后指向的方向走
}

function togglePause() {
  if (gameEnded.value) return;
  paused.value = !paused.value;
}

function resume() {
  paused.value = false;
  lastTs = 0; // 防止暂停后 dt 过大
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

