<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { getSocket } from '../socket';
import { showToast } from '../utils/toast';
import { getAuthData } from '../utils/auth';
import { api } from '../utils/api';
import { featureFlags } from '../utils/featureFlags';
import { bindHardDropButton, computeHardDropY } from '../modules/HardDropButton';
import { bindHoldFastDropButton } from '../modules/HoldFastDropButton';
import { bindClickOutside, computePopoverPosition, getThemeStorageKey, t as uiText } from '../modules/ThemeSwitcher';
import { getCachedImage, getKimetsuAvatarUrls, getKimetsuBgUrl, getKimetsuBoardBgUrl, getLayAvatarUrls, getLayBgUrl, getLayBoardBgUrl, preloadImages } from '../modules/TetrisThemeAssets';

const props = defineProps({
  playerName: {
    type: String,
    default: '玩家'
  },
  difficulty: {
    type: String,
    default: 'medium'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  isMultiplayer: {
    type: Boolean,
    default: false
  },
  roomData: {
    type: Object,
    default: null
  }
});

let rngSeed = Date.now();
function seededRandom() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}
const random = seededRandom;

const emit = defineEmits(['gameOver', 'backToHub']);

const canvas = ref(null);
const hardDropButton = ref(null);
const holdFastDropButton = ref(null);
const themeSwitcherRoot = ref(null);
const themePopover = ref({
  open: false,
  player: 'A',
  left: 0,
  top: 0
});
const hardDropPos = ref({ left: '0px', top: '0px' });
const holdFastDropPos = ref({ left: '0px', top: '0px' });
const isHardDropEnabled = computed(() => featureFlags.hardDropButton);
const isHoldFastDropEnabled = computed(() => featureFlags.holdFastDropButton);
const isThemeSwitcherEnabled = computed(() => featureFlags.multiplayerThemeSwitcher && props.isMultiplayer);
let ctx = null;
let animationId = null;
let gameRunning = false;
const isPaused = ref(false); // 修复：必须是ref才能响应式更新UI

// 游戏状态
const score = ref(0);
const opponentScore = ref(0); // Multiplayer
const linesCleared = ref(0);
const level = ref(1);
const gameTime = ref(0);
const multiplayerTimeLimit = ref(0); // in seconds
let startTime = 0;
let lastTime = 0;
let hasEnded = false;
let hasSentGameOver = false;
let gameActionHandler = null;
let cleanupHardDrop = null;
let cleanupHoldFastDrop = null;
let cleanupThemeOutside = null;

const MAX_LEVEL = 12; // 12级通关
const LINES_PER_LEVEL = 10;

// 道具库存
const inventory = ref({
  bomb: 1,
  slowdown: 1,
  starClear: 1,
  transform: 1
});

// 道具获取动画状态
const propEffects = ref({
  bomb: false,
  slowdown: false,
  starClear: false,
  transform: false
});

// 状态效果
let slowdownEndTime = 0;
let isBombNext = false; 

// 紧张系统
const isTense = ref(false);
let lastHeartbeatTime = 0;

// 音频系统 - 替换为可用的免费素材或取消外链
const volume = ref(parseFloat(localStorage.getItem('tetris_volume') || '0.5'));
const isMuted = ref(localStorage.getItem('tetris_muted') === 'true');

// 为了避免跨域和403问题，我们使用更稳定的免费音频API生成BGM，或者暂时只保留音效
const bgmUrls = {
  warm: 'https://cdn.freesound.org/previews/573/573609_12836264-lq.mp3', // 替换为可用的稳定链接
  cyberpunk: 'https://cdn.freesound.org/previews/612/612053_11861866-lq.mp3', 
  ink: 'https://cdn.freesound.org/previews/608/608930_1015240-lq.mp3', 
  fashion: 'https://cdn.freesound.org/previews/611/611685_12836264-lq.mp3', 
  animal: 'https://cdn.freesound.org/previews/568/568585_12396340-lq.mp3',
  kimetsu: 'https://cdn.freesound.org/previews/612/612053_11861866-lq.mp3'
};

let currentBgm = null;
let audioContext = null;

