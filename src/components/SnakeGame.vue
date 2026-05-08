<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { loadSnakeLeaderboard, saveSnakeRecord, formatDuration } from '../utils/snakeLeaderboard';

const props = defineProps({
  playerName: { type: String, default: '' },
  isGuest:    { type: Boolean, default: false },
  difficulty: { type: String, default: 'medium' }
});

const emit = defineEmits(['backToHub']);

const canvasRef   = ref(null);
const paused      = ref(false);
const gameEnded   = ref(false);
const victory     = ref(false);
const score       = ref(0);
const elapsedMs   = ref(0);
const leaderboard = ref([]);
const boostOn     = ref(false);
// 连击
const combo       = ref(0);
// 护盾激活状态（给 template 用）
const shieldActive = ref(false);

// ── 难度参数 ──────────────────────────────────
const DIFF = {
  easy:   { baseSpeed: 130, maxTurnRate: 3.0 },
  medium: { baseSpeed: 175, maxTurnRate: 3.6 },
  hard:   { baseSpeed: 250, maxTurnRate: 4.2 },
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
const HEAD_R   = 10;
const BODY_R   = 8;
const SEG_DIST = 11;
const SELF_SKIP = 14;
const WIN_MS = 20 * 60 * 1000;

// ── 蛇状态 ────────────────────────────────────
const snake = { segs: [], angle: 0, targetAngle: 0 };

// ── 食物（随机颜色）──────────────────────────
const FOOD_COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997'];
const food = { x: 0, y: 0, r: 10, color: '#ff6b6b', angle: 0 };

// ── 道具系统（7种）───────────────────────────
// slow: 缓速  multi: 倍分  pierce: 穿墙
// boost: 加速  magnet: 磁铁  scissors: 剪刀  shield: 护盾  ghost: 幽灵
const ITEM_CFG = {
  slow:     { label: '🐢', color: '#2ed573', desc: '缓速5s' },
  multi:    { label: '✨', color: '#ffd32a', desc: '倍分5s' },
  pierce:   { label: '🌀', color: '#ffa502', desc: '穿墙' },
  boost:    { label: '⚡', color: '#74b9ff', desc: '加速5s' },
  magnet:   { label: '🧲', color: '#fd79a8', desc: '磁铁8s' },
  scissors: { label: '✂️', color: '#a29bfe', desc: '缩短身体' },
  shield:   { label: '🛡️', color: '#55efc4', desc: '护盾一次' },
  ghost:    { label: '👻', color: '#dfe6e9', desc: '穿身6s' },
};

const item = { active: false, type: '', x: 0, y: 0, r: 15, bornMs: 0, expireMs: 0 };

// ── 状态变量 ──────────────────────────────────
let scoreMultiplier   = 1;
let multiplierUntilMs = 0;
let slowUntilMs       = 0;
let boostUntilMs      = 0;
let magnetUntilMs     = 0;
let ghostUntilMs      = 0;
let hasShield         = false;
let wrapEnabled       = false;
let wrapOffered       = false;
let nextItemSpawnMs   = 0;
let lastEatMs         = 0;
let comboCount        = 0;
let maxCombo          = 0;
let maxLength         = 0;

// ── 连击弹出动画 ──────────────────────────────
const comboPopups = []; // { text, x, y, alpha, vy, bornMs }

// ── 星空粒子 ──────────────────────────────────
const STAR_COUNT = 80;
const stars = []; // { x, y, r, alpha, vx, vy, twinkle }

// ── 输入状态 ──────────────────────────────────
let isPointerDown  = false;
let touchScreenX   = 0;
let touchScreenY   = 0;
let hasTouchTarget = false;
let lastTapMs      = 0;
let lastTapX       = 0;
let lastTapY       = 0;
let lastTs         = 0;
let nowMs          = 0;

// 加速按钮（右下角）
let boostBtnDown = false;

// ── 工具函数 ──────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max)     { return min + Math.random() * (max - min); }
function lerp(a, b, t)      { return a + (b - a) * t; }
function normalizeAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function angleDiff(from, to) { return normalizeAngle(to - from); }

// ── 星空初始化 ────────────────────────────────
function initStars() {
  stars.length = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: rand(0, worldW), y: rand(0, worldH),
      r: rand(0.5, 2.5),
      alpha: rand(0.2, 0.9),
      vx: rand(-4, 4), vy: rand(-4, 4),
      twinkle: rand(0, Math.PI * 2)
    });
  }
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
    const p = { x: rand(radius + 20, worldW - radius - 20), y: rand(radius + 20, worldH - radius - 20) };
    if (snake.segs.length && Math.hypot(p.x - snake.segs[0].x, p.y - snake.segs[0].y) < 150) continue;
    return p;
  }
  return { x: worldW / 2, y: worldH / 2 };
}