// 风格系统
const soloStyle = ref(localStorage.getItem('tetris_style') || 'warm');
const playerThemes = ref({
  playerA_theme: localStorage.getItem('tetris_theme_playerA') || 'warm',
  playerB_theme: localStorage.getItem('tetris_theme_playerB') || 'warm'
});
const selfPlayer = computed(() => (props.roomData && props.roomData.role === 'host') ? 'A' : 'B');
const STYLE_KEYS = ['warm', 'cyberpunk', 'ink', 'fashion', 'animal', 'kimetsu', 'lay'];
const kimetsuBg = getKimetsuBgUrl();
const kimetsuBoardBg = getKimetsuBoardBgUrl();
const kimetsuAvatars = getKimetsuAvatarUrls();
const kimetsuImageMap = new Map();
let kimetsuPrimed = false;
const layBg = getLayBgUrl();
const layBoardBg = getLayBoardBgUrl();
const layAvatars = getLayAvatarUrls();
const layImageMap = new Map();
let layPrimed = false;
const boardBgImageMap = new Map();
const currentStyle = computed(() => {
  if (!props.isMultiplayer) return soloStyle.value;
  const key = selfPlayer.value === 'A' ? playerThemes.value.playerA_theme : playerThemes.value.playerB_theme;
  return STYLE_KEYS.includes(key) ? key : 'warm';
});
const STYLES = {
  warm: {
    name: '温馨主题',
    uiBg: '#D8C1AE',
    panelBg: 'rgba(255, 255, 255, 0.10)',
    canvasBg: '#D8C1AE',
    grid: 'rgba(0, 0, 0, 0.06)',
    border: 'rgba(58, 46, 40, 0.25)',
    colors: ['', '#F7C9C2', '#E9D8A5', '#B5E0D7', '#A2C8E5', '#D9BFE8', '#F5E2C1', '#CDE7BE'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(px, py, size, size, 8);
      ctx.fill();
      if (!isGhost && !isBomb) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.roundRect(px + 2, py + 2, size - 4, size / 3, 4);
        ctx.fill();
      }
    }
  },
  cyberpunk: {
    name: '赛博朋克',
    uiBg: '#0a0a1a',
    panelBg: 'rgba(0, 0, 0, 0.35)',
    canvasBg: '#0a0a1a',
    grid: 'rgba(0, 255, 255, 0.1)',
    border: '#00ffff',
    colors: ['', '#0ff', '#f0f', '#ff0', '#0f0', '#00f', '#f00', '#f80'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = isGhost ? 'transparent' : 'rgba(0,0,0,0.8)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(px, py, size, size);
      ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      if (!isGhost && !isBomb) {
        ctx.fillStyle = color;
        ctx.fillRect(px + size/4, py + size/4, size/2, size/2);
      }
    }
  },
  ink: {
    name: '武侠黑墨',
    uiBg: '#3A2E28',
    panelBg: 'rgba(0, 0, 0, 0.22)',
    canvasBg: '#3A2E28',
    grid: 'rgba(212, 175, 55, 0.08)',
    border: '#D4AF37',
    colors: ['', '#D4AF37', '#B48B55', '#8C6B4B', '#6F543E', '#A38B7D', '#CBBBAA', '#2B1F1A'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + size - 4, py + 4);
      ctx.lineTo(px + size - 2, py + size - 2);
      ctx.lineTo(px + 4, py + size - 4);
      ctx.closePath();
      ctx.fill();
    }
  },
  fashion: {
    name: '时尚丽人',
    uiBg: '#f5f5f0',
    panelBg: 'rgba(255, 255, 255, 0.12)',
    canvasBg: '#f5f5f0',
    grid: 'rgba(217, 208, 193, 0.3)',
    border: '#b8c4c1',
    colors: ['', '#d9d0c1', '#b8c4c1', '#d4c4b7', '#e2d3cd', '#c1cbd7', '#b5c4b1', '#d5caba'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      if (!isGhost && !isBomb) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
      }
    }
  },
  animal: {
    name: '动物自然',
    uiBg: 'linear-gradient(180deg, #B7D4AA 0%, #E9F5E1 100%)',
    panelBg: 'rgba(255, 255, 255, 0.10)',
    canvasBg: '#DDEDD8',
    grid: 'rgba(58, 125, 74, 0.10)',
    border: '#5a7d4a',
    colors: ['', '#81c784', '#aed581', '#a1887f', '#ffb74d', '#4dd0e1', '#ff8a65', '#90a4ae'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px + size/2, py + size/2, size/2 - 2, 0, Math.PI * 2);
      ctx.fill();
      if (!isGhost && !isBomb) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(px + size/3, py + size/3, 2, 0, Math.PI*2);
        ctx.arc(px + size*2/3, py + size/3, 2, 0, Math.PI*2);
        ctx.fill();
      }
    }
  },
  kimetsu: {
    name: '鬼灭之刃',
    uiBg: `linear-gradient(180deg, rgba(43,45,62,0.60) 0%, rgba(43,45,62,0.60) 100%), url(${kimetsuBg}) center/cover no-repeat`,
    panelBg: 'rgba(0, 0, 0, 0.30)',
    canvasBg: '#2B2D3E',
    boardBgUrl: kimetsuBoardBg,
    grid: 'rgba(249, 199, 79, 0.10)',
    border: '#F9C74F',
    colors: ['', '#F9C74F', '#A3CEF1', '#E76F51', '#43AA8B', '#577590', '#F94144', '#F3722C'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = isGhost ? 'transparent' : 'rgba(0,0,0,0.55)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px, py, size, size, 8);
      ctx.fill();
      ctx.stroke();

      if (isGhost || isBomb) return;

      const idx = Math.max(1, Math.min(7, Number(value || 1))) - 1;
      const url = kimetsuAvatars[idx];
      const pad = Math.max(2, Math.floor(size * 0.12));
      const inner = size - pad * 2;

      const img = url ? kimetsuImageMap.get(url) : null;
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px + pad, py + pad, inner, inner, 8);
        ctx.clip();
        ctx.drawImage(img, px + pad, py + pad, inner, inner);
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.90)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(px + pad, py + pad, inner, inner, 8);
      ctx.stroke();
    }
  },
  lay: {
    name: '张艺兴主题',
    uiBg: `linear-gradient(180deg, rgba(12,14,18,0.72) 0%, rgba(12,14,18,0.72) 100%), url(${layBg}) center/cover no-repeat`,
    panelBg: 'rgba(0, 0, 0, 0.34)',
    canvasBg: '#0C0E12',
    boardBgUrl: layBoardBg,
    grid: 'rgba(249, 199, 79, 0.08)',
    border: 'rgba(249, 199, 79, 0.75)',
    colors: ['', '#F9C74F', '#E5E7EB', '#94A3B8', '#F59E0B', '#38BDF8', '#A3E635', '#F97316'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb, value) => {
      ctx.fillStyle = isGhost ? 'transparent' : 'rgba(0,0,0,0.52)';
      ctx.strokeStyle = 'rgba(249, 199, 79, 0.70)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px, py, size, size, 6);
      ctx.fill();
      ctx.stroke();

      if (isGhost || isBomb) return;

      const idx = Math.max(1, Math.min(7, Number(value || 1))) - 1;
      const url = layAvatars[idx];
      const pad = Math.max(2, Math.floor(size * 0.12));
      const inner = size - pad * 2;

      const img = url ? layImageMap.get(url) : null;
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px + pad, py + pad, inner, inner, 6);
        ctx.clip();
        ctx.drawImage(img, px + pad, py + pad, inner, inner);
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(px + pad, py + pad, inner, inner, 6);
      ctx.stroke();
    }
  }
};

async function primeKimetsuAssets() {
  if (kimetsuPrimed) return;
  kimetsuPrimed = true;
  await preloadImages([kimetsuBg, kimetsuBoardBg, ...kimetsuAvatars]);
  const bg = await getCachedImage(kimetsuBoardBg);
  boardBgImageMap.set(kimetsuBoardBg, bg);
  const loaded = await Promise.all(kimetsuAvatars.map((u) => getCachedImage(u)));
  kimetsuAvatars.forEach((u, i) => {
    kimetsuImageMap.set(u, loaded[i]);
  });
}

async function primeLayAssets() {
  if (layPrimed) return;
  layPrimed = true;
  await preloadImages([layBg, layBoardBg, ...layAvatars]);
  const bg = await getCachedImage(layBoardBg);
  boardBgImageMap.set(layBoardBg, bg);
  const loaded = await Promise.all(layAvatars.map((u) => getCachedImage(u)));
  layAvatars.forEach((u, i) => {
    layImageMap.set(u, loaded[i]);
  });
}

// 棋盘配置
const COLS = 10;
const ROWS = 20;
let BLOCK_SIZE = 30; 
let offsetX = 0;
let offsetY = 0;

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const SHAPES = [
  [],
  [[1, 1, 1, 1]], // I
  [[2, 2], [2, 2]], // O
  [[0, 3, 0], [3, 3, 3]], // T
  [[4, 0, 0], [4, 4, 4]], // L
  [[0, 0, 5], [5, 5, 5]], // J
  [[0, 6, 6], [6, 6, 0]], // S
  [[7, 7, 0], [0, 7, 7]]  // Z
];

let currentPiece = null;
let nextPieceShape = null;

let dropCounter = 0;
let dropInterval = 1000;
let isFastDropping = false;
let fastDropHoldCount = 0;

// 粒子特效
let particles = [];
let floatingTexts = [];

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (random() - 0.5) * 8;
    this.vy = (random() - 0.5) * 8;
    this.life = 1;
    this.color = color;
    this.size = random() * 4 + 2;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2; 
    this.life -= 0.02;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1.0;
  }
  update() {
    this.y -= 1;
    this.life -= 0.02;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

function createExplosion(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
}

function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  playBGM();
}

function playBGM() {
  if (currentBgm) {
    currentBgm.pause();
    currentBgm.removeAttribute('src'); // 彻底释放旧音频资源
    currentBgm.load();
  }
  
  if (isMuted.value) return; // 静音状态下不加载

  // 添加错误处理，避免控制台红海
  currentBgm = new Audio(bgmUrls[currentStyle.value]);
  currentBgm.loop = true;
  currentBgm.volume = volume.value;
  
  const playPromise = currentBgm.play();
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn('BGM Auto-play was prevented or failed to load. Please interact with the screen first or check network.', error.message);
    });
  }
}

function updateVolume() {
  if (currentBgm) {
    currentBgm.volume = isMuted.value ? 0 : volume.value;
  }
  localStorage.setItem('tetris_volume', volume.value);
  localStorage.setItem('tetris_muted', isMuted.value);
}

function toggleMute() {
  isMuted.value = !isMuted.value;
  updateVolume();
}

function playSFX(type) {
  if (isMuted.value || !audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  if (type === 'clear') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(volume.value, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  } else if (type === 'drop') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(volume.value * 0.5, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  } else if (type === 'heartbeat') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
    gain.gain.setValueAtTime(volume.value, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    osc.start();
    osc.stop(audioContext.currentTime + 0.3);
  }
}

function getRandomShape() {
  const index = Math.floor(random() * 7) + 1;
  return {
    matrix: JSON.parse(JSON.stringify(SHAPES[index])),
    x: Math.floor(COLS / 2) - Math.floor(SHAPES[index][0].length / 2),
    y: 0,
    isBomb: false
  };
}

function rotate(matrix) {
  const N = matrix.length;
  const M = matrix[0].length;
  const result = Array.from({ length: M }, () => Array(N).fill(0));
  for (let y = 0; y < N; ++y) {
    for (let x = 0; x < M; ++x) {
      result[x][N - 1 - y] = matrix[y][x];
    }
  }
  return result;
}

function collide(board, piece) {
  const m = piece.matrix;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 &&
         (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function merge(board, piece) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        board[y + piece.y][x + piece.x] = value;
      }
    });
  });
  checkTension();
}

function checkTension() {
  // 检查距离顶部3行内是否有方块
  let tension = false;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] !== 0) {
        tension = true;
        break;
      }
    }
    if (tension) break;
  }
  isTense.value = tension;
}

function sweep() {
  let rowCount = 0;
  outer: for (let y = board.length - 1; y >= 0; --y) {
    for (let x = 0; x < board[y].length; ++x) {
      if (board[y][x] === 0) {
        continue outer;
      }
    }
    const row = board.splice(y, 1)[0].fill(0);
    board.unshift(row);
    ++y;
    rowCount++;
    
    for (let x = 0; x < COLS; x++) {
      createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, STYLES[currentStyle.value].colors[1], 5);
    }
  }

  if (rowCount > 0) {
    playSFX('clear');
    linesCleared.value += rowCount;
    const points = [0, 100, 300, 500, 800];
    score.value += (points[rowCount] || 1000) * level.value;
    
    // Multiplayer sync score
    if (props.isMultiplayer) {
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'score_update', score: score.value }
        });
      }
    }
    
    const propChance = rowCount > 1 ? 1 : 0.25;
    if (random() < propChance) {
      const propKeys = Object.keys(inventory.value);
      const randomProp = propKeys[Math.floor(random() * propKeys.length)];
      inventory.value[randomProp]++;
      
      // 触发UI动画特效
      propEffects.value[randomProp] = true;
      setTimeout(() => { propEffects.value[randomProp] = false; }, 500);
      
      floatingTexts.push(new FloatingText(canvas.value.width / 2, canvas.value.height / 2, `+1 道具`, '#ffeb3b'));
    }

    if (linesCleared.value >= level.value * LINES_PER_LEVEL) {
      level.value++;
      if (level.value > MAX_LEVEL) {
        endGame(true); 
      } else {
        updateDropInterval();
      }
    }
  }
  checkTension();
}

function updateDropInterval() {
  let baseSpeed = props.difficulty === 'hard' ? 500 : (props.difficulty === 'easy' ? 1200 : 1000);
  const timeMultiplier = Math.pow(0.95, Math.floor(gameTime.value / 60)); 
  dropInterval = baseSpeed * Math.pow(0.85, level.value - 1) * timeMultiplier;
}

function playerDrop() {
  currentPiece.y++;
  if (collide(board, currentPiece)) {
    currentPiece.y--;
    
    if (currentPiece.isBomb) {
      explodeBomb(currentPiece);
    } else {
      merge(board, currentPiece);
      sweep();
    }
    
    resetPiece();
  }
  dropCounter = 0;
}

function playerHardDrop() {
  playSFX('drop');
  currentPiece.y = computeHardDropY(board, currentPiece, collide);
  
  if (currentPiece.isBomb) {
    explodeBomb(currentPiece);
  } else {
    merge(board, currentPiece);
    sweep();
  }
  
  resetPiece();
  dropCounter = 0;
}

function playerMove(dir) {
  currentPiece.x += dir;
  if (collide(board, currentPiece)) {
    currentPiece.x -= dir;
  }
}

function playerRotate() {
  const pos = currentPiece.x;
  let offset = 1;
  const matrix = currentPiece.matrix;
  currentPiece.matrix = rotate(currentPiece.matrix);
  
  while (collide(board, currentPiece)) {
    currentPiece.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > matrix[0].length) {
      currentPiece.matrix = matrix; 
      currentPiece.x = pos;
      return;
    }
  }
}