function respawnFood() {
  const p = randomFreePosition(food.r);
  food.x = p.x; food.y = p.y;
  food.color = FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];
  food.angle = 0;
}

function resetGame() {
  paused.value      = false;
  gameEnded.value   = false;
  victory.value     = false;
  score.value       = 0;
  elapsedMs.value   = 0;
  boostOn.value     = false;
  combo.value       = 0;
  shieldActive.value = false;
  scoreMultiplier   = 1;
  multiplierUntilMs = 0;
  slowUntilMs       = 0;
  boostUntilMs      = 0;
  magnetUntilMs     = 0;
  ghostUntilMs      = 0;
  hasShield         = false;
  wrapEnabled       = false;
  wrapOffered       = false;
  item.active       = false;
  item.type         = '';
  nextItemSpawnMs   = 12000;
  lastEatMs         = 0;
  comboCount        = 0;
  maxCombo          = 0;
  maxLength         = 5;
  lastTs            = 0;
  hasTouchTarget    = false;
  boostBtnDown      = false;
  comboPopups.length = 0;

  snake.segs  = [];
  snake.angle = 0;
  snake.targetAngle = 0;

  const sx = worldW / 2, sy = worldH / 2;
  // 初始 5 节
  for (let i = 0; i < 5; i++) {
    snake.segs.push({ x: sx - i * SEG_DIST, y: sy });
  }
  initStars();
  respawnFood();
}

function speedNow() {
  let spd = diffCfg.value.baseSpeed;
  if (boostOn.value || nowMs < boostUntilMs) spd *= 1.65;
  if (nowMs < slowUntilMs) spd *= 0.5;
  return spd;
}

function updateCamera() {
  const h = snake.segs[0];
  camX = clamp(h.x - viewW / 2, 0, Math.max(0, worldW - viewW));
  camY = clamp(h.y - viewH / 2, 0, Math.max(0, worldH - viewH));
}

function growSnake(count = 1) {
  const tail = snake.segs[snake.segs.length - 1];
  for (let i = 0; i < count; i++) snake.segs.push({ x: tail.x, y: tail.y });
  if (snake.segs.length > maxLength) maxLength = snake.segs.length;
}

function spawnItem() {
  if (item.active) return;
  const pool = ['slow', 'multi', 'boost', 'magnet', 'scissors', 'shield', 'ghost'];
  if (!wrapEnabled && !wrapOffered) pool.push('pierce');
  const type = pool[Math.floor(Math.random() * pool.length)];
  if (type === 'pierce') wrapOffered = true;
  const p = randomFreePosition(item.r);
  Object.assign(item, { active: true, type, x: p.x, y: p.y, bornMs: nowMs, expireMs: nowMs + 10000 });
}

function applyItem(type) {
  if (type === 'slow')     { slowUntilMs = nowMs + 5000; return; }
  if (type === 'multi')    { scoreMultiplier = 2; multiplierUntilMs = nowMs + 5000; return; }
  if (type === 'pierce')   { wrapEnabled = true; return; }
  if (type === 'boost')    { boostUntilMs = nowMs + 5000; return; }
  if (type === 'magnet')   { magnetUntilMs = nowMs + 8000; return; }
  if (type === 'ghost')    { ghostUntilMs = nowMs + 6000; return; }
  if (type === 'shield')   { hasShield = true; shieldActive.value = true; return; }
  if (type === 'scissors') {
    // 缩短身体一半，最少保留 5 节
    const half = Math.max(5, Math.floor(snake.segs.length / 2));
    snake.segs.splice(half);
    return;
  }
}

function addComboPopup(text) {
  const h = snake.segs[0];
  comboPopups.push({
    text, x: h.x, y: h.y - 20,
    alpha: 1, vy: -60, bornMs: nowMs
  });
}