function explodeBomb(piece) {
  const cx = piece.x + Math.floor(piece.matrix[0].length / 2);
  const cy = piece.y + Math.floor(piece.matrix.length / 2);
  
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        if (board[y][x] !== 0) {
          createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, '#ff4757');
          board[y][x] = 0;
        }
      }
    }
  }
  checkTension();
  if (navigator.vibrate) navigator.vibrate(200);
}

function useProp(type) {
  if (inventory.value[type] <= 0 || isPaused.value) return;
  
  inventory.value[type]--;
  
  if (type === 'bomb') {
    currentPiece.isBomb = true;
    currentPiece.matrix = currentPiece.matrix.map(row => row.map(val => val ? 8 : 0)); 
  } else if (type === 'slowdown') {
    slowdownEndTime = performance.now() + 5000; 
  } else if (type === 'starClear') {
    for (let y = ROWS - 1; y >= 0; y--) {
      let hasBlock = false;
      for (let x = 0; x < COLS; x++) {
        if (board[y][x] !== 0) {
          hasBlock = true;
          createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, STYLES[currentStyle.value].colors[board[y][x]]);
        }
      }
      if (hasBlock) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        score.value += 200 * level.value; 
        break;
      }
    }
    checkTension();
  } else if (type === 'transform') {
    const newShape = getRandomShape();
    currentPiece.matrix = newShape.matrix;
    currentPiece.isBomb = false;
    while (collide(board, currentPiece) && currentPiece.y > 0) {
      currentPiece.y--;
    }
  }
}

// 侧边栏预览逻辑
const nextPieceShapeRef = ref(null);

function isPreviewBlock(x, y) {
  if (!nextPieceShapeRef.value || !nextPieceShapeRef.value.matrix) return false;
  const matrix = nextPieceShapeRef.value.matrix;
  
  // 居中偏移计算
  const offsetY = Math.floor((4 - matrix.length) / 2);
  const offsetX = Math.floor((4 - matrix[0].length) / 2);
  
  if (y >= offsetY && y < offsetY + matrix.length && 
      x >= offsetX && x < offsetX + matrix[0].length) {
    return matrix[y - offsetY][x - offsetX] !== 0;
  }
  return false;
}

function getPreviewBlockStyle(piece) {
  if (!piece || !piece.matrix) return {};
  
  // 找到矩阵中第一个非零元素的值，以此确定颜色
  let colorValue = 0;
  for(let y=0; y<piece.matrix.length; y++) {
    for(let x=0; x<piece.matrix[y].length; x++) {
      if(piece.matrix[y][x] !== 0) {
        colorValue = piece.matrix[y][x];
        break;
      }
    }
    if(colorValue !== 0) break;
  }
  
  const style = STYLES[currentStyle.value];
  const color = style.colors[colorValue] || '#fff';
  
  // 根据不同风格返回不同的CSS，这里做简单处理，统一用背景色和圆角
  return {
    backgroundColor: color,
    borderRadius: currentStyle.value === 'warm' ? '4px' : 
                  currentStyle.value === 'animal' ? '50%' : '2px',
    boxShadow: currentStyle.value === 'cyberpunk' ? `0 0 5px ${color}` : 'none'
  };
}

function resetPiece() {
  currentPiece = nextPieceShape;
  nextPieceShape = getRandomShape();
  nextPieceShapeRef.value = nextPieceShape; // 同步给Vue模板
  
  if (isBombNext) {
    currentPiece.isBomb = true;
    currentPiece.matrix = currentPiece.matrix.map(row => row.map(val => val ? 8 : 0));
    isBombNext = false;
  }
  
  if (collide(board, currentPiece)) {
    endGame(false);
  }
}

function drawMatrix(matrix, offsetPos, isGhost = false, isBomb = false) {
  const style = STYLES[currentStyle.value];
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const px = offsetX + (x + offsetPos.x) * BLOCK_SIZE;
        const py = offsetY + (y + offsetPos.y) * BLOCK_SIZE;
        
        const color = isBomb ? '#ff4757' : (value === 8 ? '#ff4757' : style.colors[value]);
        
        ctx.globalAlpha = isGhost ? 0.3 : 1.0;
        style.drawBlock(ctx, px, py, BLOCK_SIZE, color, isGhost, isBomb || value === 8, value);
        ctx.globalAlpha = 1.0;

        if (!isGhost && (isBomb || value === 8)) {
          ctx.fillStyle = '#fff';
          ctx.font = `${BLOCK_SIZE*0.6}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💣', px + BLOCK_SIZE/2, py + BLOCK_SIZE/2);
        }
      }
    });
  });
}

function draw() {
  const style = STYLES[currentStyle.value];
  
  // 背景
  ctx.fillStyle = style.canvasBg;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  
  // 修正坐标系统：由于 game-area 变为 flex 布局，canvas 的宽高需要仅为棋盘大小
  const canvasWidth = COLS * BLOCK_SIZE;
  const canvasHeight = ROWS * BLOCK_SIZE;
  
  // 调整 Canvas 实际大小
  if (canvas.value.width !== canvasWidth || canvas.value.height !== canvasHeight) {
    canvas.value.width = canvasWidth;
    canvas.value.height = canvasHeight;
  }
  
  offsetX = 0;
  offsetY = 0;
  
  ctx.fillStyle = style.canvasBg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (style.boardBgUrl) {
    const bgImg = boardBgImageMap.get(style.boardBgUrl);
    if (bgImg) {
      const iw = bgImg.naturalWidth || bgImg.width;
      const ih = bgImg.naturalHeight || bgImg.height;
      if (iw && ih) {
        const scale = Math.max(canvasWidth / iw, canvasHeight / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (canvasWidth - dw) / 2;
        const dy = (canvasHeight - dh) / 2;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
        ctx.restore();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    }
  }
  
    if (isTense.value) {
      const pulse = (Math.sin(performance.now() * 0.005) + 1) / 2;
      ctx.fillStyle = `rgba(255, 0, 0, ${pulse * 0.15})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse * 0.8})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    }
  
  // 绘制棋盘网格
  ctx.strokeStyle = style.grid;
  ctx.lineWidth = 1;
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + y * BLOCK_SIZE);
    ctx.lineTo(offsetX + COLS * BLOCK_SIZE, offsetY + y * BLOCK_SIZE);
    ctx.stroke();
  }
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x * BLOCK_SIZE, offsetY);
    ctx.lineTo(offsetX + x * BLOCK_SIZE, offsetY + ROWS * BLOCK_SIZE);
    ctx.stroke();
  }
  
  // 棋盘边框
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
  
  drawMatrix(board, {x: 0, y: 0});
  
  if (currentPiece) {
    const ghost = { ...currentPiece, y: currentPiece.y };
    while (!collide(board, ghost)) {
      ghost.y++;
    }
    ghost.y--;
    drawMatrix(ghost.matrix, ghost, true);
    
    drawMatrix(currentPiece.matrix, currentPiece, false, currentPiece.isBomb);
  }
  
  // 粒子特效
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.update();
    p.draw(ctx);
  });
  
  floatingTexts = floatingTexts.filter(t => t.life > 0);
  floatingTexts.forEach(t => {
    t.update();
    t.draw(ctx);
  });
  
  if (slowdownEndTime > performance.now()) {
    ctx.fillStyle = 'rgba(46, 213, 115, 0.1)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.shadowColor = '#2ed573';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#2ed573';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    ctx.shadowBlur = 0;
  }
}

function update(time = 0) {
  if (!gameRunning || isPaused.value) {
    lastTime = time;
    animationId = requestAnimationFrame(update);
    return;
  }
  
  const deltaTime = time - lastTime;
  lastTime = time;
  
  // 防止异常的deltaTime（例如切换后台回来后deltaTime极大）
  if (deltaTime > 1000) {
    animationId = requestAnimationFrame(update);
    return;
  }
  
  gameTime.value = Math.floor((performance.now() - startTime) / 1000);
  
  if (gameTime.value > 0 && gameTime.value % 60 === 0) {
    updateDropInterval();
  }
  
  if (props.isMultiplayer && multiplayerTimeLimit.value > 0) {
    if (gameTime.value >= multiplayerTimeLimit.value) {
      endMultiplayerGame();
      return;
    }
  }
  
  dropCounter += deltaTime;
  
  const fastDropActive = fastDropHoldCount > 0;
  const fastDropMultiplier = fastDropActive ? 8 : 1;
  let baseInterval = dropInterval;
  if (slowdownEndTime > performance.now() && !fastDropActive) {
    baseInterval *= 2.5;
  }
  const currentInterval = baseInterval / fastDropMultiplier;
  
  if (dropCounter > currentInterval) {
    playerDrop();
  }
  
  // 紧张系统心跳音效
  if (isTense.value && performance.now() - lastHeartbeatTime > 800) {
    playSFX('heartbeat');
    lastHeartbeatTime = performance.now();
  }
  
  draw();
  animationId = requestAnimationFrame(update);
}

let touchStartX = 0;
let touchStartY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let touchMoved = false;

function handleTouchStart(e) {
  if (isPaused.value) return;
  e.preventDefault(); 
  initAudio(); // 用户交互时初始化音频
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  lastTouchX = touchStartX;
  lastTouchY = touchStartY;
  touchMoved = false;
}

function handleTouchMove(e) {
  if (isPaused.value) return;
  e.preventDefault(); // 恢复 preventDefault() 以阻止页面滚动，这是移动端游戏必须的
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  
  const dx = currentX - lastTouchX;
  const dy = currentY - lastTouchY;
  
  if (Math.abs(dx) > BLOCK_SIZE * 0.8 && Math.abs(dx) > Math.abs(dy)) {
    playerMove(dx > 0 ? 1 : -1);
    lastTouchX = currentX;
    touchMoved = true;
  }
  
  lastTouchY = currentY;
}

function handleTouchEnd(e) {
  if (isPaused.value) return;
  e.preventDefault(); 

  const totalDx = e.changedTouches[0].clientX - touchStartX;
  const totalDy = e.changedTouches[0].clientY - touchStartY;
  
  if (Math.abs(totalDx) < 10 && Math.abs(totalDy) < 10 && !touchMoved) {
    playerRotate();
  } 
}

function handleKeyDown(e) {
  if (isPaused.value) return;
  initAudio(); // 初始化音频
  switch(e.key) {
    case 'ArrowLeft': playerMove(-1); break;
    case 'ArrowRight': playerMove(1); break;
    case 'ArrowDown': if (!e.repeat) setFastDropActive(true); break;
    case 'ArrowUp': playerRotate(); break;
    case ' ': playerHardDrop(); break;
  }
}

function handleKeyUp(e) {
  if (isPaused.value) return;
  if (e.key === 'ArrowDown') {
    setFastDropActive(false);
  }
}

function setFastDropActive(active) {
  if (active) fastDropHoldCount += 1;
  else fastDropHoldCount = Math.max(0, fastDropHoldCount - 1);
  dropCounter = 0;
}

function setCanvasSize() {
  if (!canvas.value) return;
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.value.width = width;
  canvas.value.height = height;
  
  // 留出侧边栏 (约100px) 和底部道具栏 (100px) 的空间
  const availableHeight = height - 180; 
  const availableWidth = width - 120; // 为右侧预览留出空间
  
  BLOCK_SIZE = Math.min(Math.floor(availableWidth / COLS), Math.floor(availableHeight / ROWS));
  
  // 居中稍微偏左，给右侧预览留空间
  offsetX = Math.floor((width - COLS * BLOCK_SIZE - 90) / 2);
  offsetY = 10; // 取消了HUD硬编码高度，交由CSS flex处理

  requestAnimationFrame(() => {
    updateHardDropButtonPosition();
  });
}

function updateHardDropButtonPosition() {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const btnW = 80;
  const btnH = 48;
  const holdBtnW = Math.max(48, btnW);
  const holdBtnH = 48;
  const propsBarTop = vh - 30 - 60;
  const stackHeight = btnH + 20 + holdBtnH;
  const maxTop = Math.max(10, propsBarTop - stackHeight - 12);

  let left = rect.right + 20;
  let top = rect.bottom - stackHeight;

  left = Math.min(Math.max(10, left), vw - btnW - 10);
  top = Math.min(Math.max(10, top), maxTop);

  hardDropPos.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
  const holdTop = Math.round(top) + btnH + 20;
  const holdLeft = Math.min(Math.max(10, Math.round(left)), vw - holdBtnW - 10);
  holdFastDropPos.value = { left: `${holdLeft}px`, top: `${holdTop}px` };
}

function togglePause() {
  isPaused.value = !isPaused.value;
  if (isPaused.value && currentBgm) {
    currentBgm.pause();
  } else if (!isPaused.value && currentBgm && !isMuted.value) {
    currentBgm.play();
  }
}

function changeStyle(styleKey) {
  soloStyle.value = styleKey;
  if (styleKey === 'kimetsu') primeKimetsuAssets();
  if (styleKey === 'lay') primeLayAssets();
  localStorage.setItem('tetris_style', styleKey);
  playBGM(); // 切换音乐
}