function handleEatFood() {
  // 连击判断
  const gap = nowMs - lastEatMs;
  if (lastEatMs > 0 && gap < 3000) {
    comboCount++;
    if (comboCount > maxCombo) maxCombo = comboCount;
  } else {
    comboCount = 1;
  }
  combo.value = comboCount;
  lastEatMs = nowMs;

  const comboMul = Math.min(comboCount, 5);
  const gain = Math.floor(10 * scoreMultiplier * comboMul);
  score.value += gain;

  if (comboCount >= 2) addComboPopup(`x${comboCount} 连击！+${gain}`);

  growSnake(1); // 每次只长 1 节
  respawnFood();
}

function checkSelfCollision() {
  if (nowMs < ghostUntilMs) return false; // 幽灵状态穿身
  const h = snake.segs[0];
  for (let i = SELF_SKIP; i < snake.segs.length; i++) {
    if (Math.hypot(h.x - snake.segs[i].x, h.y - snake.segs[i].y) < (HEAD_R + BODY_R) * 0.55) return true;
  }
  return false;
}

function endGame(v) {
  if (gameEnded.value) return;
  gameEnded.value = true;
  victory.value   = Boolean(v);
  leaderboard.value = saveSnakeRecord({
    name: playerLabel.value, score: score.value,
    durationMs: elapsedMs.value, victory: victory.value, difficulty: props.difficulty
  });
}

// ── 核心 update ───────────────────────────────
function update(dt) {
  nowMs = elapsedMs.value;

  if (nowMs >= WIN_MS) { elapsedMs.value = WIN_MS; endGame(true); return; }

  // 过期处理
  if (nowMs >= multiplierUntilMs) scoreMultiplier = 1;
  if (item.active && nowMs >= item.expireMs) { item.active = false; item.type = ''; }
  if (!item.active && nowMs >= nextItemSpawnMs) { spawnItem(); nextItemSpawnMs = nowMs + 12000; }

  // 食物旋转动画
  food.angle += dt * 1.5;

  // 更新星星
  for (const s of stars) {
    s.twinkle += dt * 1.2;
    s.x += s.vx * dt * 0.3;
    s.y += s.vy * dt * 0.3;
    if (s.x < 0) s.x += worldW;
    if (s.x > worldW) s.x -= worldW;
    if (s.y < 0) s.y += worldH;
    if (s.y > worldH) s.y -= worldH;
  }

  // 更新连击弹出
  for (let i = comboPopups.length - 1; i >= 0; i--) {
    const p = comboPopups[i];
    p.y += p.vy * dt;
    p.alpha -= dt * 1.2;
    if (p.alpha <= 0) comboPopups.splice(i, 1);
  }

  // 磁铁：食物向蛇头靠近
  if (nowMs < magnetUntilMs) {
    const h = snake.segs[0];
    const dx = h.x - food.x, dy = h.y - food.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) { food.x += (dx / d) * 120 * dt; food.y += (dy / d) * 120 * dt; }
  }

  // 转向
  if (hasTouchTarget) {
    const h = snake.segs[0];
    const dx = touchScreenX - (h.x - camX);
    const dy = touchScreenY - (h.y - camY);
    if (Math.hypot(dx, dy) > 12) snake.targetAngle = Math.atan2(dy, dx);
  }

  const maxTurn = diffCfg.value.maxTurnRate * dt;
  const diff    = angleDiff(snake.angle, snake.targetAngle);
  snake.angle   = normalizeAngle(snake.angle + clamp(diff, -maxTurn, maxTurn));

  const spd = speedNow();
  const h   = snake.segs[0];
  h.x += Math.cos(snake.angle) * spd * dt;
  h.y += Math.sin(snake.angle) * spd * dt;

  // 边界
  if (wrapEnabled) {
    let ox = 0, oy = 0;
    if (h.x < 0) ox = worldW; if (h.x > worldW) ox = -worldW;
    if (h.y < 0) oy = worldH; if (h.y > worldH) oy = -worldH;
    if (ox || oy) for (const s of snake.segs) { s.x += ox; s.y += oy; }
  } else {
    if (h.x < HEAD_R || h.x > worldW - HEAD_R || h.y < HEAD_R || h.y > worldH - HEAD_R) {
      if (hasShield) { hasShield = false; shieldActive.value = false; }
      else { endGame(false); return; }
    }
  }

  // 链式跟随
  for (let i = 1; i < snake.segs.length; i++) {
    const prev = snake.segs[i - 1], cur = snake.segs[i];
    const ddx = cur.x - prev.x, ddy = cur.y - prev.y;
    const d = Math.hypot(ddx, ddy);
    if (d > SEG_DIST) { cur.x = prev.x + ddx * (SEG_DIST / d); cur.y = prev.y + ddy * (SEG_DIST / d); }
  }

  // 吃食物
  if (Math.hypot(h.x - food.x, h.y - food.y) <= HEAD_R + food.r) handleEatFood();

  // 吃道具
  if (item.active && Math.hypot(h.x - item.x, h.y - item.y) <= HEAD_R + item.r) {
    const t = item.type; item.active = false; item.type = ''; applyItem(t);
  }

  // 自碰
  if (checkSelfCollision()) {
    if (hasShield) { hasShield = false; shieldActive.value = false; }
    else endGame(false);
  }
}