function applyPlayerTheme(player, styleKey, { persist = true, broadcast = true } = {}) {
  if (!STYLE_KEYS.includes(styleKey)) return;
  if (player !== 'A' && player !== 'B') return;
  if (styleKey === 'kimetsu') primeKimetsuAssets();
  if (styleKey === 'lay') primeLayAssets();
  if (player === 'A') playerThemes.value.playerA_theme = styleKey;
  if (player === 'B') playerThemes.value.playerB_theme = styleKey;

  if (persist) {
    localStorage.setItem(getThemeStorageKey(player), styleKey);
  }

  if (player === selfPlayer.value) {
    playBGM();
  }

  if (broadcast && props.isMultiplayer) {
    const socket = getSocket();
    if (socket && props.roomData?.roomId) {
      socket.emit('game_action', {
        roomId: props.roomData.roomId,
        action: { type: 'theme_update', player, theme: styleKey }
      });
    }
  }
}

function openThemePopover(player, triggerEl) {
  if (!isThemeSwitcherEnabled.value) return;
  if (player !== selfPlayer.value) return;
  if (currentStyle.value === 'kimetsu') {
    primeKimetsuAssets();
  }
  if (currentStyle.value === 'lay') {
    primeLayAssets();
  }
  const rect = triggerEl.getBoundingClientRect();
  const pos = computePopoverPosition(rect, { width: 240, height: 220 }, 10);
  themePopover.value = { open: true, player, left: pos.left, top: pos.top };
}

function closeThemePopover() {
  themePopover.value = { ...themePopover.value, open: false };
}

function endGame(victory = false) {
  if (hasEnded) return;
  if (props.isMultiplayer) {
    endMultiplayerGame(true);
    return;
  }
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  emit('gameOver', score.value, victory);
}

function endMultiplayerGame(sendToOpponent = true) {
  if (hasEnded) return;
  hasEnded = true;
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  
  const socket = getSocket();
  if (socket && sendToOpponent && !hasSentGameOver) {
    socket.emit('game_action', {
      roomId: props.roomData.roomId,
      action: { type: 'game_over', score: score.value }
    });
    hasSentGameOver = true;
  }
  
  const isVictory = score.value > opponentScore.value;
  const isDraw = score.value === opponentScore.value;
  const resultText = isVictory ? '你赢了！' : (isDraw ? '平局！' : '你输了！');
  showToast(`比赛结束：${resultText}（你：${score.value}，对方：${opponentScore.value}）`, isVictory ? 'success' : (isDraw ? 'info' : 'warning'), 5000);
  saveDuelRecord();
  emit('gameOver', score.value, isVictory);
}

async function saveDuelRecord() {
  if (!featureFlags.duelLeaderboard) return;
  if (!props.isMultiplayer) return;
  if (props.isGuest) return;
  if (props.roomData?.role !== 'host') return;
  const auth = getAuthData();
  if (!auth?.token) return;

  const aIsSelf = selfPlayer.value === 'A';
  const aName = aIsSelf ? props.playerName : (props.roomData?.opponentName || '玩家A');
  const bName = aIsSelf ? (props.roomData?.opponentName || '玩家B') : props.playerName;
  const aScore = aIsSelf ? score.value : opponentScore.value;
  const bScore = aIsSelf ? opponentScore.value : score.value;

  try {
    await api.post('/scores', {
      score: Math.max(aScore, bScore),
      difficulty: props.difficulty,
      gameType: 'tetris',
      gameMode: 'duel',
      duel: {
        aName,
        bName,
        aScore,
        bScore,
        replay: {
          roomId: props.roomData?.roomId,
          seed: props.roomData?.seed,
          timeLimit: props.roomData?.timeLimit,
          difficulty: props.difficulty
        }
      }
    }, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
  } catch {}
}

function backToHub() {
  if (window.confirm('确定要返回主菜单吗？当前进度将丢失。')) {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    if (currentBgm) currentBgm.pause();
    emit('backToHub');
  }
}

function restartGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  score.value = 0;
  linesCleared.value = 0;
  level.value = 1;
  gameTime.value = 0;
  startTime = performance.now();
  isTense.value = false;
  inventory.value = { bomb: 1, slowdown: 1, starClear: 1, transform: 1 };
  updateDropInterval();
  nextPieceShape = getRandomShape();
  resetPiece();
  isPaused.value = false;
  if (currentBgm && !isMuted.value) currentBgm.play();
}

onMounted(() => {
  ctx = canvas.value.getContext('2d');
  setCanvasSize();
  if (currentStyle.value === 'kimetsu') primeKimetsuAssets();
  if (currentStyle.value === 'lay') primeLayAssets();
  window.addEventListener('resize', setCanvasSize);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  canvas.value.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.value.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.value.addEventListener('touchend', handleTouchEnd, { passive: false });

  if (isHardDropEnabled.value) {
    cleanupHardDrop = bindHardDropButton(hardDropButton.value, {
      onHardDrop: () => {
        if (isPaused.value) return;
        playerHardDrop();
      },
      ensureAudio: initAudio,
      getAudioContext: () => audioContext,
      getVolume: () => volume.value,
      isMuted: () => isMuted.value
    });
  }

  if (isHoldFastDropEnabled.value) {
    cleanupHoldFastDrop = bindHoldFastDropButton(holdFastDropButton.value, {
      onHoldStart: () => {
        if (isPaused.value) return;
        setFastDropActive(true);
      },
      onHoldEnd: () => {
        setFastDropActive(false);
      },
      ensureAudio: initAudio,
      getAudioContext: () => audioContext,
      getVolume: () => volume.value,
      isMuted: () => isMuted.value
    });
  }

  if (isThemeSwitcherEnabled.value) {
    cleanupThemeOutside = bindClickOutside({
      rootEl: themeSwitcherRoot.value,
      getEnabled: () => themePopover.value.open,
      onClose: () => closeThemePopover()
    });
  }
  
  if (props.isMultiplayer && props.roomData && props.roomData.seed) {
    rngSeed = props.roomData.seed;
    
    // Multiplayer settings
    if (props.roomData.timeLimit) {
      multiplayerTimeLimit.value = props.roomData.timeLimit * 60; // in seconds
    }
    
    const socket = getSocket();
    if (socket) {
      gameActionHandler = (data) => {
        if (data.action.type === 'score_update') {
          opponentScore.value = data.action.score;
        } else if (data.action.type === 'theme_update') {
          if (data.action.player === 'A' || data.action.player === 'B') {
            applyPlayerTheme(data.action.player, data.action.theme, { persist: false, broadcast: false });
          }
        } else if (data.action.type === 'game_over') {
          if (typeof data.action.score === 'number') {
            opponentScore.value = data.action.score;
          }
          endMultiplayerGame(false);
        }
      };
      socket.on('game_action', gameActionHandler);
    }
  }

  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  updateDropInterval();
  nextPieceShape = getRandomShape();
  nextPieceShapeRef.value = nextPieceShape;
  resetPiece();
  
  gameRunning = true;
  startTime = performance.now();
  update();
});

onUnmounted(() => {
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  if (cleanupHardDrop) cleanupHardDrop();
  if (cleanupHoldFastDrop) cleanupHoldFastDrop();
  if (cleanupThemeOutside) cleanupThemeOutside();
  window.removeEventListener('resize', setCanvasSize);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  const socket = getSocket();
  if (socket && gameActionHandler) {
    socket.off('game_action', gameActionHandler);
  }
});
</script>

<template>
  <div class="game-container" :class="{ 'kimetsu-bg': currentStyle === 'kimetsu', 'lay-bg': currentStyle === 'lay' }" :style="{ background: STYLES[currentStyle].uiBg }">
    <!-- 顶部 HUD -->
    <div class="hud-top" :style="{ borderColor: STYLES[currentStyle].border }">
      <button class="back-btn" @click="backToHub">←</button>
      <div class="stats">
        <div class="stat-item">
          <span class="label">LEVEL</span>
          <span class="value">{{ level }} / {{ MAX_LEVEL }}</span>
        </div>
        <div class="stat-item">
          <span class="label">SCORE</span>
          <span class="value score-val">{{ score }}</span>
        </div>
        <div v-if="isMultiplayer" class="stat-item">
          <span class="label" style="color: #2196f3">VS</span>
          <span class="value score-val" style="color: #2196f3">{{ opponentScore }}</span>
        </div>
        <div v-if="isMultiplayer" class="stat-item">
          <span class="label">TIME</span>
          <span class="value">{{ Math.max(0, multiplayerTimeLimit - gameTime) }}s</span>
        </div>
      </div>
      <button v-if="!isMultiplayer" class="pause-btn" @click="togglePause">{{ isPaused ? '▶️' : '⏸️' }}</button>
    </div>
    
    <!-- 暂停遮罩与菜单 -->
    <div v-if="isPaused" class="pause-overlay">
      <div class="pause-menu">
        <h2>游戏暂停</h2>
        
        <div class="menu-section">
          <h3>🎮 操作</h3>
          <button class="menu-btn primary" @click="togglePause">继续游戏</button>
          <button class="menu-btn warning" @click="restartGame">重新开始</button>
          <button class="menu-btn danger" @click="backToHub">返回菜单</button>
        </div>

        <div class="menu-section">
          <h3>🎨 风格切换</h3>
          <div class="style-grid">
            <button 
              v-for="(style, key) in STYLES" 
              :key="key"
              class="style-btn"
              :class="{ active: currentStyle === key }"
              @click="changeStyle(key)"
            >
              {{ style.name }}
            </button>
          </div>
        </div>

        <div class="menu-section">
          <h3>🔊 音频设置</h3>
          <div class="audio-controls">
            <button class="mute-btn" @click="toggleMute">{{ isMuted ? '🔇' : '🔊' }}</button>
            <input type="range" min="0" max="1" step="0.1" v-model="volume" @input="updateVolume" :disabled="isMuted" />
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏画布与下一个方块预览区 -->
    <div class="game-area" :class="{ multiplayer: isMultiplayer }">
      <canvas ref="canvas"></canvas>
      
      <!-- 侧边栏 -->
      <div class="side-panel" :style="{ borderColor: STYLES[currentStyle].border, background: STYLES[currentStyle].panelBg }">
        <div class="next-piece-box">
          <div class="panel-title">{{ uiText('next') }}</div>
          <div class="preview-grid" :class="[currentStyle]">
            <div v-for="y in 4" :key="'y'+y" class="preview-row">
              <div v-for="x in 4" :key="'x'+x" class="preview-cell">
                <div v-if="isPreviewBlock(x-1, y-1)" 
                     class="preview-block"
                     :style="getPreviewBlockStyle(nextPieceShape)">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isThemeSwitcherEnabled" ref="themeSwitcherRoot" class="theme-switcher">
          <button
            class="theme-toggle-btn"
            :disabled="selfPlayer !== 'A'"
            :class="{ disabled: selfPlayer !== 'A' }"
            @click="openThemePopover('A', $event.currentTarget)"
          >
            <span class="theme-icon">🎨</span>
            <span class="theme-text">{{ uiText('theme') }}</span>
            <span class="theme-badge">A</span>
          </button>
          <button
            class="theme-toggle-btn"
            :disabled="selfPlayer !== 'B'"
            :class="{ disabled: selfPlayer !== 'B' }"
            @click="openThemePopover('B', $event.currentTarget)"
          >
            <span class="theme-icon">🎨</span>
            <span class="theme-text">{{ uiText('theme') }}</span>
            <span class="theme-badge">B</span>
          </button>

          <div v-if="themePopover.open" class="theme-popover" :style="{ left: themePopover.left + 'px', top: themePopover.top + 'px' }">
            <div class="theme-popover-panel" :style="{ borderColor: STYLES[currentStyle].border, background: STYLES[currentStyle].panelBg }">
              <div class="style-grid">
                <button
                  v-for="(style, key) in STYLES"
                  :key="key"
                  class="style-btn"
                  :class="{ active: (selfPlayer === 'A' ? playerThemes.playerA_theme : playerThemes.playerB_theme) === key }"
                  @click="applyPlayerTheme(selfPlayer, key); closeThemePopover()"
                >
                  {{ style.name }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="isHardDropEnabled"
      ref="hardDropButton"
      class="hard-drop-btn"
      :style="hardDropPos"
    >
      {{ uiText('hardDrop') }}
    </button>

    <button
      v-if="isHoldFastDropEnabled"
      ref="holdFastDropButton"
      class="hold-fast-drop-btn"
      :style="holdFastDropPos"
    >
      {{ uiText('holdFastDrop') }}
    </button>

    <!-- 底部道具栏 -->
    <div class="props-bar">
      <div class="prop-btn" :class="{ disabled: inventory.bomb <= 0, 'prop-gained': propEffects.bomb }" @click="useProp('bomb')">
        <span class="icon">💣</span>
        <span class="count">{{ inventory.bomb }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.slowdown <= 0, 'prop-gained': propEffects.slowdown }" @click="useProp('slowdown')">
        <span class="icon">⏱️</span>
        <span class="count">{{ inventory.slowdown }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.starClear <= 0, 'prop-gained': propEffects.starClear }" @click="useProp('starClear')">
        <span class="icon">⭐</span>
        <span class="count">{{ inventory.starClear }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.transform <= 0, 'prop-gained': propEffects.transform }" @click="useProp('transform')">
        <span class="icon">🔄</span>
        <span class="count">{{ inventory.transform }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: background-color 0.5s ease;
}

.game-container.kimetsu-bg {
  background-position: center;
  animation: kimetsu-lightning 10.8s infinite;
}

@keyframes kimetsu-lightning {
  0%, 70% { background-position: 50% 50%; filter: brightness(1) contrast(1); }
  72% { background-position: 49% 50%; filter: brightness(1.06) contrast(1.06); }
  73% { background-position: 51% 49%; filter: brightness(1.10) contrast(1.08); }
  74% { background-position: 50% 51%; filter: brightness(1.06) contrast(1.05); }
  75% { background-position: 52% 50%; filter: brightness(1.08) contrast(1.06); }
  76% { background-position: 48% 51%; filter: brightness(1.04) contrast(1.03); }
  77% { background-position: 50% 50%; filter: brightness(1) contrast(1); }
  100% { background-position: 50% 50%; filter: brightness(1) contrast(1); }
}

.game-container.lay-bg {
  background-position: center;
  animation: lay-flash 8.8s infinite;
}

@keyframes lay-flash {
  0%, 78% { filter: brightness(1) contrast(1); }
  80% { filter: brightness(1.08) contrast(1.06); }
  81% { filter: brightness(1.02) contrast(1.02); }
  82% { filter: brightness(1.12) contrast(1.08); }
  83% { filter: brightness(1) contrast(1); }
  100% { filter: brightness(1) contrast(1); }
}

.game-area {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding-top: 80px; /* HUD高度 */
}

.game-area.multiplayer {
  gap: 15px;
}

canvas {
  display: block;
}

.hard-drop-btn {
  position: fixed;
  width: 80px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.62));
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  z-index: 12;
  user-select: none;
  touch-action: manipulation;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(10px);
  transition: transform 0.1s ease, filter 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
}