// ── 渲染 ──────────────────────────────────────
function drawCircle(x, y, r, fillStyle, strokeStyle = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) { ctx.lineWidth = lineWidth; ctx.strokeStyle = strokeStyle; ctx.stroke(); }
}

function fillRoundRect(x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  else ctx.fillRect(x, y, w, h);
}

// 星空背景
function drawBackground() {
  // 深色渐变背景
  const bg = ctx.createLinearGradient(0, 0, viewW, viewH);
  bg.addColorStop(0, '#060a14');
  bg.addColorStop(1, '#0d1a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, viewW, viewH);

  // 星星
  for (const s of stars) {
    const sx = s.x - camX, sy = s.y - camY;
    if (sx < -5 || sx > viewW + 5 || sy < -5 || sy > viewH + 5) continue;
    const tw = 0.5 + 0.5 * Math.sin(s.twinkle);
    ctx.globalAlpha = s.alpha * tw;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 彩色光墙
function drawWalls() {
  if (wrapEnabled) return;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 800);
  const colors = ['#4facfe', '#f093fb', '#4facfe', '#00f2fe'];
  const sides = [
    [0 - camX, 0 - camY, worldW, 0 - camY],
    [worldW - camX, 0 - camY, worldW - camX, worldH - camY],
    [0 - camX, worldH - camY, worldW - camX, worldH - camY],
    [0 - camX, 0 - camY, 0 - camX, worldH - camY],
  ];
  sides.forEach(([x1, y1, x2, y2], i) => {
    const grd = ctx.createLinearGradient(x1, y1, x2, y2);
    grd.addColorStop(0, colors[i]);
    grd.addColorStop(1, colors[(i + 1) % 4]);
    ctx.strokeStyle = grd;
    ctx.lineWidth   = 3 + pulse * 2;
    ctx.shadowColor = colors[i];
    ctx.shadowBlur  = 12 * pulse;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.shadowBlur = 0;
}

// 网格
function drawGrid() {
  const step = 80;
  ctx.strokeStyle = 'rgba(79,172,254,0.05)';
  ctx.lineWidth   = 1;
  const sx = Math.floor(camX / step) * step;
  const sy = Math.floor(camY / step) * step;
  ctx.beginPath();
  for (let x = sx; x < camX + viewW + step; x += step) { ctx.moveTo(x - camX, 0); ctx.lineTo(x - camX, viewH); }
  for (let y = sy; y < camY + viewH + step; y += step) { ctx.moveTo(0, y - camY); ctx.lineTo(viewW, y - camY); }
  ctx.stroke();
}

// 食物（旋转多边形）
function drawFood() {
  const fx = food.x - camX, fy = food.y - camY;
  // 外发光
  const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, food.r * 2.8);
  grd.addColorStop(0, food.color + 'aa');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(fx, fy, food.r * 2.8, 0, Math.PI * 2);
  ctx.fillStyle = grd; ctx.fill();

  // 旋转六边形
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(food.angle);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    i === 0 ? ctx.moveTo(Math.cos(a) * food.r, Math.sin(a) * food.r)
            : ctx.lineTo(Math.cos(a) * food.r, Math.sin(a) * food.r);
  }
  ctx.closePath();
  ctx.fillStyle = food.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// 道具
function drawItem() {
  if (!item.active) return;
  const ix = item.x - camX, iy = item.y - camY;
  const cfg = ITEM_CFG[item.type] || { label: '?', color: '#fff' };
  const pulse = 0.7 + 0.3 * Math.sin(nowMs / 280);

  // 光晕
  const grd = ctx.createRadialGradient(ix, iy, 0, ix, iy, item.r * 2.8 * pulse);
  grd.addColorStop(0, cfg.color + '66');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(ix, iy, item.r * 2.8 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = grd; ctx.fill();

  // 圆形底
  drawCircle(ix, iy, item.r, cfg.color, 'rgba(255,255,255,0.3)', 2);

  // 图标
  ctx.font = `${item.r * 1.3}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cfg.label, ix, iy + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

  // 倒计时弧
  const remain = (item.expireMs - nowMs) / 10000;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ix, iy, item.r + 4, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
  ctx.stroke();
}

// 蛇（彩虹渐变）
function drawSnake() {
  const n = snake.segs.length;
  if (n === 0) return;
  const isGhost = nowMs < ghostUntilMs;

  for (let i = n - 1; i >= 1; i--) {
    const p = snake.segs[i];
    const t = i / n;
    const r = lerp(BODY_R * 0.55, BODY_R, Math.min(1, (n - i) / 10));
    // 彩虹色：hue 随位置变化
    const hue = (t * 280 + nowMs * 0.05) % 360;
    const alpha = isGhost ? 0.35 : lerp(0.5, 0.92, 1 - t);
    ctx.globalAlpha = alpha;
    drawCircle(p.x - camX, p.y - camY, r, `hsl(${hue},90%,60%)`);
  }
  ctx.globalAlpha = 1;

  const h = snake.segs[0];
  const hx = h.x - camX, hy = h.y - camY;

  // 护盾光环
  if (hasShield) {
    const sp = 0.6 + 0.4 * Math.sin(nowMs / 200);
    ctx.strokeStyle = `rgba(85,239,196,${sp})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#55efc4';
    ctx.shadowBlur  = 15;
    ctx.beginPath(); ctx.arc(hx, hy, HEAD_R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 幽灵效果
  ctx.globalAlpha = isGhost ? 0.5 : 1;

  // 头部光晕
  const hGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, HEAD_R * 2.2);
  hGrd.addColorStop(0, 'rgba(79,172,254,0.4)');
  hGrd.addColorStop(1, 'rgba(79,172,254,0)');
  ctx.beginPath(); ctx.arc(hx, hy, HEAD_R * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = hGrd; ctx.fill();

  drawCircle(hx, hy, HEAD_R, '#4facfe', 'rgba(255,255,255,0.5)', 2.5);

  // 眼睛
  const perpX = -Math.sin(snake.angle), perpY = Math.cos(snake.angle);
  const fwdX  =  Math.cos(snake.angle) * 4,  fwdY = Math.sin(snake.angle) * 4;
  drawCircle(hx + fwdX + perpX * 5, hy + fwdY + perpY * 5, 2.5, '#fff');
  drawCircle(hx + fwdX - perpX * 5, hy + fwdY - perpY * 5, 2.5, '#fff');
  drawCircle(hx + fwdX + perpX * 5 + Math.cos(snake.angle), hy + fwdY + perpY * 5 + Math.sin(snake.angle), 1.3, '#1a1a2e');
  drawCircle(hx + fwdX - perpX * 5 + Math.cos(snake.angle), hy + fwdY - perpY * 5 + Math.sin(snake.angle), 1.3, '#1a1a2e');

  ctx.globalAlpha = 1;
}

// 连击弹出
function drawComboPopups() {
  for (const p of comboPopups) {
    const px = p.x - camX, py = p.y - camY;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = '#ffd32a';
    ctx.font        = 'bold 18px -apple-system, sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, px, py);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// HUD
function drawHud() {
  const safeTop = Number(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top').replace('px', '')) || 0;
  const pt = 12 + safeTop, ps = 12;

  // 左：分数 + 时间
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  fillRoundRect(ps, pt, 170, 68, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '700 16px -apple-system, sans-serif';
  ctx.fillText(`分数  ${score.value}`, ps + 12, pt + 24);
  ctx.fillText(`时间  ${displayTime.value}`, ps + 12, pt + 48);

  // 右：难度 + 连击
  const rw = 130, rx = viewW - ps - rw;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  fillRoundRect(rx, pt, rw, 68, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 14px -apple-system, sans-serif';
  ctx.fillText(difficultyLabel.value, rx + 12, pt + 24);
  if (combo.value >= 2) {
    ctx.fillStyle = '#ffd32a';
    ctx.font = '700 14px -apple-system, sans-serif';
    ctx.fillText(`🔥 x${combo.value} 连击`, rx + 12, pt + 48);
  }

  // 激活道具图标行
  const activeItems = [];
  if (nowMs < slowUntilMs)       activeItems.push({ label: '🐢', until: slowUntilMs });
  if (nowMs < multiplierUntilMs) activeItems.push({ label: '✨', until: multiplierUntilMs });
  if (nowMs < boostUntilMs)      activeItems.push({ label: '⚡', until: boostUntilMs });
  if (nowMs < magnetUntilMs)     activeItems.push({ label: '🧲', until: magnetUntilMs });
  if (nowMs < ghostUntilMs)      activeItems.push({ label: '👻', until: ghostUntilMs });
  if (wrapEnabled)               activeItems.push({ label: '🌀', until: Infinity });
  if (hasShield)                 activeItems.push({ label: '🛡️', until: Infinity });

  if (activeItems.length > 0) {
    const iconY = pt + 80;
    activeItems.forEach((ai, idx) => {
      const ix = ps + idx * 44;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      fillRoundRect(ix, iconY, 38, 38, 8);
      ctx.font = '20px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ai.label, ix + 19, iconY + 19);
      // 倒计时弧
      if (ai.until !== Infinity) {
        const remain = Math.max(0, (ai.until - nowMs) / 8000);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix + 19, iconY + 19, 17, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  // 进度条
  const barW = viewW - ps * 2, barH = 4;
  const barY = pt + (activeItems.length > 0 ? 126 : 76);
  const prog = Math.min(1, elapsedMs.value / WIN_MS);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  fillRoundRect(ps, barY, barW, barH, 2);
  const barGrd = ctx.createLinearGradient(ps, 0, ps + barW * prog, 0);
  barGrd.addColorStop(0, '#4facfe');
  barGrd.addColorStop(1, '#f093fb');
  ctx.fillStyle = barGrd;
  fillRoundRect(ps, barY, barW * prog, barH, 2);
}

// 加速按钮（右下角）
function drawBoostBtn() {
  const bx = viewW - 70, by = viewH - 70;
  const isActive = boostOn.value || nowMs < boostUntilMs;
  ctx.fillStyle = isActive ? 'rgba(116,185,255,0.5)' : 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(bx, by, 28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isActive ? '#74b9ff' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by, 28, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '22px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('⚡', bx, by + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

function render() {
  if (!ctx) return;
  updateCamera();
  ctx.clearRect(0, 0, viewW, viewH);
  drawBackground();
  drawGrid();
  drawWalls();
  drawFood();
  drawItem();
  drawSnake();
  drawComboPopups();
  drawHud();
  drawBoostBtn();
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  if (!paused.value && !gameEnded.value) { elapsedMs.value += dt * 1000; update(dt); }
  else nowMs = elapsedMs.value;
  render();
  rafId = requestAnimationFrame(tick);
}

function getScreenXY(e) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (viewW / rect.width),
    y: (e.clientY - rect.top)  * (viewH / rect.height)
  };
}

// 判断是否点击了加速按钮区域
function isBoostBtnHit(sx, sy) {
  const bx = viewW - 70, by = viewH - 70;
  return Math.hypot(sx - bx, sy - by) <= 32;
}

function handlePointerDown(e) {
  if (!canvasRef.value) return;
  canvasRef.value.setPointerCapture?.(e.pointerId);
  const { x, y } = getScreenXY(e);

  // 加速按钮
  if (isBoostBtnHit(x, y)) { boostBtnDown = true; boostOn.value = true; return; }

  isPointerDown  = true;
  touchScreenX   = x;
  touchScreenY   = y;
  hasTouchTarget = true;

  // 双击切换手动加速
  const now = performance.now();
  const near = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 50;
  if (now - lastTapMs < 280 && near) { boostOn.value = !boostOn.value; lastTapMs = 0; }
  else { lastTapMs = now; lastTapX = e.clientX; lastTapY = e.clientY; }
}

function handlePointerMove(e) {
  if (boostBtnDown) return;
  if (!isPointerDown) return;
  const { x, y } = getScreenXY(e);
  touchScreenX = x; touchScreenY = y; hasTouchTarget = true;
}

function handlePointerUp(e) {
  if (boostBtnDown) { boostBtnDown = false; boostOn.value = false; return; }
  isPointerDown = false;
}

function togglePause() {
  if (gameEnded.value) return;
  paused.value = !paused.value;
}

function resume() { paused.value = false; lastTs = 0; }
function restart() { resetGame(); }

function backToHub() {
  if (!window.confirm('确认返回游戏中心？进度不会保存。')) return;
  emit('backToHub');
}

watch(gameEnded, (v) => { if (v) paused.value = true; });

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
    ></canvas>

    <div class="top-ui">
      <button class="ui-btn left" @click="backToHub">←</button>
      <button class="ui-btn right" @click="togglePause">⏸</button>
    </div>

    <div v-if="paused" class="overlay" @click="gameEnded ? null : resume()">
      <div class="panel" @click.stop>
        <div v-if="gameEnded" class="result">
          <div class="result-title">{{ victory ? '🎉 胜利！' : '💀 游戏结束' }}</div>
          <div class="result-grid">
            <div class="stat-item"><div class="stat-val">{{ score }}</div><div class="stat-lbl">分数</div></div>
            <div class="stat-item"><div class="stat-val">{{ displayTime }}</div><div class="stat-lbl">时间</div></div>
            <div class="stat-item"><div class="stat-val">{{ maxLength }}</div><div class="stat-lbl">最长身体</div></div>
            <div class="stat-item"><div class="stat-val">{{ maxCombo }}</div><div class="stat-lbl">最高连击</div></div>
          </div>
          <div class="result-sub">难度：{{ difficultyLabel }}</div>
        </div>
        <div v-else class="result">
          <div class="result-title">⏸ 已暂停</div>
          <div class="result-sub">当前分数：{{ score }} · 时间：{{ displayTime }}</div>
        </div>

        <div class="btns">
          <button v-if="!gameEnded" class="btn primary" @click="resume">继续游戏</button>
          <button class="btn ghost" @click="restart">重新开始</button>
          <button class="btn ghost" @click="backToHub">返回大厅</button>
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
  width: 100%; height: 100%;
  background: #060a14;
  position: relative; overflow: hidden;
}
.game-canvas {
  width: 100%; height: 100%;
  display: block; touch-action: none;
}
.top-ui {
  position: absolute;
  top: calc(12px + var(--safe-area-top, 0px));
  left: 0; right: 0;
  pointer-events: none; z-index: 10;
}
.ui-btn {
  pointer-events: auto;
  position: absolute;
  width: 44px; height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.4);
  color: rgba(255,255,255,0.92);
  font-size: 18px; cursor: pointer;
  backdrop-filter: blur(8px);
}
.ui-btn.left  { left: 12px; }
.ui-btn.right { right: 12px; }

.overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 20; padding: 16px;
}
.panel {
  width: min(520px, 94vw);
  max-height: 86vh; overflow-y: auto;
  background: rgba(10,18,35,0.95);
  border: 1px solid rgba(79,172,254,0.25);
  border-radius: 20px; padding: 18px 16px;
}
.result { color: rgba(255,255,255,0.92); }
.result-title {
  font-size: 1.6rem; font-weight: 900;
  margin-bottom: 12px;
  background: linear-gradient(135deg,#4facfe,#f093fb);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.result-sub { opacity: 0.7; font-size: 0.9rem; margin-top: 6px; }
.result-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px; margin: 12px 0;
}
.stat-item {
  background: rgba(79,172,254,0.08);
  border: 1px solid rgba(79,172,254,0.2);
  border-radius: 12px; padding: 10px;
  text-align: center;
}
.stat-val { font-size: 1.4rem; font-weight: 900; color: #4facfe; }
.stat-lbl { font-size: 0.8rem; opacity: 0.7; margin-top: 2px; }

.btns { display: grid; gap: 10px; margin-top: 14px; }
.btn {
  border: none; border-radius: 14px;
  padding: 12px 14px; font-size: 1rem;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s;
  user-select: none;
}
.btn:hover { transform: translateY(-1px); }
.btn.primary {
  background: linear-gradient(135deg,#4facfe,#00f2fe);
  color: #071018; font-weight: 900;
}
.btn.ghost {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.92);
}

.rank { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); }
.rank-title { font-weight: 900; margin-bottom: 10px; color: #ffd32a; }
.rank-empty { opacity: 0.7; }
.rank-list { border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
.rank-row {
  display: grid; grid-template-columns: 44px 1fr 80px 80px;
  gap: 8px; padding: 10px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  align-items: center; font-size: 0.9rem; color: rgba(255,255,255,0.9);
}
.rank-row:last-child { border-bottom: none; }
.rk { opacity: 0.6; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc { text-align: right; font-weight: 900; color: #4facfe; }
.tm { text-align: right; opacity: 0.7; }
</style>