.hard-drop-btn:hover {
  filter: brightness(1.06);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.20);
}

.hard-drop-btn.is-pressed {
  transform: scale(0.95);
  filter: brightness(0.95);
}

.hard-drop-btn:disabled,
.hard-drop-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hold-fast-drop-btn {
  position: fixed;
  width: 80px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.58));
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  z-index: 12;
  user-select: none;
  touch-action: manipulation;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(10px);
  transition: filter 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease, transform 0.1s ease;
}

.hold-fast-drop-btn:hover {
  filter: brightness(1.06);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.hold-fast-drop-btn.is-pressed {
  filter: brightness(0.92);
  transform: scale(0.98);
}

.hold-fast-drop-btn.is-pressed::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  animation: hold-pulse 0.6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes hold-pulse {
  0% { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.12); }
}

.hold-fast-drop-btn:disabled,
.hold-fast-drop-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 侧边栏及预览区 */
.side-panel {
  width: 80px;
  padding: 10px;
  border-radius: 10px;
  border: 2px solid;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 10px;
}

.panel-title {
  font-size: 0.8rem;
  font-weight: bold;
  color: #666;
  margin-bottom: 10px;
  text-align: center;
}

.preview-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-row {
  display: flex;
  gap: 2px;
}

.preview-cell {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-block {
  width: 100%;
  height: 100%;
  background: #ccc; /* fallback */
}

.theme-switcher {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  position: relative;
}

.theme-toggle-btn {
  width: 60px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
  user-select: none;
  touch-action: manipulation;
}

.theme-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.43);
}

.theme-toggle-btn.disabled,
.theme-toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.theme-icon {
  font-size: 14px;
  line-height: 1;
}

.theme-text {
  line-height: 1;
}

.theme-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 11px;
  font-weight: 800;
}

.theme-popover {
  position: fixed;
  z-index: 20;
}

.theme-popover-panel {
  width: 240px;
  border-radius: 12px;
  border: 2px solid;
  padding: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

@media (max-width: 480px) {
  .hard-drop-btn {
    font-size: 14px;
  }
  .hold-fast-drop-btn {
    font-size: 13px;
  }
}

/* 顶部 HUD */
.hud-top {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 500px;
  height: 60px;
  background: rgba(128, 128, 128, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  z-index: 10;
  transition: border-color 0.5s ease;
}

.back-btn, .pause-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.3);
  border: none;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.label {
  font-size: 0.7rem;
  color: #666;
  letter-spacing: 1px;
  font-weight: bold;
}

.value {
  font-size: 1.2rem;
  font-weight: bold;
  color: #333;
}

.score-val {
  color: #ff4757;
  text-shadow: 0 0 5px rgba(255, 71, 87, 0.3);
}

/* 底部道具栏 */
.props-bar {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 400px;
  display: flex;
  justify-content: space-between;
  z-index: 10;
}

.prop-btn {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.3);
  border: 2px solid rgba(128, 128, 128, 0.5);
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(5px);
}

.prop-btn:active {
  transform: scale(0.9);
}

.prop-btn.disabled {
  opacity: 0.5;
  filter: grayscale(1);
  pointer-events: none;
}

.prop-gained {
  animation: propPop 0.5s ease-out;
}

@keyframes propPop {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 235, 59, 0); }
  50% { transform: scale(1.3); box-shadow: 0 0 20px rgba(255, 235, 59, 0.8); border-color: #ffeb3b; }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 235, 59, 0); }
}

.icon {
  font-size: 1.8rem;
}

.count {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ff4757;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.3);
}

/* 暂停遮罩与菜单 */
.pause-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(5px);
}

.pause-menu {
  background: rgba(255, 255, 255, 0.1);
  padding: 2rem;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 90%;
  max-width: 400px;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.pause-menu h2 {
  text-align: center;
  margin: 0;
  font-size: 1.8rem;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.menu-section h3 {
  font-size: 1rem;
  color: #ccc;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 0.3rem;
}

.menu-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 1.1rem;
  font-weight: bold;
  color: white;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: opacity 0.2s;
}

.menu-btn:hover { opacity: 0.9; }
.menu-btn.primary { background: #4caf50; }
.menu-btn.warning { background: #ff9800; }
.menu-btn.danger { background: #f44336; }

.style-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.style-btn {
  padding: 10px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(0,0,0,0.3);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.style-btn.active {
  background: #2196f3;
  border-color: #64b5f6;
  font-weight: bold;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.mute-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: white;
}

input[type=range] {
  flex: 1;
  accent-color: #2196f3;
}
</style>
